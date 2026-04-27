export function canonicalize(value: unknown): string {
  return JSON.stringify(walk(value));
}

function walk(v: unknown): unknown {
  if (v === null) return null;
  if (typeof v === "number") {
    if (!Number.isFinite(v)) throw new Error("non-finite number");
    return v;
  }
  if (Array.isArray(v)) return v.map(walk);
  if (typeof v === "object") {
    const obj = v as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(obj).sort()) out[k] = walk(obj[k]);
    return out;
  }
  return v;
}
