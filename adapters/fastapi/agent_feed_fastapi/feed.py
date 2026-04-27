import base64
import json
import math
from typing import NamedTuple, Literal, Any
from xml.etree import ElementTree as ET
from urllib.parse import urlparse
from cryptography.hazmat.primitives.asymmetric import ed25519

FeedStatus = Literal["active", "terminated", "migrated"]
EntryType = Literal["endpoint-announcement", "schema-change", "deprecation"]
NS, ATOM_NS = "https://agent-feed.dev/ns/v0", "http://www.w3.org/2005/Atom"


class Keypair(NamedTuple):
    public_key: bytes
    private_key: bytes


class Entry(NamedTuple):
    id: str
    type: EntryType
    updated: str
    payload: dict


class BuildFeedInput(NamedTuple):
    feed_id: str
    title: str
    updated: str
    feed_status: FeedStatus
    spec_version: int
    entries: list[Entry]
    keypair: Keypair
    migrated_to: str | None = None


def canonicalize(v: Any) -> str:
    def walk(x):
        if x is None or isinstance(x, bool):
            return x
        if isinstance(x, (int, float)):
            if isinstance(x, float) and not math.isfinite(x):
                raise ValueError("non-finite number")
            return x
        if isinstance(x, list):
            return [walk(i) for i in x]
        return {k: walk(x[k]) for k in sorted(x.keys())} if isinstance(x, dict) else x

    return json.dumps(
        walk(v), separators=(",", ":"), sort_keys=True, ensure_ascii=False
    )


def b64u(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode("ascii")


def from_b64u(s: str) -> bytes:
    padding = (4 - (len(s) % 4)) % 4
    return base64.urlsafe_b64decode(s + "=" * padding)


def generate_keypair() -> Keypair:
    priv = ed25519.Ed25519PrivateKey.generate()
    return Keypair(
        public_key=priv.public_key().public_bytes_raw(),
        private_key=priv.private_bytes_raw(),
    )


def sign_bytes(private_key: bytes, message: bytes) -> bytes:
    return ed25519.Ed25519PrivateKey.from_private_bytes(private_key).sign(message)


def verify_bytes(public_key: bytes, message: bytes, signature: bytes) -> bool:
    try:
        ed25519.Ed25519PublicKey.from_public_bytes(public_key).verify(
            signature, message
        )
        return True
    except:
        return False


def did_web_from_origin(origin: str) -> str:
    parsed = urlparse(origin)
    host = f"{parsed.hostname}%3A{parsed.port}" if parsed.port else parsed.hostname
    return f"did:web:{host}"


def did_document_from_keypair(origin: str, keypair: Keypair) -> dict:
    did = did_web_from_origin(origin)
    return {
        "id": did,
        "verificationMethod": [
            {
                "id": f"{did}#key-1",
                "type": "Ed25519VerificationKey2020",
                "controller": did,
                "publicKeyMultibase": "u" + b64u(keypair.public_key),
            }
        ],
    }


def build_feed(inp: BuildFeedInput) -> str:
    ET.register_namespace("", ATOM_NS)
    ET.register_namespace("af", NS)
    feed = ET.Element("feed", xmlns=ATOM_NS)
    feed.set("{http://www.w3.org/2000/xmlns/}af", NS)
    for tag, text in [
        ("id", inp.feed_id),
        ("title", inp.title),
        ("updated", inp.updated),
    ]:
        e = ET.SubElement(feed, tag)
        e.text = text
    ET.SubElement(feed, f"{{{NS}}}spec-version").text = str(inp.spec_version)
    ET.SubElement(feed, f"{{{NS}}}feed-status").text = inp.feed_status
    if inp.migrated_to:
        ET.SubElement(feed, f"{{{NS}}}migrated-to").text = inp.migrated_to
    for entry in inp.entries:
        canonical = canonicalize(entry.payload)
        sig = sign_bytes(inp.keypair.private_key, canonical.encode("utf-8"))
        entry_elem = ET.SubElement(feed, "entry")
        for tag, text in [
            ("id", entry.id),
            ("title", entry.type),
            ("updated", entry.updated),
        ]:
            e = ET.SubElement(entry_elem, tag)
            e.text = text
        ET.SubElement(entry_elem, f"{{{NS}}}type").text = entry.type
        content = ET.SubElement(entry_elem, "content")
        content.set("type", "application/json")
        content.text = canonical
        sig_elem = ET.SubElement(entry_elem, f"{{{NS}}}sig")
        sig_elem.set("type", "ed25519")
        sig_elem.text = b64u(sig)
    return '<?xml version="1.0" encoding="UTF-8"?>\n' + ET.tostring(
        feed, encoding="unicode"
    )


def mount(app, cfg):
    from dataclasses import dataclass, field
    from datetime import datetime, timezone
    from fastapi import APIRouter
    from fastapi.responses import Response

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

    router = APIRouter()
    did_doc = did_document_from_keypair(cfg.origin, cfg.keypair)

    @router.get("/.well-known/did.json")
    async def did():
        return did_doc

    @router.get("/.well-known/agent-feed.xml")
    async def feed():
        return Response(
            build_feed(
                BuildFeedInput(
                    cfg.feed_id,
                    cfg.title,
                    cfg.updated,
                    cfg.feed_status,
                    cfg.spec_version,
                    cfg.entries,
                    cfg.keypair,
                    cfg.migrated_to,
                )
            ),
            media_type="application/atom+xml",
        )

    app.include_router(router)
