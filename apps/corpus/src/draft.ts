import type { Corpus, Observation, Source } from "./corpus.ts";

export interface DraftEntry {
  type: "endpoint-announcement";
  id: string;
  updated: string;
  payload: {
    "asserted-at": string;
    endpoint: string;
    "endpoint-id": string;
    protocol: string;
    version: string;
  };
}

export interface DraftResult {
  entry: DraftEntry;
  confidence: "high" | "medium" | "low";
  basedOn: Source[];
  hint: string;
}

const SOURCE_PRIORITY: Source[] = [
  "mcp-registry",
  "a2a-registry",
  "well-known",
  "github-readme",
];

function pickPrimary(observations: Observation[]): Observation | null {
  for (const src of SOURCE_PRIORITY) {
    const match = observations.find((o) => o.source === src);
    if (match) return match;
  }
  return null;
}

function inferProtocol(o: Observation): string {
  if (o.source === "mcp-registry") return "mcp";
  if (o.source === "a2a-registry") return "a2a";
  if (o.protocolVersion) return "a2a"; // protocolVersion presence implies A2A
  return "rest";
}

function inferEndpoint(o: Observation, origin: string): string {
  if (o.endpoints && o.endpoints[0]?.url) return o.endpoints[0].url;
  return origin;
}

function inferEndpointId(o: Observation, origin: string): string {
  if (o.source === "mcp-registry") {
    // sourceRecordId is e.g. "ai.agenttrust/mcp-server@1.1.1"
    return o.sourceRecordId.split("@")[0] ?? origin;
  }
  if (o.source === "a2a-registry") {
    // wellKnownURI as id; trim to a stable token
    try {
      return new URL(o.sourceRecordId).host;
    } catch {
      return o.sourceRecordId;
    }
  }
  return o.sourceRecordId;
}

function confidenceFor(observations: Observation[]): "high" | "medium" | "low" {
  const sources = new Set(observations.map((o) => o.source));
  if (sources.has("mcp-registry") || sources.has("a2a-registry")) {
    return sources.size > 1 ? "high" : "medium";
  }
  return "low";
}

export function draftEndpointAnnouncement(
  corpus: Corpus,
  origin: string,
): DraftResult | null {
  const observations = corpus.listForOrigin(origin);
  if (observations.length === 0) return null;

  const primary = pickPrimary(observations);
  if (!primary) return null;

  const now = new Date().toISOString();
  const sources = [...new Set(observations.map((o) => o.source))];

  const entry: DraftEntry = {
    type: "endpoint-announcement",
    id: `urn:af:draft:${Date.now()}`,
    updated: now,
    payload: {
      "asserted-at": now,
      endpoint: inferEndpoint(primary, origin),
      "endpoint-id": inferEndpointId(primary, origin),
      protocol: inferProtocol(primary),
      version: primary.version ?? "0.0.0",
    },
  };

  return {
    entry,
    confidence: confidenceFor(observations),
    basedOn: sources,
    hint:
      confidenceFor(observations) === "low"
        ? "Only README evidence — please verify and edit before signing."
        : "Generated from highest-priority source. Edit to match your canonical state, then sign with `agent-feed sign`.",
  };
}
