import { test, expect } from "bun:test";
import { lintFeed, type LintReport } from "../src/lint.ts";
import {
  generateKeypair,
  didDocumentFromKeypair,
  buildFeed,
  type Entry,
  type DidDocument,
} from "../src/index.ts";

const ORIGIN = "https://lint.example";

async function makeFeed(
  entries: Entry[],
  opts: {
    feedStatus?: "active" | "terminated" | "migrated";
    specVersion?: number;
  } = {},
): Promise<{ xml: string; didDoc: DidDocument }> {
  const kp = await generateKeypair();
  const didDoc = didDocumentFromKeypair(ORIGIN, kp);
  const xml = await buildFeed({
    feedId: didDoc.id,
    title: "lint",
    updated: "2026-04-27T12:00:00Z",
    feedStatus: opts.feedStatus ?? "active",
    specVersion: opts.specVersion ?? 0,
    entries,
    keypair: kp,
  });
  return { xml, didDoc };
}

test("lint returns ok when feed is well-formed and all entries verify", async () => {
  const { xml, didDoc } = await makeFeed([
    {
      id: "1",
      type: "endpoint-announcement",
      updated: "2026-04-27T12:00:00Z",
      payload: {
        "asserted-at": "2026-04-27T12:00:00Z",
        endpoint: "/api/orders",
        "endpoint-id": "orders-api",
        protocol: "rest",
        version: "1.0",
      },
    },
  ]);
  const report: LintReport = await lintFeed({ xml, didDocument: didDoc });
  expect(report.ok).toBe(true);
  expect(report.errors).toHaveLength(0);
  expect(report.verifiedEntries).toBe(1);
  expect(report.totalEntries).toBe(1);
});

test("lint flags spec-version mismatch as error", async () => {
  const { xml, didDoc } = await makeFeed([], { specVersion: 99 });
  const report = await lintFeed({ xml, didDocument: didDoc });
  expect(report.ok).toBe(false);
  expect(report.errors.some((e) => e.code === "unsupported-spec-version")).toBe(
    true,
  );
});

test("lint flags unverified entries as error", async () => {
  const kp1 = await generateKeypair();
  const kp2 = await generateKeypair();
  const xml = await buildFeed({
    feedId: didDocumentFromKeypair(ORIGIN, kp1).id,
    title: "lint",
    updated: "2026-04-27T12:00:00Z",
    feedStatus: "active",
    specVersion: 0,
    entries: [
      {
        id: "1",
        type: "endpoint-announcement",
        updated: "2026-04-27T12:00:00Z",
        payload: {
          "asserted-at": "2026-04-27T12:00:00Z",
          endpoint: "/x",
          "endpoint-id": "x",
          protocol: "rest",
          version: "1.0",
        },
      },
    ],
    keypair: kp1,
  });
  const wrongDoc = didDocumentFromKeypair(ORIGIN, kp2);
  const report = await lintFeed({ xml, didDocument: wrongDoc });
  expect(report.ok).toBe(false);
  expect(report.verifiedEntries).toBe(0);
  expect(report.errors.some((e) => e.code === "unverified-entry")).toBe(true);
});

test("lint warns on terminated feed but does not error", async () => {
  const { xml, didDoc } = await makeFeed([], { feedStatus: "terminated" });
  const report = await lintFeed({ xml, didDocument: didDoc });
  expect(report.errors).toHaveLength(0);
  expect(report.warnings.some((w) => w.code === "feed-terminated")).toBe(true);
});

test("lint flags duplicate entry ids as error", async () => {
  const dup: Entry = {
    id: "duplicate-id",
    type: "endpoint-announcement",
    updated: "2026-04-27T12:00:00Z",
    payload: {
      "asserted-at": "2026-04-27T12:00:00Z",
      endpoint: "/x",
      "endpoint-id": "x",
      protocol: "rest",
      version: "1.0",
    },
  };
  const { xml, didDoc } = await makeFeed([
    dup,
    { ...dup, payload: { ...dup.payload, version: "2.0" } },
  ]);
  const report = await lintFeed({ xml, didDocument: didDoc });
  expect(report.errors.some((e) => e.code === "duplicate-entry-id")).toBe(true);
});
