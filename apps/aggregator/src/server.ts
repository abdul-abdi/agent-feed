#!/usr/bin/env bun
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Aggregator } from "./aggregator.ts";
import { crawlOrigin, crawlAll } from "./crawler.ts";
import { lintRemote } from "../../../src/index.ts";

const PORT = Number(process.env.PORT ?? 4200);
const DB_PATH = process.env.DB_PATH ?? "agent-feed-aggregator.sqlite";
const SEED_ORIGINS = (process.env.SEED_ORIGINS ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const agg = new Aggregator(DB_PATH);

const PUBLIC = join(import.meta.dir, "..", "public");

if (SEED_ORIGINS.length) {
  console.log(`Crawling seed origins: ${SEED_ORIGINS.join(", ")}`);
  const results = await crawlAll(agg, SEED_ORIGINS);
  for (const r of results) {
    console.log(
      `  ${r.ok ? "✓" : "✗"} ${r.origin}${r.ok ? ` (${r.verifiedEntries} entries)` : `: ${r.error}`}`,
    );
  }
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { "content-type": "application/json" },
  });
}

const indexHtml = readFileSync(join(PUBLIC, "index.html"));

Bun.serve({
  port: PORT,
  async fetch(req) {
    const url = new URL(req.url);

    // ----- Web UI -----
    if (
      req.method === "GET" &&
      (url.pathname === "/" || url.pathname === "/index.html")
    ) {
      return new Response(indexHtml, {
        headers: { "content-type": "text/html; charset=utf-8" },
      });
    }

    // ----- Search -----
    if (req.method === "GET" && url.pathname === "/api/search") {
      const opts = {
        q: url.searchParams.get("q") ?? undefined,
        type: (url.searchParams.get("type") as any) ?? undefined,
        endpointId: url.searchParams.get("endpointId") ?? undefined,
        origin: url.searchParams.get("origin") ?? undefined,
        since: url.searchParams.get("since") ?? undefined,
        until: url.searchParams.get("until") ?? undefined,
        limit: url.searchParams.has("limit")
          ? Number(url.searchParams.get("limit"))
          : undefined,
      };
      try {
        return json({ hits: agg.search(opts) });
      } catch (err) {
        return json(
          { error: err instanceof Error ? err.message : String(err) },
          400,
        );
      }
    }

    // ----- Origins listing -----
    if (req.method === "GET" && url.pathname === "/api/origins") {
      return json({ origins: agg.listOrigins() });
    }

    // ----- Origin stats -----
    if (req.method === "GET" && url.pathname.startsWith("/api/origins/")) {
      const origin = decodeURIComponent(
        url.pathname.slice("/api/origins/".length),
      );
      const stats = agg.statsForOrigin(origin);
      if (!stats) return json({ error: "unknown origin" }, 404);
      return json(stats);
    }

    // ----- Submit a new origin to crawl -----
    if (req.method === "POST" && url.pathname === "/api/crawl") {
      const body = (await req.json()) as { origin?: string };
      if (!body.origin) return json({ error: "missing origin" }, 400);
      const result = await crawlOrigin(agg, body.origin);
      return json(result, result.ok ? 200 : 502);
    }

    // ----- Lint a remote feed (proxy through to lint module) -----
    if (req.method === "GET" && url.pathname === "/api/lint") {
      const origin = url.searchParams.get("origin");
      if (!origin) return json({ error: "missing origin" }, 400);
      const report = await lintRemote(origin);
      return json(report, report.ok ? 200 : 422);
    }

    return new Response("Not Found", { status: 404 });
  },
});

console.log(`agent-feed-aggregator listening on http://localhost:${PORT}`);
console.log(`  GET  /                    web UI`);
console.log(`  GET  /api/search?q=...    full-text + structured search`);
console.log(`  GET  /api/origins         list crawled origins`);
console.log(`  GET  /api/origins/<url>   per-origin stats`);
console.log(`  POST /api/crawl           {origin} → crawl now`);
console.log(`  GET  /api/lint?origin=... conformance check`);
