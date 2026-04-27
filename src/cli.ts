#!/usr/bin/env bun
import { Command } from "commander";
import { mkdir, writeFile, readFile } from "node:fs/promises";
import { join } from "node:path";
import {
  generateKeypair,
  didDocumentFromKeypair,
  buildFeed,
  parseFeed,
  publicKeyFromDid,
  b64u,
  fromB64u,
  type Entry,
  type EntryType,
  type DidDocument,
} from "./index.ts";

const program = new Command();
program
  .name("agent-feed")
  .description("Sign and verify /.well-known/agent-feed.xml documents")
  .version("0.0.0");

program
  .command("init")
  .description("Generate a keypair and scaffold did.json + empty feed")
  .requiredOption("-o, --origin <url>", "origin URL, e.g. https://example.com")
  .requiredOption("-d, --dir <path>", "output directory")
  .action(async (opts) => {
    await mkdir(opts.dir, { recursive: true });
    const kp = await generateKeypair();
    const didDoc = didDocumentFromKeypair(opts.origin, kp);

    await writeFile(
      join(opts.dir, "did.json"),
      JSON.stringify(didDoc, null, 2),
    );
    await writeFile(join(opts.dir, "private.key"), b64u(kp.privateKey));

    const xml = await buildFeed({
      feedId: didDoc.id,
      title: `${new URL(opts.origin).hostname} agent feed`,
      updated: new Date().toISOString(),
      feedStatus: "active",
      specVersion: 0,
      entries: [],
      keypair: kp,
    });
    await writeFile(join(opts.dir, "agent-feed.xml"), xml);

    console.log(`Initialized at ${opts.dir}`);
    console.log(
      `  did.json:        publish at ${opts.origin}/.well-known/did.json`,
    );
    console.log(
      `  agent-feed.xml:  publish at ${opts.origin}/.well-known/agent-feed.xml`,
    );
    console.log(`  private.key:     keep secret`);
  });

program
  .command("sign")
  .description("Append a signed entry to an existing feed")
  .requiredOption(
    "-d, --dir <path>",
    "directory containing did.json + private.key + agent-feed.xml",
  )
  .requiredOption(
    "-t, --type <type>",
    "entry type: endpoint-announcement | schema-change | deprecation",
  )
  .requiredOption("-p, --payload <json>", "JSON payload string")
  .option("--id <id>", "entry id (default: urn:af:<host>:<unix-ms>)")
  .action(async (opts) => {
    const didDoc: DidDocument = JSON.parse(
      await readFile(join(opts.dir, "did.json"), "utf8"),
    );
    const privKey = fromB64u(
      (await readFile(join(opts.dir, "private.key"), "utf8")).trim(),
    );
    const pubKey = publicKeyFromDid(didDoc);
    const xml = await readFile(join(opts.dir, "agent-feed.xml"), "utf8");
    const parsed = await parseFeed(xml, { didDocument: didDoc });

    const host = didDoc.id.replace(/^did:web:/, "").split("%3A")[0]!;
    const newEntry: Entry = {
      id: opts.id ?? `urn:af:${host}:${Date.now()}`,
      type: opts.type as EntryType,
      updated: new Date().toISOString(),
      payload: JSON.parse(opts.payload),
    };

    const all: Entry[] = [
      ...parsed.entries.filter((e) => e.verified).map((e) => e.entry),
      newEntry,
    ];

    const next = await buildFeed({
      feedId: parsed.feedId,
      title: parsed.title,
      updated: new Date().toISOString(),
      feedStatus: parsed.feedStatus,
      specVersion: parsed.specVersion,
      entries: all,
      keypair: { publicKey: pubKey, privateKey: privKey },
    });

    await writeFile(join(opts.dir, "agent-feed.xml"), next);
    console.log(`Appended ${newEntry.type} entry ${newEntry.id}`);
  });

program
  .command("verify")
  .description("Fetch and verify a remote feed")
  .requiredOption("-o, --origin <url>", "origin URL")
  .action(async (opts) => {
    const didRes = await fetch(new URL("/.well-known/did.json", opts.origin));
    if (!didRes.ok) {
      console.error(`did.json fetch failed: ${didRes.status}`);
      process.exit(1);
    }
    const didDoc = (await didRes.json()) as DidDocument;

    const feedRes = await fetch(
      new URL("/.well-known/agent-feed.xml", opts.origin),
    );
    if (!feedRes.ok) {
      console.error(`agent-feed.xml fetch failed: ${feedRes.status}`);
      process.exit(1);
    }
    const xml = await feedRes.text();
    const parsed = await parseFeed(xml, { didDocument: didDoc });

    const ok = parsed.entries.filter((e) => e.verified).length;
    console.log(`feed:           ${parsed.feedId}`);
    console.log(`status:         ${parsed.feedStatus}`);
    console.log(`spec-version:   ${parsed.specVersion}`);
    console.log(`entries:        ${ok}/${parsed.entries.length} verified`);
    if (ok < parsed.entries.length) process.exit(2);
  });

program.parse();
