// Cross-platform launcher. All application data and credentials stay in FastAPI.
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const python = path.join(
  root,
  ".venv",
  process.platform === "win32" ? "Scripts/python.exe" : "bin/python",
);
const children = [];
let stopping = false;
function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  for (const child of children) child.kill();
  setTimeout(() => process.exit(code), 250).unref();
}
process.on("SIGINT", () => stop());
process.on("SIGTERM", () => stop());
function start(command, args) {
  const child = spawn(command, args, {
    cwd: root,
    stdio: "inherit",
    env: process.env,
  });
  children.push(child);
  child.on("error", () => {
    console.error(
      "Could not start application process. Run the setup commands in README.",
    );
    stop(1);
  });
  child.on("exit", (code) => {
    if (!stopping) stop(code || 0);
  });
  return child;
}
async function health(base) {
  try {
    const response = await fetch(new URL("/api/config/status", base), {
      signal: AbortSignal.timeout(1000),
    });
    return (
      response.ok && typeof (await response.json()).llm_configured === "boolean"
    );
  } catch {
    return false;
  }
}
const backend = process.env.CQA_BACKEND_URL || "http://127.0.0.1:8000";
if (!process.env.CQA_BACKEND_URL && !(await health(backend))) {
  if (!fs.existsSync(python)) {
    console.error(
      "Virtual environment missing. Run python3 -m venv .venv and install backend/requirements.txt.",
    );
    process.exit(1);
  }
  start(python, [
    "-m",
    "uvicorn",
    "backend.app.main:app",
    "--host",
    "127.0.0.1",
    "--port",
    "8000",
  ]);
  for (let attempt = 0; attempt < 100; attempt++) {
    if (stopping) process.exit(1);
    if (await health(backend)) break;
    if (attempt === 99) {
      console.error("FastAPI backend did not become healthy.");
      stop(1);
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
}
if (!stopping) start(process.execPath, ["server.js"]);
