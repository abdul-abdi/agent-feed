#!/usr/bin/env python3
"""Verification test: generate Python feed, verify with TypeScript parser."""

import json
import sys
from datetime import datetime, timezone
from pathlib import Path

# Add adapters to path
sys.path.insert(0, str(Path(__file__).parent))

from agent_feed_fastapi import (
    generate_keypair,
    did_document_from_keypair,
    Entry,
)
from agent_feed_fastapi.feed import build_feed, BuildFeedInput


def main():
    # Generate keypair
    keypair = generate_keypair()
    origin = "https://example.com"

    # Generate DID document
    did_doc = did_document_from_keypair(origin, keypair)

    # Create one endpoint-announcement entry
    now = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
    entries = [
        Entry(
            id="urn:af:example.com:ep-1",
            type="endpoint-announcement",
            updated=now,
            payload={
                "asserted-at": now,
                "endpoint": "https://example.com/api",
                "endpoint-id": "api",
                "protocol": "rest",
                "version": "1.0",
            },
        )
    ]

    # Build feed
    feed_xml = build_feed(
        BuildFeedInput(
            feed_id="urn:af:example.com:feed",
            title="Example Feed",
            updated=now,
            feed_status="active",
            spec_version=0,
            entries=entries,
            keypair=keypair,
        )
    )

    # Save artifacts
    Path("/tmp/python-feed.xml").write_text(feed_xml)
    Path("/tmp/python-did.json").write_text(json.dumps(did_doc, indent=2))

    print("Generated:")
    print("  XML: /tmp/python-feed.xml")
    print("  DID: /tmp/python-did.json")
    print("\nXML (first 500 chars):")
    print(feed_xml[:500])
    print("\nDID:")
    print(json.dumps(did_doc, indent=2))


if __name__ == "__main__":
    main()
