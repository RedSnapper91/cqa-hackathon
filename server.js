// Existing team UI + compatibility API gateway to FastAPI. No local scoring/storage.
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { BackendClient, BackendError } from "./lib/backend-client.js";
import { parseTextTranscript } from "./lib/dataset.js";
const ROOT = path.dirname(fileURLToPath(import.meta.url));
const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
};
const json = (res, status, data) => {
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
  });
  res.end(JSON.stringify(data));
};
async function readBody(req) {
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 20 * 1024 * 1024)
      throw new BackendError(413, "Maximum JSON body is 20 MB");
    chunks.push(chunk);
  }
  try {
    return chunks.length
      ? JSON.parse(Buffer.concat(chunks).toString("utf8"))
      : {};
  } catch {
    throw new BackendError(422, "Request body must be JSON");
  }
}
export function uploadPayload(body) {
  if (body.payload?.isSuccess === false)
    throw new BackendError(
      422,
      `File contains a failed API response: ${body.payload.error || "isSuccess = false"}`,
    );
  if (body.payload?.data?.records) return body.payload;
  let records;
  if (body.text) {
    const transcript = parseTextTranscript(body.text);
    records = [
      {
        conversation_id: body.conversation_id || "upload-" + Date.now(),
        language: body.language || "RU",
        channel: body.channel || "agent chat",
        audio_url: body.audio_url || null,
        transcript,
      },
    ];
  } else if (Array.isArray(body.payload)) records = body.payload;
  else if (Array.isArray(body.payload?.records)) records = body.payload.records;
  else if (body.payload?.conversation_id) records = [body.payload];
  else
    throw new BackendError(
      422,
      "Upload organizer-format JSON or a timestamped transcript",
    );
  return {
    error: "",
    isSuccess: true,
    data: {
      dataset_group_id: body.group_id || "UPLOAD",
      total_records: records.length,
      records,
    },
  };
}
export function createGateway({ backend = new BackendClient() } = {}) {
  return http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, "http://localhost");
      const pathname = decodeURIComponent(url.pathname);
      if (pathname.startsWith("/api/")) {
        const body = req.method === "POST" ? await readBody(req) : undefined;
        let result, match;
        if (req.method === "GET" && pathname === "/api/health")
          result = await backend.health();
        else if (req.method === "GET" && pathname === "/api/stats")
          result = await backend.stats();
        else if (req.method === "GET" && pathname === "/api/conversations")
          result = await backend.list();
        else if (
          req.method === "GET" &&
          (match = pathname.match(/^\/api\/conversations\/([^/]+)$/))
        )
          result = await backend.conversation(match[1]);
        else if (req.method === "GET" && pathname === "/api/checklists")
          result = await backend.checklists();
        else if (req.method === "POST" && pathname === "/api/checklists")
          result = await backend.saveChecklist(body);
        else if (
          req.method === "POST" &&
          (match = pathname.match(/^\/api\/checklists\/([^/]+)\/activate$/))
        ) {
          await backend.request("/api/preferences/checklist", "POST", {
            checklist_version_id: match[1],
          });
          result = { ok: true };
        } else if (req.method === "POST" && pathname === "/api/datasets/load") {
          const r = await backend.request("/api/datasets/import", "POST", {
            group_id: body.group_id,
          });
          result = {
            group_id: r.group_id,
            total: r.total_records,
            added: r.inserted,
          };
        } else if (
          req.method === "POST" &&
          pathname === "/api/conversations/upload"
        )
          result = await backend.upload(uploadPayload(body));
        else if (
          req.method === "GET" &&
          (match = pathname.match(/^\/api\/audio\/([^/]+)$/))
        ) {
          const c = await backend.request(
            "/api/conversations/" + encodeURIComponent(match[1]),
          );
          result = {
            src: c.audio_url,
            player_url: c.audio_url,
            alignment_known: false,
          };
        } else if (req.method === "POST" && pathname === "/api/evaluate")
          result = await backend.evaluate(body);
        else if (
          req.method === "GET" &&
          (match = pathname.match(/^\/api\/jobs\/([^/]+)$/))
        )
          result = await backend.job(match[1]);
        else if (req.method === "GET" && pathname === "/api/appeals")
          result = await backend.appeals();
        else if (
          req.method === "POST" &&
          (match = pathname.match(/^\/api\/evaluations\/([^/]+)\/appeals$/))
        )
          result = await backend.appeal(match[1], body);
        else if (
          req.method === "POST" &&
          (match = pathname.match(/^\/api\/appeals\/([^/]+)\/decision$/))
        )
          result = await backend.decide(match[1], body);
        else if (req.method === "GET" && pathname === "/api/export.csv") {
          const { conversations } = await backend.list();
          const rows = [
            [
              "conversation_id",
              "group_id",
              "language",
              "channel",
              "original",
              "final",
              "gross_error",
              "version",
            ],
            ...conversations.map((c) => [
              c.external_id,
              c.group_id,
              c.language,
              c.channel,
              c.evaluation?.total ?? "",
              c.evaluation?.final_total ?? "",
              c.evaluation?.gross_error ?? "",
              c.evaluation?.checklist_version ?? "",
            ]),
          ];
          const quote = (value) =>
            '"' +
            String(value)
              .replace(/^[=+@-]/, "'$&")
              .replaceAll('"', '""') +
            '"';
          res.writeHead(200, {
            "content-type": "text/csv; charset=utf-8",
            "content-disposition": 'attachment; filename="cqa-results.csv"',
            "cache-control": "no-store",
          });
          res.end(
            "\uFEFF" + rows.map((r) => r.map(quote).join(";")).join("\r\n"),
          );
          return;
        } else if (["GET", "POST"].includes(req.method))
          result = await backend.request(
            url.pathname + url.search,
            req.method,
            body,
          );
        else throw new BackendError(405, "Method not allowed");
        json(res, 200, result);
        return;
      }
      if (!["GET", "HEAD"].includes(req.method))
        throw new BackendError(405, "Method not allowed");
      const publicRoot = path.join(ROOT, "public");
      const file =
        pathname === "/lib/scoring.js"
          ? path.join(ROOT, "lib/scoring.js")
          : path.resolve(
              publicRoot,
              "." + (pathname === "/" ? "/index.html" : pathname),
            );
      if (
        pathname !== "/lib/scoring.js" &&
        !file.startsWith(publicRoot + path.sep)
      )
        throw new BackendError(403, "Forbidden");
      const stat = await fs.promises.stat(file).catch(() => null);
      if (!stat?.isFile()) throw new BackendError(404, "File not found");
      res.writeHead(200, {
        "content-type": MIME[path.extname(file)] || "application/octet-stream",
        "cache-control": "no-cache",
        "x-content-type-options": "nosniff",
      });
      if (req.method === "HEAD") res.end();
      else fs.createReadStream(file).pipe(res);
    } catch (error) {
      json(res, error instanceof BackendError ? error.status : 500, {
        error:
          error instanceof BackendError
            ? error.message
            : "Gateway request failed; check the local backend setup.",
      });
    }
  });
}
if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const index = process.argv.indexOf("--port");
  const port = Number(
    index > 0 ? process.argv[index + 1] : process.env.PORT || 3210,
  );
  createGateway().listen(port, "127.0.0.1", () =>
    console.log(
      `CQA team frontend: http://127.0.0.1:${port} · API gateway → FastAPI`,
    ),
  );
}
