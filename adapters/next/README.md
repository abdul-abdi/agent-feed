# @agent-feed/next

Next.js App Router adapter for the agent-feed protocol.

## Quickstart

Create two route handlers in your Next.js app:

**`app/.well-known/did.json/route.ts`:**

```typescript
import { createAgentFeedHandlers } from "@agent-feed/next";

const config = {
  origin: "https://example.com",
  entries: [], // populate with Entry[] from your feed
  getKeypair: async () => generateKeypair(), // implement your keypair source
};

const { didJsonHandler } = createAgentFeedHandlers(config);
export const GET = didJsonHandler;
```

**`app/.well-known/agent-feed.xml/route.ts`:**

```typescript
import { createAgentFeedHandlers } from "@agent-feed/next";

const config = {
  origin: "https://example.com",
  entries: [], // same entries
  getKeypair: async () => generateKeypair(),
  feedStatus: "active",
  specVersion: 0,
};

const { agentFeedXmlHandler } = createAgentFeedHandlers(config);
export const GET = agentFeedXmlHandler;
```

Both handlers return `Response` objects compatible with Next.js 14+ App Router.
