import {
  parseFeed,
  type Entry,
  type EntryType,
  type FeedStatus,
  type Snapshot,
  type SnapshotEndpoint,
} from "./feed.ts";
import { type DidDocument } from "./crypto.ts";

interface MigrationDelta {
  add?: string[];
  remove?: string[];
  rename?: Record<string, string>;
  retype?: Record<string, { from: string; to: string }>;
  [key: string]: unknown;
}

interface EndpointState {
  endpointId: string;
  protocol: string;
  url: string;
  version: string;
  migrations: Map<string, MigrationDelta>; // "from->to" → delta
  deprecated?: { sunset: string; replacement?: string };
}

interface OriginState {
  endpoints: Map<string, EndpointState>; // key: endpoint-id
  byProtocol: Map<string, string>; // protocol → endpoint-id
  appliedEntryIds: Map<string, string>; // entry id → canonicalPayload (for replay-mismatch detection)
  trusted: boolean;
  migratedTo?: string;
}

export type ReaderEvent =
  | "unverified-entry"
  | "unknown-entry-type"
  | "replay-mismatch"
  | "deprecation-of-unknown"
  | "deprecated-and-sunset"
  | "feed-migrated"
  | "mismatch";

type Listener = (payload: any) => void;

export interface IngestInput {
  origin: string;
  feedUrl?: string;
  xml: string;
  didDocument: DidDocument;
}

export interface MismatchDetails {
  origin: string;
  endpointId: string;
  expectedVersion: string;
  observedDiscrepancy: {
    expectedButMissing: string[];
    observedButUnannounced: string[];
  };
  fallbackVersion?: string;
}

export class Reader {
  private origins = new Map<string, OriginState>();
  private listeners = new Map<ReaderEvent, Set<Listener>>();

  on(event: ReaderEvent, fn: Listener): void {
    let s = this.listeners.get(event);
    if (!s) this.listeners.set(event, (s = new Set()));
    s.add(fn);
  }

  private emit(event: ReaderEvent, payload: unknown): void {
    this.listeners.get(event)?.forEach((fn) => fn(payload));
  }

  private origin(name: string): OriginState {
    let s = this.origins.get(name);
    if (!s) {
      s = {
        endpoints: new Map(),
        byProtocol: new Map(),
        appliedEntryIds: new Map(),
        trusted: true,
      };
      this.origins.set(name, s);
    }
    return s;
  }

  async ingest({
    origin,
    feedUrl,
    xml,
    didDocument,
  }: IngestInput): Promise<void> {
    const parsed = await parseFeed(xml, { didDocument });
    const state = this.origin(origin);

    if (parsed.feedStatus === "terminated") {
      state.trusted = false;
      return;
    }
    if (parsed.feedStatus === "migrated") {
      state.trusted = false;
      state.migratedTo = parsed.migratedTo;
      this.emit("feed-migrated", {
        origin,
        feedUrl,
        migratedTo: parsed.migratedTo,
      });
      return;
    }

    state.trusted = true;

    for (const ve of parsed.entries) {
      if (!ve.verified) {
        this.emit("unverified-entry", {
          origin,
          feedUrl,
          entryId: ve.entry.id,
        });
        continue;
      }

      const existing = state.appliedEntryIds.get(ve.entry.id);
      if (existing !== undefined) {
        if (existing !== ve.canonicalPayload) {
          this.emit("replay-mismatch", {
            origin,
            entryId: ve.entry.id,
            previousPayload: existing,
            currentPayload: ve.canonicalPayload,
          });
        }
        continue;
      }

      if (!isKnownEntryType(ve.entry.type)) {
        this.emit("unknown-entry-type", {
          origin,
          entryId: ve.entry.id,
          type: ve.entry.type,
        });
        continue;
      }

      this.applyEntry(state, origin, ve.entry);
      state.appliedEntryIds.set(ve.entry.id, ve.canonicalPayload);
    }
  }

  private applyEntry(state: OriginState, origin: string, entry: Entry): void {
    const p = entry.payload as Record<string, unknown>;

    if (entry.type === "endpoint-announcement") {
      const endpointId = String(p["endpoint-id"] ?? p.endpoint);
      const url = String(p.endpoint);
      const protocol = String(p.protocol);
      const version = String(p.version);
      const existing = state.endpoints.get(endpointId);
      state.endpoints.set(endpointId, {
        endpointId,
        protocol,
        url,
        version,
        migrations: existing?.migrations ?? new Map(),
        deprecated: existing?.deprecated,
      });
      state.byProtocol.set(protocol, endpointId);
      return;
    }

    if (entry.type === "schema-change") {
      const endpointId = String(p["endpoint-id"]);
      const fromVersion = String(p["from-version"]);
      const toVersion = String(p["to-version"]);
      const migration = (p.migration as MigrationDelta | undefined) ?? {};
      let ep = state.endpoints.get(endpointId);
      if (!ep) {
        ep = {
          endpointId,
          protocol: "unknown",
          url: "",
          version: fromVersion,
          migrations: new Map(),
        };
        state.endpoints.set(endpointId, ep);
      }
      ep.migrations.set(`${fromVersion}->${toVersion}`, migration);
      ep.version = toVersion;
      return;
    }

    if (entry.type === "deprecation") {
      const endpointId = String(p["endpoint-id"]);
      const ep = state.endpoints.get(endpointId);
      if (!ep) {
        this.emit("deprecation-of-unknown", { origin, endpointId });
        return;
      }
      ep.deprecated = {
        sunset: String(p.sunset),
        replacement: p.replacement == null ? undefined : String(p.replacement),
      };
      return;
    }
  }

