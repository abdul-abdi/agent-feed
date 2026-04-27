from dataclasses import dataclass, field
from datetime import datetime, timezone
from fastapi import APIRouter
from fastapi.responses import Response
from .crypto import Keypair, did_document_from_keypair
from .feed import build_feed, Entry, FeedStatus, BuildFeedInput


@dataclass
class AgentFeedConfig:
    origin: str
    entries: list[Entry]
    keypair: Keypair
    feed_status: FeedStatus = "active"
    spec_version: int = 0
    migrated_to: str | None = None
    feed_id: str = field(default="")
    title: str = field(default="")
    updated: str = field(default="")

    def __post_init__(self):
        if not self.feed_id:
            self.feed_id = f"urn:af:{self.origin}:feed"
        if not self.title:
            self.title = "Agent Feed"
        if not self.updated:
            self.updated = (
                self.entries[-1].updated
                if self.entries
                else datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
            )


def mount(app, config: AgentFeedConfig) -> None:
    """Mount /.well-known/did.json and /.well-known/agent-feed.xml"""
    router = APIRouter()
    did_doc = did_document_from_keypair(config.origin, config.keypair)

    @router.get("/.well-known/did.json")
    async def did():
        return did_doc

    @router.get("/.well-known/agent-feed.xml")
    async def feed():
        return Response(
            build_feed(
                BuildFeedInput(
                    config.feed_id,
                    config.title,
                    config.updated,
                    config.feed_status,
                    config.spec_version,
                    config.entries,
                    config.keypair,
                    config.migrated_to,
                )
            ),
            media_type="application/atom+xml",
        )

    app.include_router(router)
