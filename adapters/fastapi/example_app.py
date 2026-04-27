from datetime import datetime, timezone
from dataclasses import dataclass, field
from fastapi import FastAPI
from agent_feed_fastapi import mount, Entry, generate_keypair

app = FastAPI()
keypair = generate_keypair()
now = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
entries = [
    Entry(
        id="urn:af:example.com:ep-1",
        type="endpoint-announcement",
        updated=now,
        payload={
            "endpoint-id": "api",
            "endpoint": "https://example.com/api",
            "protocol": "rest",
            "version": "1.0",
            "asserted-at": now,
        },
    )
]


@dataclass
class AgentFeedConfig:
    origin: str
    entries: list[Entry]
    keypair: any
    feed_status: str = "active"
    spec_version: int = 0
    migrated_to: str | None = None
    feed_id: str = field(default="")
    title: str = field(default="")
    updated: str = field(default="")


config = AgentFeedConfig(origin="https://example.com", entries=entries, keypair=keypair)
mount(app, config)


@app.get("/")
async def root():
    return {"message": "Agent feed available at /.well-known/agent-feed.xml"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="127.0.0.1", port=8000)