  canonicalEndpoint(
    origin: string,
    protocol: string,
    now: Date = new Date(),
  ): string | undefined {
    const s = this.origins.get(origin);
    if (!s || !s.trusted) return undefined;
    const endpointId = s.byProtocol.get(protocol);
    if (!endpointId) return undefined;
    return this.resolveEndpointUrl(s, endpointId, now);
  }

  private resolveEndpointUrl(
    s: OriginState,
    endpointId: string,
    now: Date,
  ): string | undefined {
    const ep = s.endpoints.get(endpointId);
    if (!ep) return undefined;
    if (ep.deprecated && new Date(ep.deprecated.sunset) <= now) {
      this.emit("deprecated-and-sunset", {
        endpointId,
        sunset: ep.deprecated.sunset,
      });
      if (!ep.deprecated.replacement) return undefined;
      return this.resolveEndpointUrl(s, ep.deprecated.replacement, now);
    }
    return ep.url || undefined;
  }

  schemaVersion(origin: string, endpointId: string): string | undefined {
    return this.origins.get(origin)?.endpoints.get(endpointId)?.version;
  }

  migration(
    origin: string,
    endpointId: string,
    from: string,
    to: string,
  ): MigrationDelta | undefined {
    return this.origins
      .get(origin)
      ?.endpoints.get(endpointId)
      ?.migrations.get(`${from}->${to}`);
  }

  isTrusted(origin: string): boolean {
    return this.origins.get(origin)?.trusted ?? true;
  }

  snapshot(
    origin: string,
    opts: { id: string; generatedAt?: string },
  ): Snapshot | undefined {
    const s = this.origins.get(origin);
    if (!s) return undefined;
    const endpoints: SnapshotEndpoint[] = [...s.endpoints.entries()].map(
      ([id, ep]) => ({
        "endpoint-id": id,
        endpoint: ep.url,
        protocol: ep.protocol,
        version: ep.version,
        deprecated: ep.deprecated ?? null,
      }),
    );
    const status: FeedStatus = !s.trusted
      ? s.migratedTo
        ? "migrated"
        : "terminated"
      : "active";
    return {
      id: opts.id,
      "spec-version": 0,
      "generated-at": opts.generatedAt ?? new Date().toISOString(),
      endpoints,
      "by-protocol": Object.fromEntries(s.byProtocol),
      "feed-status": status,
    };
  }

  observeLiveResponse(input: {
    origin: string;
    endpointId: string;
    body: Record<string, unknown>;
  }): void {
    const s = this.origins.get(input.origin);
    if (!s) return;
    const ep = s.endpoints.get(input.endpointId);
    if (!ep) return;

    let priorVersion: string | undefined;
    let migration: MigrationDelta | undefined;
    for (const [key, m] of ep.migrations.entries()) {
      const [from, to] = key.split("->");
      if (to === ep.version) {
        priorVersion = from;
        migration = m;
      }
    }
    if (!migration) return;

    const expectedButMissing: string[] = [];
    const observedButUnannounced: string[] = [];

    if (migration.add) {
      for (const f of migration.add) {
        if (!isPathPresent(input.body, f)) expectedButMissing.push(f);
      }
    }
    if (migration.remove) {
      for (const f of migration.remove) {
        if (isPathPresent(input.body, f)) observedButUnannounced.push(f);
      }
    }
    if (migration.rename) {
      for (const oldPath of Object.keys(migration.rename)) {
        if (isPathPresent(input.body, oldPath))
          observedButUnannounced.push(oldPath);
      }
    }

    if (expectedButMissing.length === 0 && observedButUnannounced.length === 0)
      return;

    const details: MismatchDetails = {
      origin: input.origin,
      endpointId: input.endpointId,
      expectedVersion: ep.version,
      observedDiscrepancy: { expectedButMissing, observedButUnannounced },
      fallbackVersion: priorVersion,
    };
    this.emit("mismatch", details);
  }
}

function isKnownEntryType(t: string): t is EntryType {
  return (
    t === "endpoint-announcement" ||
    t === "schema-change" ||
    t === "deprecation"
  );
}

function isPathPresent(body: Record<string, unknown>, path: string): boolean {
  if (!path.startsWith("/")) return path in body;
  let cur: any = body;
  for (const p of path.split("/").filter(Boolean)) {
    if (cur === null || typeof cur !== "object" || !(p in cur)) return false;
    cur = cur[p];
  }
  return true;
}
