import { Database } from "bun:sqlite";

export type Source =
  | "mcp-registry"
  | "a2a-registry"
  | "github-readme"
  | "well-known";
export type OriginResolution =
  | "a2a-card-uri"
  | "mcp-website"
  | "mcp-remote-host"
  | "github-repo"
  | "well-known"
  | "unknown";

export interface Endpoint {
  url: string;
  transport?: string;
}

export interface Observation {
  origin: string;
  originResolution: OriginResolution;
  observedAt: string;
  source: Source;
  sourceRecordId: string;
  sourceFetchedFrom: string;
  name?: string;
  description?: string;
  version?: string;
  protocolVersion?: string;
  endpoints?: Endpoint[];
  capabilities?: Record<string, unknown>;
  provider?: { name?: string; url?: string };
  raw: unknown;
}

export interface SearchOpts {
  q?: string;
  source?: Source;
  origin?: string;
  since?: string;
  limit?: number;
}

export interface UpsertResult {
  applied: boolean;
  reason?: "opted-out";
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS observations (
  source TEXT NOT NULL,
  source_record_id TEXT NOT NULL,
  origin TEXT NOT NULL,
  origin_resolution TEXT NOT NULL,
  observed_at TEXT NOT NULL,
  source_fetched_from TEXT NOT NULL,
  name TEXT,
  description TEXT,
  version TEXT,
  protocol_version TEXT,
  endpoints TEXT,
  capabilities TEXT,
  provider TEXT,
  raw TEXT NOT NULL,
  PRIMARY KEY (source, source_record_id)
);
CREATE INDEX IF NOT EXISTS observations_origin ON observations(origin);
CREATE INDEX IF NOT EXISTS observations_source ON observations(source);
CREATE INDEX IF NOT EXISTS observations_observed_at ON observations(observed_at);
CREATE VIRTUAL TABLE IF NOT EXISTS observations_fts USING fts5(source UNINDEXED, source_record_id UNINDEXED, name, description, raw);
CREATE TABLE IF NOT EXISTS optouts (
  origin TEXT PRIMARY KEY,
  opted_out_at TEXT NOT NULL
);
`;

export class Corpus {
  private db: Database;

  constructor(path: string) {
    this.db = new Database(path);
    this.db.exec(SCHEMA);
  }

  close(): void {
    this.db.close();
  }

  optOut(origin: string): void {
    this.db.run(
      `INSERT INTO optouts (origin, opted_out_at) VALUES (?, ?)
       ON CONFLICT(origin) DO UPDATE SET opted_out_at = excluded.opted_out_at`,
      [origin, new Date().toISOString()],
    );
    // Remove FTS rows for this origin's observations
    const rows = this.db
      .query<
        { source: string; source_record_id: string },
        [string]
      >(`SELECT source, source_record_id FROM observations WHERE origin = ?`)
      .all(origin);
    for (const r of rows) {
      this.db.run(
        `DELETE FROM observations_fts WHERE source = ? AND source_record_id = ?`,
        [r.source, r.source_record_id],
      );
    }
    this.db.run(`DELETE FROM observations WHERE origin = ?`, [origin]);
  }

  isOptedOut(origin: string): boolean {
    const row = this.db
      .query<
        { n: number },
        [string]
      >(`SELECT COUNT(*) AS n FROM optouts WHERE origin = ?`)
      .get(origin);
    return (row?.n ?? 0) > 0;
  }

  upsert(o: Observation): UpsertResult {
    if (this.isOptedOut(o.origin))
      return { applied: false, reason: "opted-out" };

    this.db.run(
      `INSERT INTO observations
        (source, source_record_id, origin, origin_resolution, observed_at, source_fetched_from,
         name, description, version, protocol_version, endpoints, capabilities, provider, raw)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(source, source_record_id) DO UPDATE SET
         origin = excluded.origin,
         origin_resolution = excluded.origin_resolution,
         observed_at = excluded.observed_at,
         source_fetched_from = excluded.source_fetched_from,
         name = excluded.name,
         description = excluded.description,
         version = excluded.version,
         protocol_version = excluded.protocol_version,
         endpoints = excluded.endpoints,
         capabilities = excluded.capabilities,
         provider = excluded.provider,
         raw = excluded.raw`,
      [
        o.source,
        o.sourceRecordId,
        o.origin,
        o.originResolution,
        o.observedAt,
        o.sourceFetchedFrom,
        o.name ?? null,
        o.description ?? null,
        o.version ?? null,
        o.protocolVersion ?? null,
        o.endpoints ? JSON.stringify(o.endpoints) : null,
        o.capabilities ? JSON.stringify(o.capabilities) : null,
        o.provider ? JSON.stringify(o.provider) : null,
        JSON.stringify(o.raw),
      ],
    );

    this.db.run(
      `DELETE FROM observations_fts WHERE source = ? AND source_record_id = ?`,
      [o.source, o.sourceRecordId],
    );
    this.db.run(
      `INSERT INTO observations_fts(source, source_record_id, name, description, raw) VALUES (?, ?, ?, ?, ?)`,
      [
        o.source,
        o.sourceRecordId,
        o.name ?? "",
        o.description ?? "",
        JSON.stringify(o.raw),
      ],
    );

    return { applied: true };
  }

  private rowToObservation(r: any): Observation {
    return {
      origin: r.origin,
      originResolution: r.origin_resolution,
      observedAt: r.observed_at,
      source: r.source,
      sourceRecordId: r.source_record_id,
      sourceFetchedFrom: r.source_fetched_from,
      name: r.name ?? undefined,
      description: r.description ?? undefined,
      version: r.version ?? undefined,
      protocolVersion: r.protocol_version ?? undefined,
      endpoints: r.endpoints ? JSON.parse(r.endpoints) : undefined,
      capabilities: r.capabilities ? JSON.parse(r.capabilities) : undefined,
      provider: r.provider ? JSON.parse(r.provider) : undefined,
      raw: JSON.parse(r.raw),
    };
  }

  listForOrigin(origin: string): Observation[] {
    return this.db
      .query<any, [string]>(
        `SELECT * FROM observations WHERE origin = ? ORDER BY observed_at DESC`,
      )
      .all(origin)
      .map((r) => this.rowToObservation(r));
  }

  listBySource(source: Source): Observation[] {
    return this.db
      .query<any, [string]>(
        `SELECT * FROM observations WHERE source = ? ORDER BY observed_at DESC`,
      )
      .all(source)
      .map((r) => this.rowToObservation(r));
  }

  search(opts: SearchOpts): Observation[] {
    const where: string[] = [];
    const params: any[] = [];
    let from = `observations`;

    if (opts.q) {
      from = `observations JOIN observations_fts
              ON observations_fts.source = observations.source
              AND observations_fts.source_record_id = observations.source_record_id`;
      where.push(`observations_fts MATCH ?`);
      params.push(opts.q);
    }
    if (opts.source) {
      where.push(`observations.source = ?`);
      params.push(opts.source);
    }
    if (opts.origin) {
      where.push(`observations.origin = ?`);
      params.push(opts.origin);
    }
    if (opts.since) {
      where.push(`observations.observed_at >= ?`);
      params.push(opts.since);
    }

    const sql = `
      SELECT observations.* FROM ${from}
      ${where.length ? "WHERE " + where.join(" AND ") : ""}
      ORDER BY observations.observed_at DESC
      LIMIT ?
    `;
    params.push(opts.limit ?? 100);
    return this.db
      .query<any, any[]>(sql)
      .all(...params)
      .map((r) => this.rowToObservation(r));
  }

  countsBySource(): Record<string, number> {
    const rows = this.db
      .query<
        { source: string; n: number },
        []
      >(`SELECT source, COUNT(*) AS n FROM observations GROUP BY source`)
      .all();
    const out: Record<string, number> = {};
    for (const r of rows) out[r.source] = r.n;
    return out;
  }
}
