import { test, expect } from "bun:test";
import { mcpRegistryToObservations } from "../src/sources/mcp-registry.ts";
import { a2aRegistryToObservations } from "../src/sources/a2a-registry.ts";
import { readmeToObservations } from "../src/sources/readme.ts";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const RAW = join(import.meta.dir, "..", "phase0", "raw");

test("MCP registry adapter normalizes a real page-0 dump", () => {
  const body = JSON.parse(
    readFileSync(join(RAW, "mcp-registry-page-0.json"), "utf8"),
  );
  const observed = mcpRegistryToObservations(
    body,
    "https://registry.modelcontextprotocol.io/v0/servers",
  );
  expect(observed.length).toBeGreaterThan(50);
  const sample = observed[0]!;
  expect(sample.source).toBe("mcp-registry");
  expect(sample.sourceRecordId).toMatch(/.+/); // non-empty
  expect(sample.origin).toMatch(/^https?:\/\//);
  expect(sample.raw).toBeDefined();
});

test("A2A registry adapter normalizes a real dump", () => {
  const body = JSON.parse(
    readFileSync(
      join(RAW, "a2a-https-a2aregistry-org-api-agents.json"),
      "utf8",
    ),
  );
  const observed = a2aRegistryToObservations(
    body,
    "https://a2aregistry.org/api/agents",
  );
  expect(observed.length).toBeGreaterThan(0);
  const sample = observed[0]!;
  expect(sample.source).toBe("a2a-registry");
  expect(sample.protocolVersion).toMatch(/\d+\.\d+/);
  expect(sample.origin).toMatch(/^https?:\/\//);
});

test("README adapter normalizes a real markdown dump", () => {
  const md = readFileSync(join(RAW, "modelcontextprotocol-servers.md"), "utf8");
  const observed = readmeToObservations(
    md,
    "https://github.com/modelcontextprotocol/servers/blob/main/README.md",
  );
  expect(observed.length).toBeGreaterThan(0);
  const sample = observed[0]!;
  expect(sample.source).toBe("github-readme");
  // README extraction should produce at least a name and a sourceRecordId (the GitHub repo path or URL)
  expect(sample.sourceRecordId).toMatch(/.+/);
});
