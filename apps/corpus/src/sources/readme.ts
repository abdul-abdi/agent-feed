import type { Observation } from "../corpus.ts";

/**
 * Extracts MCP-server-shaped entries from a README markdown.
 * Heuristic: lines with `[label](github URL)` patterns are treated as records.
 * The repo path becomes the sourceRecordId; the GitHub host becomes the origin.
 */
export function readmeToObservations(
  markdown: string,
  fetchedFrom: string,
  observedAt: string = new Date().toISOString(),
): Observation[] {
  const out: Observation[] = [];
  const seen = new Set<string>();

  // Match [text](https://github.com/owner/repo[/...]) patterns
  const linkRe = /\[([^\]]+)\]\((https:\/\/github\.com\/[^)\s]+)\)/g;

  for (const line of markdown.split(/\r?\n/)) {
    // skip headings, badges-only lines, empty lines
    if (!line.trim() || line.trim().startsWith("#")) continue;

    let m: RegExpExecArray | null;
    linkRe.lastIndex = 0;
    while ((m = linkRe.exec(line))) {
      const label = m[1]!.trim();
      const url = m[2]!;
      const repoMatch = url.match(
        /^https:\/\/github\.com\/([^/\s]+\/[^/#?\s)]+)/,
      );
      if (!repoMatch) continue;
      const repoPath = repoMatch[1]!.replace(/\.git$/, "");
      if (seen.has(repoPath)) continue;
      seen.add(repoPath);

      // Description heuristic: rest of the line after the link, stripped of badge images
      const after = line
        .slice(m.index + m[0].length)
        .replace(/!\[[^\]]*\]\([^)]+\)/g, "")
        .trim();
      const description =
        after
          .replace(/^[\-:\s]+/, "")
          .replace(/\s+/g, " ")
          .slice(0, 500) || undefined;

      out.push({
        origin: `https://github.com/${repoPath}`,
        originResolution: "github-repo",
        observedAt,
        source: "github-readme",
        sourceRecordId: repoPath,
        sourceFetchedFrom: fetchedFrom,
        name: label,
        description,
        provider: { url: `https://github.com/${repoPath.split("/")[0]}` },
        raw: { line, label, url, repoPath },
      });
    }
  }
  return out;
}
