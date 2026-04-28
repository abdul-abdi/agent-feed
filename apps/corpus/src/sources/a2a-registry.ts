import type { Observation, OriginResolution } from "../corpus.ts";

interface A2aAgentRecord {
  protocolVersion?: string;
  name?: string;
  description?: string;
  author?: string;
  wellKnownURI?: string;
  url?: string;
  version?: string;
  provider?: { organization?: string; url?: string };
  capabilities?: Record<string, unknown>;
  documentationUrl?: string;
}

function resolveOrigin(a: A2aAgentRecord): {
  origin: string;
  resolution: OriginResolution;
} {
  const candidate = a.wellKnownURI ?? a.url;
  if (!candidate)
    return { origin: "unknown:" + (a.name ?? "anon"), resolution: "unknown" };
  try {
    const u = new URL(candidate);
    return { origin: `${u.protocol}//${u.host}`, resolution: "a2a-card-uri" };
  } catch {
    return { origin: candidate, resolution: "a2a-card-uri" };
  }
}

export function a2aRegistryToObservations(
  body: { agents?: A2aAgentRecord[] },
  fetchedFrom: string,
  observedAt: string = new Date().toISOString(),
): Observation[] {
  const out: Observation[] = [];
  for (const a of body.agents ?? []) {
    if (!a.wellKnownURI && !a.url && !a.name) continue;
    const { origin, resolution } = resolveOrigin(a);
    out.push({
      origin,
      originResolution: resolution,
      observedAt,
      source: "a2a-registry",
      sourceRecordId: a.wellKnownURI ?? a.url ?? a.name ?? "unknown",
      sourceFetchedFrom: fetchedFrom,
      name: a.name,
      description: a.description,
      version: a.version,
      protocolVersion: a.protocolVersion,
      capabilities: a.capabilities,
      provider: a.provider
        ? { name: a.provider.organization, url: a.provider.url }
        : a.author
          ? { name: a.author }
          : undefined,
      raw: a,
    });
  }
  return out;
}
