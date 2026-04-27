import {
  buildFeed,
  didDocumentFromKeypair,
  type Entry,
  type FeedStatus,
  type Keypair,
} from "agent-feed";

export interface Config {
  origin: string;
  entries: Entry[];
  getKeypair: () => Promise<Keypair>;
  feedStatus?: FeedStatus;
  specVersion?: number;
}

export function createAgentFeedHandlers(config: Config) {
  const didJsonHandler = async (): Promise<Response> => {
    const keypair = await config.getKeypair();
    const didDoc = didDocumentFromKeypair(config.origin, keypair);
    return Response.json(didDoc);
  };

  const agentFeedXmlHandler = async (): Promise<Response> => {
    const keypair = await config.getKeypair();
    const didDoc = didDocumentFromKeypair(config.origin, keypair);
    const xml = await buildFeed({
      feedId: didDoc.id,
      title: "agent-feed",
      updated: new Date().toISOString(),
      feedStatus: config.feedStatus ?? "active",
      specVersion: config.specVersion ?? 0,
      entries: config.entries,
      keypair,
    });
    return new Response(xml, {
      headers: { "content-type": "application/atom+xml" },
    });
  };

  return { didJsonHandler, agentFeedXmlHandler };
}
