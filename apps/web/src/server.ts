#!/usr/bin/env bun
/**
 * Minimal static host for the marketing site.
 * Serves apps/web/public/* on PORT (default 4100).
 *
 * The homepage will graceful-enhance live counters by fetching
 * the corpus app's /api/corpus/counts on the configured origin.
 */
import { existsSync, readFileSync, statSync } from "node:fs";
import { extname, join, normalize, resolve } from "node:path";

const PORT = Number(process.env.PORT ?? 4100);
const PUBLIC = resolve(import.meta.dir, "..", "public");

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
};

function safeJoin(base: string, sub: string): string | null {
  const target = normalize(join(base, sub));
  if (!target.startsWith(base)) return null;
  return target;
}

Bun.serve({
  port: PORT,
  fetch(req) {
    const url = new URL(req.url);
    let p = decodeURIComponent(url.pathname);
    if (p === "/") p = "/index.html";
    if (p.endsWith("/")) p = p + "index.html";

    const target = safeJoin(PUBLIC, p);
    if (!target || !existsSync(target) || !statSync(target).isFile()) {
      return new Response("Not Found", { status: 404 });
    }

    const body = readFileSync(target);
    const type =
      MIME[extname(target).toLowerCase()] ?? "application/octet-stream";
    return new Response(body, {
      headers: { "content-type": type, "cache-control": "no-cache" },
    });
  },
});

console.log(`agent-feed web listening on http://localhost:${PORT}`);
console.log(`  serving ${PUBLIC}`);
console.log(
  `  homepage will graceful-enhance counters from http://localhost:4300/api/corpus/counts (corpus app)`,
);
