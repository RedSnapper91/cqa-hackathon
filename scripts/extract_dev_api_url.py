"""Extract PDF endpoint into an ignored .env without printing its credential."""

import argparse
from pathlib import Path
from pypdf import PdfReader

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("pdf", type=Path)
args = parser.parse_args()
root = Path(__file__).resolve().parents[1]
links = []
for page in PdfReader(args.pdf).pages:
    for annotation in page.get("/Annots", []):
        action = annotation.get_object().get("/A", {})
        uri = action.get("/URI", "")
        if uri.startswith("https://") and "sig=" in uri and "group_id=" in uri:
            links.append(uri)
if not links:
    raise SystemExit(
        "Signed DEV hyperlink not found. Set ORGANIZER_DEV_API_URL manually in .env."
    )
path = root / ".env"
lines = path.read_text().splitlines() if path.exists() else []
if any(
    line.startswith("ORGANIZER_DEV_API_URL=") and line.split("=", 1)[1].strip()
    for line in lines
):
    raise SystemExit(
        "An organizer endpoint is already configured; existing value was preserved."
    )
lines = [line for line in lines if not line.startswith("ORGANIZER_DEV_API_URL=")]
lines.append("ORGANIZER_DEV_API_URL=" + links[0])
path.write_text("\n".join(lines) + "\n")
path.chmod(0o600)
print("Stored organizer endpoint in ignored .env; credential is not printed.")
