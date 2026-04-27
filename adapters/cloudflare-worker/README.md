# @agent-feed/cloudflare-worker

A Cloudflare Worker adapter for agent-feed that serves signed feeds and manages keypairs via KV storage.

## Quickstart

1. Install dependencies:

```bash
npm install
# or
bun install
```

2. Set up `wrangler.toml` with your Cloudflare account ID and KV namespace IDs.

3. Set environment variables:

```toml
env_vars = { ORIGIN_URL = "https://your-origin.com", ADMIN_TOKEN = "your-secret-token" }
```

4. Start local development:

```bash
wrangler dev
```

## Admin Endpoints

All admin endpoints require the `x-admin-token` header matching `env.ADMIN_TOKEN`.

### Initialize feed (create keypair, empty entries)

```bash
POST /admin/init
x-admin-token: your-secret-token
```

Response: `{ success: true, did: "did:web:..." }`

### Append entry

```bash
POST /admin/append
x-admin-token: your-secret-token
Content-Type: application/json

{
  "type": "endpoint-announcement",
  "payload": {
    "endpoint-id": "api",
    "endpoint": "/api/v1",
    "protocol": "rest",
    "version": "1.0",
    "asserted-at": "2026-04-27T12:00:00Z"
  }
}
```

Response: `{ success: true, entry: { ... } }`

## Public Endpoints

- `GET /.well-known/did.json` — DID document with public key
- `GET /.well-known/agent-feed.xml` — Signed Atom feed
