import { XMLBuilder, XMLParser } from "fast-xml-parser";
import { canonicalize } from "./canonical.ts";
import {
  signBytes,
  verifyBytes,
  b64u,
  fromB64u,
  type Keypair,
  type DidDocument,
  publicKeyFromDid,
} from "./crypto.ts";

export type EntryType =
  | "endpoint-announcement"
  | "schema-change"
  | "deprecation";
export type FeedStatus = "active" | "terminated" | "migrated";

export interface Entry {
  id: string;
  type: EntryType;
  updated: string;
  payload: Record<string, unknown>;
}

export interface BuildFeedInput {
  feedId: string;
  title: string;
  updated: string;
  feedStatus: FeedStatus;
  specVersion: number;
  entries: Entry[];
  keypair: Keypair;
  migratedTo?: string;
}

const NS = "https://agent-feed.dev/ns/v0";
const ATOM_NS = "http://www.w3.org/2005/Atom";

export async function buildFeed(input: BuildFeedInput): Promise<string> {
  const xmlEntries = await Promise.all(
    input.entries.map(async (e) => {
      const canonical = canonicalize(e.payload);
      const sig = await signBytes(
        input.keypair.privateKey,
        new TextEncoder().encode(canonical),
      );
      return {
        id: e.id,
        title: e.type,
        updated: e.updated,
        "af:type": e.type,
        content: { "@_type": "application/json", "#text": canonical },
        "af:sig": { "@_type": "ed25519", "#text": b64u(sig) },
      };
    }),
  );

  const feed: Record<string, unknown> = {
    "@_xmlns": ATOM_NS,
    "@_xmlns:af": NS,
    id: input.feedId,
    title: input.title,
    updated: input.updated,
    "af:spec-version": input.specVersion,
    "af:feed-status": input.feedStatus,
    entry: xmlEntries,
  };
  if (input.migratedTo) feed["af:migrated-to"] = input.migratedTo;

  return new XMLBuilder({
    ignoreAttributes: false,
    format: true,
    suppressEmptyNode: true,
  }).build({
    "?xml": { "@_version": "1.0", "@_encoding": "UTF-8" },
    feed,
  });
}

export interface VerifiedEntry {
  entry: Entry;
  verified: boolean;
  canonicalPayload: string;
}

export interface ParsedFeed {
  feedId: string;
  title: string;
  updated: string;
  feedStatus: FeedStatus;
  specVersion: number;
  migratedTo?: string;
  entries: VerifiedEntry[];
}

export async function parseFeed(
  xml: string,
  opts: { didDocument: DidDocument },
): Promise<ParsedFeed> {
  const parser = new XMLParser({
    ignoreAttributes: false,
    parseTagValue: false,
    trimValues: true,
  });
  const doc = parser.parse(xml);
  const f = doc.feed;
  if (!f) throw new Error("missing <feed> root");

  const rawEntries: Array<Record<string, unknown>> = Array.isArray(f.entry)
    ? f.entry
    : f.entry
      ? [f.entry]
      : [];

  const entries: VerifiedEntry[] = await Promise.all(
    rawEntries.map(async (e) => {
      const content = e.content as Record<string, unknown> | string;
      const canonicalPayload =
        typeof content === "string"
          ? content
          : String((content as any)["#text"] ?? "");

      const sigField = e["af:sig"] as Record<string, unknown> | string;
      const sigB64u =
        typeof sigField === "string"
          ? sigField
          : String((sigField as any)["#text"] ?? "");

      const publicKey = publicKeyFromDid(opts.didDocument);
      const verified = await verifyBytes(
        publicKey,
        new TextEncoder().encode(canonicalPayload),
        fromB64u(sigB64u),
      );

      const payload: Record<string, unknown> = verified
        ? JSON.parse(canonicalPayload)
        : {};

      const entry: Entry = {
        id: String(e.id),
        type: String(e["af:type"]) as EntryType,
        updated: String(e.updated),
        payload,
      };
      return { entry, verified, canonicalPayload };
    }),
  );

  return {
    feedId: String(f.id),
    title: String(f.title),
    updated: String(f.updated),
    feedStatus: String(f["af:feed-status"]) as FeedStatus,
    specVersion: Number(f["af:spec-version"]),
    migratedTo: f["af:migrated-to"] ? String(f["af:migrated-to"]) : undefined,
    entries,
  };
}
