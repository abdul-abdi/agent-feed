import { Database } from "bun:sqlite";
import {
  parseFeed,
  type DidDocument,
  type EntryType,
} from "../../../src/index.ts";

export interface IngestResult {
  origin: string;
  verifiedEntries: number;
  rejectedEntries: number;
  feedStatus: string;
}

export interface OriginRow {
  origin: string;
  feedStatus: string;
  specVersion: number;
  trusted: boolean;
  lastIngested: number;
}

export interface SearchHit {
  origin: string;
  entryId: string;
  type: EntryType;
  updated: string;
  payload: Record<string, unknown>;
  ingestedAt: number;
}

export interface SearchOpts {
  q?: string;
  type?: EntryType;
  endpointId?: string;
  origin?: string;
  since?: string; // ISO timestamp; entries with updated >= since
  until?: string;
  limit?: number;
}

export interface OriginStats {
  origin: string;
  totalEntries: number;
  byType: Record<string, number>;
  lastEntryAt: string | null;
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS origins (
  origin TEXT PRIMARY KEY,
  did_doc TEXT NOT NULL,
  feed_status TEXT NOT NULL,
  spec_version INTEGER NOT NULL,
  trusted INTEGER NOT NULL DEFAULT 1,
  last_ingested INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS entries (
  origin TEXT NOT NULL,
  entry_id TEXT NOT NULL,
  type TEXT NOT NULL,
  endpoint_id TEXT,
  updated TEXT NOT NULL,
  payload TEXT NOT NULL,
  canonical_payload TEXT NOT NULL,
  ingested_at INTEGER NOT NULL,
  PRIMARY KEY (origin, entry_id)
);
CREATE INDEX IF NOT EXISTS entries_type ON entries(type);
CREATE INDEX IF NOT EXISTS entries_updated ON entries(updated);
CREATE INDEX IF NOT EXISTS entries_endpoint_id ON entries(endpoint_id);
CREATE VIRTUAL TABLE IF NOT EXISTS entries_fts USING fts5(payload, content='entries', content_rowid='rowid');
`;

export class Aggregator {
  private db: Database;

  constructor(path: string) {
    this.db = new Database(path);
    this.db.exec(SCHEMA);
  }

  close(): void {
    this.db.close();
  }

  async ingest(input: {
    origin: string;
    xml: string;
    didDocument: DidDocument;
  }): Promise<IngestResult> {
    const parsed = await parseFeed(input.xml, {
      didDocument: input.didDocument,
    });
    const now = Date.now();

    this.db.run(
      `INSERT INTO origins (origin, did_doc, feed_status, spec_version, trusted, last_ingested)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(origin) DO UPDATE SET
         did_doc = excluded.did_doc,
         feed_status = excluded.feed_status,
         spec_version = excluded.spec_version,
         trusted = excluded.trusted,
         last_ingested = excluded.last_ingested`,
      [
        input.origin,
        JSON.stringify(input.didDocument),
        parsed.feedStatus,
        parsed.specVersion,
        parsed.feedStatus === "active" ? 1 : 0,
        now,
      ],
    );

    let verified = 0;
    let rejected = 0;
    const insertEntry = this.db.prepare(
      `INSERT INTO entries (origin, entry_id, type, endpoint_id, updated, payload, canonical_payload, ingested_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(origin, entry_id) DO NOTHING`,
    );
    const insertFts = this.db.prepare(
      `INSERT INTO entries_fts(rowid, payload)
       SELECT rowid, payload FROM entries WHERE origin = ? AND entry_id = ?`,
    );

    for (const ve of parsed.entries) {
      if (!ve.verified) {
        rejected += 1;
        continue;
      }
      const endpointId =
        typeof (ve.entry.payload as any)["endpoint-id"] === "string"
          ? String((ve.entry.payload as any)["endpoint-id"])
          : null;
      insertEntry.run(
        input.origin,
        ve.entry.id,
        ve.entry.type,
        endpointId,
        ve.entry.updated,
        JSON.stringify(ve.entry.payload),
        ve.canonicalPayload,
        now,
      );
      insertFts.run(input.origin, ve.entry.id);
      verified += 1;
    }
    insertEntry.finalize();
    insertFts.finalize();

    return {
      origin: input.origin,
      verifiedEntries: verified,
      rejectedEntries: rejected,
      feedStatus: parsed.feedStatus,
    };
  }

  listOrigins(): OriginRow[] {
    return this.db
      .query<
        {
          origin: string;
          feed_status: string;
          spec_version: number;
          trusted: number;
          last_ingested: number;
        },
        []
      >(
        `SELECT origin, feed_status, spec_version, trusted, last_ingested FROM origins ORDER BY last_ingested DESC`,
      )
      .all()
      .map((r) => ({
        origin: r.origin,
        feedStatus: r.feed_status,
        specVersion: r.spec_version,
        trusted: !!r.trusted,
        lastIngested: r.last_ingested,
      }));
  }

  search(opts: SearchOpts): SearchHit[] {
    const where: string[] = [];
    const params: any[] = [];
    let from = `entries`;

    if (opts.q) {
      from = `entries JOIN entries_fts ON entries.rowid = entries_fts.rowid`;
      where.push(`entries_fts MATCH ?`);
      params.push(opts.q);
    }
    if (opts.type) {
      where.push(`entries.type = ?`);
      params.push(opts.type);
    }
    if (opts.endpointId) {
      where.push(`entries.endpoint_id = ?`);
      params.push(opts.endpointId);
    }
    if (opts.origin) {
      where.push(`entries.origin = ?`);
      params.push(opts.origin);
    }
    if (opts.since) {
      where.push(`entries.updated >= ?`);
      params.push(opts.since);
    }
    if (opts.until) {
      where.push(`entries.updated <= ?`);
      params.push(opts.until);
    }

    const sql = `
      SELECT entries.origin, entries.entry_id, entries.type, entries.updated, entries.payload, entries.ingested_at
      FROM ${from}
      ${where.length ? "WHERE " + where.join(" AND ") : ""}
      ORDER BY entries.updated DESC
      LIMIT ?
    `;
    params.push(opts.limit ?? 100);

    return this.db
      .query<
        {
          origin: string;
          entry_id: string;
          type: string;
          updated: string;
          payload: string;
          ingested_at: number;
        },
        any[]
      >(sql)
      .all(...params)
      .map((r) => ({
        origin: r.origin,
        entryId: r.entry_id,
        type: r.type as EntryType,
        updated: r.updated,
        payload: JSON.parse(r.payload),
        ingestedAt: r.ingested_at,
      }));
  }

  statsForOrigin(origin: string): OriginStats | undefined {
    const total = this.db
      .query<
        { n: number },
        [string]
      >(`SELECT COUNT(*) AS n FROM entries WHERE origin = ?`)
      .get(origin)?.n;
    if (total === undefined) return undefined;
    if (total === 0) {
      const exists = this.db
        .query<
          { n: number },
          [string]
        >(`SELECT COUNT(*) AS n FROM origins WHERE origin = ?`)
        .get(origin)?.n;
      if (!exists) return undefined;
    }

    const byTypeRows = this.db
      .query<
        { type: string; n: number },
        [string]
      >(`SELECT type, COUNT(*) AS n FROM entries WHERE origin = ? GROUP BY type`)
      .all(origin);
    const byType: Record<string, number> = {};
    for (const r of byTypeRows) byType[r.type] = r.n;

    const last = this.db
      .query<
        { updated: string | null },
        [string]
      >(`SELECT MAX(updated) AS updated FROM entries WHERE origin = ?`)
      .get(origin);

    return {
      origin,
      totalEntries: total ?? 0,
      byType,
      lastEntryAt: last?.updated ?? null,
    };
  }
}
