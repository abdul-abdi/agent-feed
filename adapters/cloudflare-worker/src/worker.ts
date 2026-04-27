import {
  generateKeypair,
  didDocumentFromKeypair,
  buildFeed,
  type Keypair,
  type Entry,
} from "agent-feed";

interface WorkerEnv {
  AGENT_FEED_KEYS: KVNamespace;
  ADMIN_TOKEN?: string;
  ORIGIN_URL?: string;
}

const KV_PRIVATE_KEY = "private-key";
const KV_ENTRIES = "entries";

export async function createWorker(env: WorkerEnv) {
  const originUrl = env.ORIGIN_URL || "https://example.com";

  async function getOrInitKeypair(): Promise<Keypair> {
    const stored = await env.AGENT_FEED_KEYS.get(KV_PRIVATE_KEY, "text");
    if (stored) {
      const parsed = JSON.parse(stored);
      return {
        privateKey: new Uint8Array(parsed.privateKey),
        publicKey: new Uint8Array(parsed.publicKey),
      };
    }

    const kp = await generateKeypair();
    await env.AGENT_FEED_KEYS.put(
      KV_PRIVATE_KEY,
      JSON.stringify({
        privateKey: Array.from(kp.privateKey),
        publicKey: Array.from(kp.publicKey),
      }),
    );
    return kp;
  }

  async function getEntries(): Promise<Entry[]> {
    const stored = await env.AGENT_FEED_KEYS.get(KV_ENTRIES, "text");
    return stored ? JSON.parse(stored) : [];
  }

  async function saveEntries(entries: Entry[]): Promise<void> {
    await env.AGENT_FEED_KEYS.put(KV_ENTRIES, JSON.stringify(entries));
  }

  async function rebuildFeed(kp: Keypair): Promise<string> {
    const didDoc = didDocumentFromKeypair(originUrl, kp);
    const entries = await getEntries();
    return buildFeed({
      feedId: didDoc.id,
      title: "agent-feed",
      updated: new Date().toISOString(),
      feedStatus: "active",
      specVersion: 0,
      entries,
      keypair: kp,
    });
  }

  return {
    async fetch(request: Request): Promise<Response> {
      const url = new URL(request.url);

      // GET /.well-known/did.json
      if (url.pathname === "/.well-known/did.json") {
        const kp = await getOrInitKeypair();
        const didDoc = didDocumentFromKeypair(originUrl, kp);
        return Response.json(didDoc, {
          headers: { "content-type": "application/json" },
        });
      }

      // GET /.well-known/agent-feed.xml
      if (url.pathname === "/.well-known/agent-feed.xml") {
        const kp = await getOrInitKeypair();
        const feedXml = await rebuildFeed(kp);
        return new Response(feedXml, {
          headers: { "content-type": "application/atom+xml" },
        });
      }

      // POST /admin/init
      if (url.pathname === "/admin/init" && request.method === "POST") {
        const token = request.headers.get("x-admin-token");
        if (token !== env.ADMIN_TOKEN) {
          return new Response("Unauthorized", { status: 401 });
        }

        const kp = await generateKeypair();
        await env.AGENT_FEED_KEYS.put(
          KV_PRIVATE_KEY,
          JSON.stringify({
            privateKey: Array.from(kp.privateKey),
            publicKey: Array.from(kp.publicKey),
          }),
        );
        await env.AGENT_FEED_KEYS.put(KV_ENTRIES, JSON.stringify([]));

        const didDoc = didDocumentFromKeypair(originUrl, kp);
        return Response.json(
          { success: true, did: didDoc.id },
          { status: 201 },
        );
      }

      // POST /admin/append
      if (url.pathname === "/admin/append" && request.method === "POST") {
        const token = request.headers.get("x-admin-token");
        if (token !== env.ADMIN_TOKEN) {
          return new Response("Unauthorized", { status: 401 });
        }

        let body: { type: string; payload: Record<string, unknown> };
        try {
          body = await request.json();
        } catch {
          return new Response("Invalid JSON", { status: 400 });
        }

        const { type, payload } = body;
        if (!type || !payload) {
          return new Response("Missing type or payload", { status: 400 });
        }

        const entry: Entry = {
          id: `urn:af:${originUrl}:${Date.now()}`,
          type: type as
            | "endpoint-announcement"
            | "schema-change"
            | "deprecation",
          updated: new Date().toISOString(),
          payload,
        };

        const entries = await getEntries();
        entries.push(entry);
        await saveEntries(entries);

        return Response.json({ success: true, entry }, { status: 201 });
      }

      // Default 404
      return new Response("Not Found", { status: 404 });
    },
  };
}

export default {
  fetch: async (request: Request, env: WorkerEnv, ctx: ExecutionContext) => {
    const worker = await createWorker(env);
    return worker.fetch(request);
  },
};
