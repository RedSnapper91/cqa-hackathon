import hashlib
import ipaddress
import json
import socket
from urllib.parse import urlsplit, urlunsplit, unquote_plus, quote
import httpx
from ..db import uid, now, dump
from ..schemas import DatasetPayload

MAX_BYTES = 20 * 1024 * 1024


def group_url(url, group_id):
    # Retain every signed query byte except the group_id value.
    parts = urlsplit(url)
    if (
        parts.scheme != "https"
        or not parts.hostname
        or parts.username
        or parts.password
    ):
        raise ValueError("Organizer connector requires a configured HTTPS endpoint")
    fields = [
        s
        for s in parts.query.split("&")
        if s and unquote_plus(s.split("=", 1)[0]) != "group_id"
    ]
    fields.append("group_id=" + quote(group_id, safe=""))
    return urlunsplit((parts.scheme, parts.netloc, parts.path, "&".join(fields), ""))


async def fetch_dataset(settings, group_id):
    if not settings.organizer_url:
        raise ValueError("Set ORGANIZER_DEV_API_URL in the backend .env first")
    url = group_url(settings.organizer_url, group_id)
    host = urlsplit(url).hostname
    try:
        addresses = socket.getaddrinfo(host, urlsplit(url).port or 443)
        if not addresses or any(
            not ipaddress.ip_address(a[4][0]).is_global for a in addresses
        ):
            raise ValueError("Organizer host must resolve to public addresses")
        async with httpx.AsyncClient(timeout=35, follow_redirects=False) as client:
            async with client.stream("GET", url) as response:
                if response.status_code != 200:
                    raise ValueError(
                        f"Organizer request returned HTTP {response.status_code}; check credentials/group"
                    )
                chunks = bytearray()
                async for chunk in response.aiter_bytes():
                    chunks.extend(chunk)
                    if len(chunks) > MAX_BYTES:
                        raise ValueError("Dataset exceeds 20 MB limit")
        data = json.loads(chunks)
    except (httpx.HTTPError, OSError, json.JSONDecodeError):
        raise ValueError(
            "Organizer request failed or timed out; verify backend connectivity and credentials"
        ) from None
    return data


def import_dataset(database, payload, source="local", expected_group=None):
    if isinstance(payload, dict) and payload.get("isSuccess") is False:
        raise ValueError(
            "Organizer reported isSuccess=false; verify group and authorization"
        )
    parsed = DatasetPayload.model_validate(payload)
    group = parsed.data.dataset_group_id
    if expected_group and group != expected_group:
        raise ValueError("Returned dataset group differs from requested group")
    inserted = unchanged = 0
    # Original transcripts are immutable. Changed records are rejected atomically,
    # rather than invalidating the IDs used by historical evidence.
    with database.connect(write=True) as db:
        db.execute(
            "INSERT INTO dataset_groups VALUES(?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET imported_at=excluded.imported_at,reported_count=excluded.reported_count,import_status=excluded.import_status",
            (group, source, now(), parsed.data.total_records, "completed"),
        )
        for record in parsed.data.records:
            original = record.model_dump()
            fingerprint = hashlib.sha256(dump(original).encode()).hexdigest()
            old = db.execute(
                "SELECT id,content_hash FROM conversations WHERE group_id=? AND external_id=?",
                (group, record.conversation_id),
            ).fetchone()
            if old:
                if old["content_hash"] != fingerprint:
                    raise ValueError(
                        "An existing conversation has changed. Import it under a new dataset group to preserve audit history."
                    )
                unchanged += 1
                continue
            cid = uid("conv")
            db.execute(
                "INSERT INTO conversations VALUES(?,?,?,?,?,?,?,?,?)",
                (
                    cid,
                    group,
                    record.conversation_id,
                    record.language,
                    record.channel,
                    record.audio_url,
                    now(),
                    dump(original),
                    fingerprint,
                ),
            )
            for index, message in enumerate(record.transcript):
                db.execute(
                    "INSERT INTO messages VALUES(?,?,?,?,?,?)",
                    (
                        f"{cid}:m{index + 1:04d}",
                        cid,
                        index,
                        message.timestamp,
                        message.speaker,
                        message.text,
                    ),
                )
            inserted += 1
    return {
        "group_id": group,
        "inserted": inserted,
        "unchanged": unchanged,
        "total_records": parsed.data.total_records,
    }
