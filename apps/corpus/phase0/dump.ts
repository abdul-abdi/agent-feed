#!/usr/bin/env bun
/**
 * Phase 0 — the Karpathy stare.
 *
 * Goal: dump real rows from real public sources, save raw bytes, then read them
 * before designing any normalized schema.
 *
 * Sources, ordered by consent posture (per the post-roundtable decision):
 *   1. MCP official registry — public REST API, RFC 3339 filtering, explicitly published-for-consumption.
 *   2. awesome-mcp-servers (punkpeye) README — public GitHub, maintainer-signaled "share me".
 *   3. modelcontextprotocol/servers — official server catalog README.
 *   4. A2A Registry — public registry, attempt API; if not exposed, dump the homepage we can see.
 *
 * Out of scope for Phase 0 (consent invariant): Smithery, Glama, mcpmarket — written permission first.
 */

import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

const RAW = join(import.meta.dir, "raw");
await mkdir(RAW, { recursive: true });

const UA =
  "agent-corpus-phase0/0.0 (+https://github.com/abdullahiabdi/agent-feed; abdullahiabdi1233@gmail.com)";

async function get(
  url: string,
  accept = "application/json",
): Promise<Response> {
  return fetch(url, { headers: { "user-agent": UA, accept } });
}

async function dumpMcpRegistry(): Promise<{ count: number }> {
  console.log("→ MCP registry...");
  let cursor: string | undefined;
  let page = 0;
  let total = 0;
  while (page < 5) {
    const url = new URL("https://registry.modelcontextprotocol.io/v0/servers");
    url.searchParams.set("limit", "100");
    if (cursor) url.searchParams.set("cursor", cursor);
    const res = await get(url.toString());
    if (!res.ok) {
      console.log(`  page ${page} → ${res.status}; stopping`);
      break;
    }
    const body = (await res.json()) as {
      servers: any[];
      metadata?: { nextCursor?: string; count?: number };
    };
    await writeFile(
      join(RAW, `mcp-registry-page-${page}.json`),
      JSON.stringify(body, null, 2),
    );
    total += body.servers?.length ?? 0;
    cursor = body.metadata?.nextCursor;
    page += 1;
    if (!cursor) break;
  }
  console.log(`  ${total} servers across ${page} pages`);
  return { count: total };
}

async function dumpAwesomeMcpReadme(): Promise<{ bytes: number }> {
  console.log("→ awesome-mcp-servers (punkpeye) README...");
  const res = await get(
    "https://raw.githubusercontent.com/punkpeye/awesome-mcp-servers/main/README.md",
    "text/markdown",
  );
  if (!res.ok) {
    console.log(`  ${res.status}; skip`);
    return { bytes: 0 };
  }
  const text = await res.text();
  await writeFile(join(RAW, "awesome-mcp-servers-punkpeye.md"), text);
  console.log(`  ${text.length} bytes`);
  return { bytes: text.length };
}

async function dumpOfficialServersReadme(): Promise<{ bytes: number }> {
  console.log("→ modelcontextprotocol/servers README...");
  const res = await get(
    "https://raw.githubusercontent.com/modelcontextprotocol/servers/main/README.md",
    "text/markdown",
  );
  if (!res.ok) {
    console.log(`  ${res.status}; skip`);
    return { bytes: 0 };
  }
  const text = await res.text();
  await writeFile(join(RAW, "modelcontextprotocol-servers.md"), text);
  console.log(`  ${text.length} bytes`);
  return { bytes: text.length };
}

async function dumpA2aRegistry(): Promise<{ tried: string[]; ok: string[] }> {
  console.log("→ A2A registry (probing)...");
  const candidates = [
    "https://a2aregistry.org/api/agents",
    "https://a2aregistry.org/agents.json",
    "https://www.a2a-registry.org/api/agents",
    "https://a2a-registry.org/api/agents",
    "https://raw.githubusercontent.com/prassanna-ravishankar/a2a-registry/main/README.md",
    "https://raw.githubusercontent.com/prassanna-ravishankar/a2a-registry/main/agents/index.json",
  ];
  const tried: string[] = [];
  const ok: string[] = [];
  for (const c of candidates) {
    tried.push(c);
    const res = await get(c).catch(() => null);
    if (!res || !res.ok) continue;
    const ct = res.headers.get("content-type") ?? "";
    const text = await res.text();
    const slug = c.replace(/[^a-z0-9]+/gi, "-").slice(0, 60);
    const ext = ct.includes("json") || c.endsWith(".json") ? "json" : "txt";
    await writeFile(join(RAW, `a2a-${slug}.${ext}`), text);
    ok.push(c);
    console.log(`  ✓ ${c} (${text.length} bytes, ${ct})`);
  }
  return { tried, ok };
}

const start = Date.now();
const [mcp, awesome, official, a2a] = await Promise.all([
  dumpMcpRegistry().catch((e) => ({ count: 0, error: String(e) })),
  dumpAwesomeMcpReadme().catch((e) => ({ bytes: 0, error: String(e) })),
  dumpOfficialServersReadme().catch((e) => ({ bytes: 0, error: String(e) })),
  dumpA2aRegistry().catch((e) => ({ tried: [], ok: [], error: String(e) })),
]);

const summary = {
  ranAt: new Date().toISOString(),
  durationMs: Date.now() - start,
  mcpRegistry: mcp,
  awesomeMcpReadme: awesome,
  officialServersReadme: official,
  a2aRegistry: a2a,
};
await writeFile(join(RAW, "_summary.json"), JSON.stringify(summary, null, 2));
console.log(`\n--- summary ---`);
console.log(JSON.stringify(summary, null, 2));
