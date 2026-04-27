import { test, expect } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  Reader,
  parseFeed,
  parseSnapshot,
  type DidDocument,
} from "../src/index.ts";

const VECTORS_DIR = join(import.meta.dir, "vectors");

interface VectorManifest {
  name: string;
  description: string;
  kind: "feed" | "snapshot";
  // For feeds:
  expect?: {
    feedStatus?: "active" | "terminated" | "migrated";
    verifiedEntryCount?: number;
    canonicalEndpoint?: { protocol: string; expected: string | null };
    schemaVersion?: { endpointId: string; expected: string };
    mismatchOnLiveResponse?: {
      endpointId: string;
      body: Record<string, unknown>;
      expectedFallback: string | null;
    };
  };
}

function loadVectors(): Array<{ dir: string; manifest: VectorManifest }> {
  return readdirSync(VECTORS_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => ({
      dir: join(VECTORS_DIR, d.name),
      manifest: JSON.parse(
        readFileSync(join(VECTORS_DIR, d.name, "manifest.json"), "utf8"),
      ),
    }));
}

test("at least 5 conformance vectors are present", () => {
  expect(loadVectors().length).toBeGreaterThanOrEqual(5);
});

for (const { dir, manifest } of loadVectors()) {
  test(`vector: ${manifest.name}`, async () => {
    const didDoc = JSON.parse(
      readFileSync(join(dir, "did.json"), "utf8"),
    ) as DidDocument;

    if (manifest.kind === "feed") {
      const xml = readFileSync(join(dir, "agent-feed.xml"), "utf8");
      const parsed = await parseFeed(xml, { didDocument: didDoc });
      const e = manifest.expect ?? {};

      if (e.feedStatus !== undefined)
        expect(parsed.feedStatus).toBe(e.feedStatus);
      if (e.verifiedEntryCount !== undefined) {
        expect(parsed.entries.filter((v) => v.verified)).toHaveLength(
          e.verifiedEntryCount,
        );
      }

      if (e.canonicalEndpoint || e.schemaVersion || e.mismatchOnLiveResponse) {
        const reader = new Reader();
        await reader.ingest({
          origin: "https://vector.example",
          xml,
          didDocument: didDoc,
        });

        if (e.canonicalEndpoint) {
          expect(
            reader.canonicalEndpoint(
              "https://vector.example",
              e.canonicalEndpoint.protocol,
            ),
          ).toBe(e.canonicalEndpoint.expected ?? undefined);
        }
        if (e.schemaVersion) {
          expect(
            reader.schemaVersion(
              "https://vector.example",
              e.schemaVersion.endpointId,
            ),
          ).toBe(e.schemaVersion.expected);
        }
        if (e.mismatchOnLiveResponse) {
          const events: any[] = [];
          reader.on("mismatch", (m) => events.push(m));
          reader.observeLiveResponse({
            origin: "https://vector.example",
            endpointId: e.mismatchOnLiveResponse.endpointId,
            body: e.mismatchOnLiveResponse.body,
          });
          if (e.mismatchOnLiveResponse.expectedFallback === null) {
            expect(events).toHaveLength(0);
          } else {
            expect(events).toHaveLength(1);
            expect(events[0].fallbackVersion).toBe(
              e.mismatchOnLiveResponse.expectedFallback,
            );
          }
        }
      }
    }

    if (manifest.kind === "snapshot") {
      const text = readFileSync(join(dir, "agent-card.json"), "utf8");
      const parsed = await parseSnapshot(text, { didDocument: didDoc });
      expect(parsed.verified).toBe(true);
    }
  });
}
