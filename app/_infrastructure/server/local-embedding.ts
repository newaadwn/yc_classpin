import { spawn, type ChildProcess } from "node:child_process";
import { createReadStream } from "node:fs";
import { access } from "node:fs/promises";
import { createHash } from "node:crypto";
import { createServer } from "node:net";
import os from "node:os";
import path from "node:path";

/** Qwen3-Embedding-0.6B (Apache-2.0), pinned revision and checksum. Downloaded by tmp/start-local-dev.ps1. */
export const EMBEDDING_MODEL = {
  name: "Qwen3-Embedding-0.6B · Q8_0",
  source: "Qwen/Qwen3-Embedding-0.6B-GGUF",
  revision: "370f27d7550e0def9b39c1f16d3fbaa13aa67728",
  file: "Qwen3-Embedding-0.6B-Q8_0.gguf",
  sha256: "06507c7b42688469c4e7298b0a1e16deff06caf291cf0a5b278c308249c3e439",
} as const;

export class EmbeddingUnavailableError extends Error {}

type Runtime = { child: ChildProcess; url: string; idle?: ReturnType<typeof setTimeout> };
const state = globalThis as typeof globalThis & {
  localEmbedding?: { runtime?: Runtime; starting?: Promise<Runtime>; verified?: boolean; failedAt?: number; failure?: string };
};
const pool = state.localEmbedding ?? (state.localEmbedding = {});
const IDLE_MS = 20 * 60_000;
const RETRY_AFTER_FAILURE_MS = 60_000;

const modelPath = () => path.join(os.homedir(), ".cache", "huggingface", "hub", `models--${EMBEDDING_MODEL.source.replace("/", "--")}`, "snapshots", EMBEDDING_MODEL.revision, EMBEDDING_MODEL.file);
const serverPath = () => path.join(process.env.LOCALAPPDATA ?? "", "Microsoft", "WinGet", "Packages", "ggml.llamacpp_Microsoft.Winget.Source_8wekyb3d8bbwe", "llama-server.exe");

function sha256File(file: string) {
  return new Promise<string>((resolve, reject) => {
    const hash = createHash("sha256");
    createReadStream(file).on("data", (chunk) => hash.update(chunk)).on("error", reject).on("end", () => resolve(hash.digest("hex")));
  });
}

function freePort() {
  return new Promise<number>((resolve, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      server.close(() => typeof address === "object" && address ? resolve(address.port) : reject(new Error("PORT")));
    });
  });
}

async function waitForHealth(url: string, child: ChildProcess, timeoutMs = 60_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new EmbeddingUnavailableError("EMBEDDING_SERVER_EXITED");
    try {
      const response = await fetch(`${url}/health`, { signal: AbortSignal.timeout(1000) });
      if (response.ok) return;
    } catch { /* still loading */ }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new EmbeddingUnavailableError("EMBEDDING_SERVER_TIMEOUT");
}

async function startRuntime(): Promise<Runtime> {
  if (process.platform !== "win32") throw new EmbeddingUnavailableError("EMBEDDING_WINDOWS_ONLY");
  const model = modelPath();
  const server = serverPath();
  try { await Promise.all([access(model), access(server)]); } catch { throw new EmbeddingUnavailableError("EMBEDDING_MODEL_MISSING"); }
  if (!pool.verified) {
    if (await sha256File(model) !== EMBEDDING_MODEL.sha256) throw new EmbeddingUnavailableError("EMBEDDING_MODEL_CHECKSUM");
    pool.verified = true;
  }
  const port = await freePort();
  const url = `http://127.0.0.1:${port}`;
  const child = spawn(/* turbopackIgnore: true */ server, [
    "-m", model, "--embedding", "--pooling", "last", "--host", "127.0.0.1", "--port", String(port),
    "-c", "8192", "-b", "8192", "-ub", "8192", "-np", "1", "-t", "4", "-ngl", "0", "--no-warmup",
  ], { windowsHide: true, stdio: "ignore" });
  child.once("exit", () => { if (pool.runtime?.child === child) pool.runtime = undefined; });
  process.once("exit", () => { if (child.exitCode === null) child.kill(); });
  try { await waitForHealth(url, child); } catch (error) { child.kill(); throw error; }
  return { child, url };
}

async function runtime(): Promise<Runtime> {
  if (pool.runtime && pool.runtime.child.exitCode === null) return pool.runtime;
  if (pool.failedAt && Date.now() - pool.failedAt < RETRY_AFTER_FAILURE_MS) throw new EmbeddingUnavailableError(pool.failure ?? "EMBEDDING_UNAVAILABLE");
  pool.starting ??= startRuntime().then((value) => { pool.runtime = value; pool.failedAt = undefined; return value; }).catch((error) => {
    pool.failedAt = Date.now();
    pool.failure = error instanceof Error ? error.message : "EMBEDDING_UNAVAILABLE";
    throw error instanceof EmbeddingUnavailableError ? error : new EmbeddingUnavailableError(pool.failure);
  }).finally(() => { pool.starting = undefined; });
  return pool.starting;
}

function touch(current: Runtime) {
  if (current.idle) clearTimeout(current.idle);
  current.idle = setTimeout(() => { if (current.child.exitCode === null) current.child.kill(); }, IDLE_MS);
  current.idle.unref?.();
}

/** 로컬 llama.cpp 임베딩 서버로 문장 벡터(L2 정규화)를 만든다. 외부 API 는 쓰지 않는다. */
export async function embedTexts(texts: string[], timeoutMs = 120_000): Promise<number[][]> {
  if (!texts.length) return [];
  const current = await runtime();
  touch(current);
  const vectors: number[][] = [];
  for (let index = 0; index < texts.length; index += 32) {
    const batch = texts.slice(index, index + 32).map((text) => [...text].slice(0, 1200).join(""));
    const response = await fetch(`${current.url}/v1/embeddings`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: "local", input: batch, encoding_format: "float" }),
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!response.ok) throw new EmbeddingUnavailableError(`EMBEDDING_HTTP_${response.status}`);
    const data = await response.json() as { data?: Array<{ index: number; embedding: number[] }> };
    const rows = [...(data.data ?? [])].sort((a, b) => a.index - b.index);
    if (rows.length !== batch.length) throw new EmbeddingUnavailableError("EMBEDDING_SHAPE");
    for (const row of rows) {
      const norm = Math.hypot(...row.embedding) || 1;
      vectors.push(row.embedding.map((value) => value / norm));
    }
  }
  return vectors;
}

export function embeddingStatus(): "ready" | "starting" | "unavailable" | "idle" {
  if (pool.runtime && pool.runtime.child.exitCode === null) return "ready";
  if (pool.starting) return "starting";
  if (pool.failedAt && Date.now() - pool.failedAt < RETRY_AFTER_FAILURE_MS) return "unavailable";
  return "idle";
}

export const cosine = (a: readonly number[], b: readonly number[]) => {
  let sum = 0;
  for (let index = 0; index < Math.min(a.length, b.length); index += 1) sum += a[index] * b[index];
  return sum;
};
