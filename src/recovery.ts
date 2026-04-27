import type { Reader } from "./reader.ts";

export function withFeedRecovery(
  reader: Reader,
  baseFetch: typeof fetch,
  opts: { origin: string },
): typeof fetch {
  return (async (input: any, init?: RequestInit) => {
    const res = await baseFetch(input, init);
    if (res.status !== 404) return res;

    const requestedUrl = typeof input === "string" ? input : input.url;
    const replacement = reader.replacementFor(opts.origin, requestedUrl);
    if (!replacement || replacement === requestedUrl) return res;

    return baseFetch(replacement, init);
  }) as unknown as typeof fetch;
}
