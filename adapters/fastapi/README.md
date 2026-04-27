# agent-feed-fastapi

FastAPI adapter for the agent-feed protocol v0.

## Installation

```bash
pip install -e .
```

Requires Python 3.11+, fastapi>=0.110, cryptography>=42.

## Quick Start

```python
from datetime import datetime, timezone
from fastapi import FastAPI
from agent_feed_fastapi import mount, Entry, generate_keypair, AgentFeedConfig

app = FastAPI()

# Generate keypair
keypair = generate_keypair()

# Create entries
now = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
entries = [
    Entry(
        id="urn:af:example.com:ep-1",
        type="endpoint-announcement",
        updated=now,
        payload={
            "endpoint-id": "api",
            "endpoint": "https://example.com/api/v1",
            "protocol": "rest",
            "version": "1.0",
            "asserted-at": now,
        },
    )
]

# Mount agent-feed routes
config = AgentFeedConfig(
    origin="https://example.com",
    entries=entries,
    keypair=keypair,
)
mount(app, config)
```

Routes:

- `GET /.well-known/did.json` — DID document with Ed25519 public key
- `GET /.well-known/agent-feed.xml` — Signed Atom feed

See `example_app.py` for a runnable example.
