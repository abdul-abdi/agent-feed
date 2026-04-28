#!/usr/bin/env bun
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Corpus, type Source } from "./corpus.ts";
import { crawlAll } from "./crawl.ts";
import { divergencesForOrigin } from "./divergence.ts";
import { draftEndpointAnnouncement } from "./draft.ts";

const PORT = Number(process.env.PORT ?? 4300);
const DB_PATH = process.env.DB_PATH ?? "agent-corpus.sqlite";

const corpus = new Corpus(DB_PATH);

const PUBLIC = join(import.meta.dir, "..", "public");
const indexHtml = readFileSync(join(PUBLIC, "index.html"));

if (process.env.SEED === "1") {
  console.log("Seeding corpus from real sources...");
  const summaries = await crawlAll(corpus);
  for (const s of summaries) {
    console.log(
      `  ${s.source}: ingested=${s.ingested} blocked=${s.blockedByOptout} errors=${s.errors}`,
    );
  }
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function normalizeOrigin(input: string): string {
  const s = input.trim();
  if (!s) return "";
  // GitHub repo URL: keep /<owner>/<repo>
  const ghMatch = s.match(/^https?:\/\/github\.com\/([^/\s]+)\/([^/#?\s]+)/);
  if (ghMatch)
    return `https://github.com/${ghMatch[1]}/${ghMatch[2]!.replace(/\.git$/, "")}`;
  // Otherwise: take origin (protocol + host)
  try {
    const u = new URL(s.startsWith("http") ? s : `https://${s}`);
    return `${u.protocol}//${u.host}`;
  } catch {
    return s;
  }
}

Bun.serve({
  port: PORT,
  async fetch(req) {
    const url = new URL(req.url);

    // ----- web UI -----
    if (
      req.method === "GET" &&
      (url.pathname === "/" || url.pathname === "/index.html")
    ) {
      return new Response(indexHtml, {
        headers: { "content-type": "text/html; charset=utf-8" },
      });
    }

    // ----- normalize a user-supplied URL into a canonical origin -----
    if (req.method === "GET" && url.pathname === "/api/corpus/normalize") {
      const input = url.searchParams.get("input") ?? "";
      return json({ input, origin: normalizeOrigin(input) });
    }

    // ----- draft an endpoint-announcement from the corpus -----
    if (req.method === "GET" && url.pathname === "/api/corpus/draft") {
      const origin = url.searchParams.get("origin");
      if (!origin) return json({ error: "missing origin" }, 400);
      const draft = draftEndpointAnnouncement(corpus, origin);
      if (!draft) return json({ error: "no observations for origin" }, 404);
      return json(draft);
    }

    // ----- corpus search -----
    if (req.method === "GET" && url.pathname === "/api/corpus/search") {
      const opts = {
        q: url.searchParams.get("q") ?? undefined,
        source: (url.searchParams.get("source") as Source | null) ?? undefined,
        origin: url.searchParams.get("origin") ?? undefined,
        since: url.searchParams.get("since") ?? undefined,
        limit: url.searchParams.has("limit")
          ? Number(url.searchParams.get("limit"))
          : undefined,
      };
      try {
        return json({ hits: corpus.search(opts) });
      } catch (err) {
        return json(
          { error: err instanceof Error ? err.message : String(err) },
          400,
        );
      }
    }

    // ----- divergence for an origin -----
    if (req.method === "GET" && url.pathname === "/api/divergence") {
      const origin = url.searchParams.get("origin");
      if (!origin) return json({ error: "missing origin" }, 400);
      return json({
        origin,
        divergences: divergencesForOrigin(corpus, origin),
      });
    }

    // ----- per-origin observations -----
    if (req.method === "GET" && url.pathname === "/api/corpus/origin") {
      const origin = url.searchParams.get("origin");
      if (!origin) return json({ error: "missing origin" }, 400);
      return json({
        origin,
        observations: corpus.listForOrigin(origin),
        divergences: divergencesForOrigin(corpus, origin),
      });
    }

    // ----- counts by source -----
    if (req.method === "GET" && url.pathname === "/api/corpus/counts") {
      return json({ counts: corpus.countsBySource() });
    }

    // ----- opt-out endpoint (publisher self-service) -----
    if (req.method === "POST" && url.pathname === "/api/corpus/optout") {
      const body = (await req.json()) as { origin?: string };
      if (!body.origin) return json({ error: "missing origin" }, 400);
      corpus.optOut(body.origin);
      return json({ origin: body.origin, optedOut: true });
    }

    // ----- crawl trigger -----
    if (req.method === "POST" && url.pathname === "/api/corpus/crawl") {
      const summaries = await crawlAll(corpus);
      return json({ summaries });
    }

    return new Response("Not Found", { status: 404 });
  },
});

console.log(`agent-corpus listening on http://localhost:${PORT}`);
console.log(`  GET  /api/corpus/search?q=&source=&origin=&since=&limit=`);
console.log(
  `  GET  /api/corpus/origin?origin=...   per-origin observations + divergences`,
);
console.log(`  GET  /api/corpus/counts              by-source counts`);
console.log(`  GET  /api/divergence?origin=...      cross-source divergences`);
console.log(`  POST /api/corpus/crawl               trigger crawl now`);
console.log(
  `  POST /api/corpus/optout              {origin} → opt-out invariant`,
);
