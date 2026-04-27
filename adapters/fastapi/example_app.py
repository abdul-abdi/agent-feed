from datetime import datetime, timezone
from fastapi import FastAPI
from agent_feed_fastapi import mount, Entry, generate_keypair

app = FastAPI()

# Generate keypair
keypair = generate_keypair()

# Create an endpoint-announcement entry
now = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
entries = [
    Entry(
        id="urn:af:example.com:endpoint-1",
        type="endpoint-announcement",
        updated=now,
        payload={
            "endpoint-id": "orders",
            "endpoint": "https://example.com/api/orders",
            "protocol": "rest",
            "version": "1.0",
            "asserted-at": now,
        },
    )
]

# Mount agent-feed
from agent_feed_fastapi import AgentFeedConfig

config = AgentFeedConfig(
    origin="https://example.com",
    entries=entries,
    keypair=keypair,
    feed_status="active",
)
mount(app, config)


@app.get("/")
async def root():
    return {"message": "Agent feed available at /.well-known/agent-feed.xml"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="127.0.0.1", port=8000)
