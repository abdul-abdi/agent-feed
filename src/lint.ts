import { parseFeed, type DidDocument } from "./index.ts";

export interface LintMessage {
  code: string;
  detail: string;
}

export interface LintReport {
  ok: boolean;
  feedStatus: string;
  specVersion: number;
  totalEntries: number;
  verifiedEntries: number;
  errors: LintMessage[];
  warnings: LintMessage[];
}

const SUPPORTED_SPEC_VERSION = 0;

export async function lintFeed(input: {
  xml: string;
  didDocument: DidDocument;
}): Promise<LintReport> {
  const errors: LintMessage[] = [];
  const warnings: LintMessage[] = [];

  const parsed = await parseFeed(input.xml, { didDocument: input.didDocument });

  if (parsed.specVersion !== SUPPORTED_SPEC_VERSION) {
    errors.push({
      code: "unsupported-spec-version",
      detail: `feed declares spec-version ${parsed.specVersion}, this linter supports ${SUPPORTED_SPEC_VERSION}`,
    });
  }

  if (parsed.feedStatus === "terminated") {
    warnings.push({
      code: "feed-terminated",
      detail: "feed-status is terminated — readers will drop trust",
    });
  }
  if (parsed.feedStatus === "migrated") {
    warnings.push({
      code: "feed-migrated",
      detail: `feed migrated to ${parsed.migratedTo ?? "(unspecified)"}`,
    });
  }

  const seenIds = new Map<string, number>();
  let verifiedCount = 0;

  for (const ve of parsed.entries) {
    if (ve.verified) verifiedCount += 1;
    else
      errors.push({
        code: "unverified-entry",
        detail: `entry ${ve.entry.id} signature did not verify against did.json`,
      });
    seenIds.set(ve.entry.id, (seenIds.get(ve.entry.id) ?? 0) + 1);
  }
  for (const [id, count] of seenIds) {
    if (count > 1) {
      errors.push({
        code: "duplicate-entry-id",
        detail: `entry id ${id} appears ${count} times — append-only contract violated`,
      });
    }
  }

  return {
    ok: errors.length === 0,
    feedStatus: parsed.feedStatus,
    specVersion: parsed.specVersion,
    totalEntries: parsed.entries.length,
    verifiedEntries: verifiedCount,
    errors,
    warnings,
  };
}

export async function lintRemote(origin: string): Promise<LintReport> {
  const didRes = await fetch(new URL("/.well-known/did.json", origin));
  if (!didRes.ok) {
    return {
      ok: false,
      feedStatus: "unknown",
      specVersion: -1,
      totalEntries: 0,
      verifiedEntries: 0,
      errors: [
        {
          code: "did-fetch-failed",
          detail: `${origin}/.well-known/did.json returned ${didRes.status}`,
        },
      ],
      warnings: [],
    };
  }
  const didDoc = (await didRes.json()) as DidDocument;
  const feedRes = await fetch(new URL("/.well-known/agent-feed.xml", origin));
  if (!feedRes.ok) {
    return {
      ok: false,
      feedStatus: "unknown",
      specVersion: -1,
      totalEntries: 0,
      verifiedEntries: 0,
      errors: [
        {
          code: "feed-fetch-failed",
          detail: `${origin}/.well-known/agent-feed.xml returned ${feedRes.status}`,
        },
      ],
      warnings: [],
    };
  }
  return lintFeed({ xml: await feedRes.text(), didDocument: didDoc });
}
