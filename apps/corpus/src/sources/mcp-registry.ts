import type { Observation, OriginResolution } from "../corpus.ts";

interface McpServerRecord {
  server?: {
    name?: string;
    title?: string;
    description?: string;
    version?: string;
    websiteUrl?: string;
    repository?: { url?: string };
    remotes?: Array<{ url?: string; type?: string }>;
    packages?: Array<{ identifier?: string; transport?: { type?: string } }>;
  };
  _meta?: {
    "io.modelcontextprotocol.registry/official"?: {
      updatedAt?: string;
      publishedAt?: string;
    };
  };
}

function resolveOrigin(s: McpServerRecord["server"]): {
  origin: string;
  resolution: OriginResolution;
} {
  if (s?.websiteUrl)
    return { origin: hostUrl(s.websiteUrl), resolution: "mcp-website" };
  if (s?.remotes?.length && s.remotes[0]?.url) {
    return { origin: hostUrl(s.remotes[0].url), resolution: "mcp-remote-host" };
  }
  if (s?.repository?.url) {
    // Preserve the full repo path so cross-source merges with github-readme observations work.
    return {
      origin: githubRepoUrl(s.repository.url),
      resolution: "github-repo",
    };
  }
  return { origin: "unknown:" + (s?.name ?? "anon"), resolution: "unknown" };
}

function githubRepoUrl(u: string): string {
  try {
    const url = new URL(u);
    if (url.host !== "github.com") return `${url.protocol}//${url.host}`;
    // Keep /<owner>/<repo>; strip subpaths (/blob/main/..., /tree/...)
    const parts = url.pathname
      .replace(/\.git$/, "")
      .split("/")
      .filter(Boolean);
    if (parts.length < 2) return `${url.protocol}//${url.host}`;
    return `https://github.com/${parts[0]}/${parts[1]}`;
  } catch {
    return u;
  }
}

function hostUrl(u: string): string {
  try {
    const url = new URL(u);
    return `${url.protocol}//${url.host}`;
  } catch {
    return u;
  }
}

export function mcpRegistryToObservations(
  body: { servers?: McpServerRecord[] },
  fetchedFrom: string,
  observedAt: string = new Date().toISOString(),
): Observation[] {
  const out: Observation[] = [];
  for (const r of body.servers ?? []) {
    const s = r.server;
    if (!s?.name) continue;
    const { origin, resolution } = resolveOrigin(s);
    const endpoints =
      s.remotes?.flatMap((rm) =>
        rm.url ? [{ url: rm.url, transport: rm.type }] : [],
      ) ?? [];
    out.push({
      origin,
      originResolution: resolution,
      observedAt:
        r._meta?.["io.modelcontextprotocol.registry/official"]?.updatedAt ??
        observedAt,
      source: "mcp-registry",
      sourceRecordId: s.name + (s.version ? `@${s.version}` : ""),
      sourceFetchedFrom: fetchedFrom,
      name: s.title ?? s.name,
      description: s.description,
      version: s.version,
      endpoints: endpoints.length ? endpoints : undefined,
      provider: s.repository?.url ? { url: s.repository.url } : undefined,
      raw: r,
    });
  }
  return out;
}
