import base64
from typing import NamedTuple
from urllib.parse import urlparse
from cryptography.hazmat.primitives.asymmetric import ed25519


class Keypair(NamedTuple):
    public_key: bytes
    private_key: bytes


def generate_keypair() -> Keypair:
    """Generate a new Ed25519 keypair."""
    priv = ed25519.Ed25519PrivateKey.generate()
    return Keypair(
        public_key=priv.public_key().public_bytes_raw(),
        private_key=priv.private_bytes_raw(),
    )


def sign_bytes(private_key: bytes, message: bytes) -> bytes:
    """Sign a message with Ed25519 private key."""
    return ed25519.Ed25519PrivateKey.from_private_bytes(private_key).sign(message)


def verify_bytes(public_key: bytes, message: bytes, signature: bytes) -> bool:
    """Verify an Ed25519 signature."""
    try:
        ed25519.Ed25519PublicKey.from_public_bytes(public_key).verify(
            signature, message
        )
        return True
    except Exception:
        return False


def b64u(data: bytes) -> str:
    """Encode bytes as base64url without padding."""
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode("ascii")


def from_b64u(s: str) -> bytes:
    """Decode base64url string (with or without padding) to bytes."""
    padding = (4 - (len(s) % 4)) % 4
    return base64.urlsafe_b64decode(s + "=" * padding)


def did_web_from_origin(origin: str) -> str:
    """Generate did:web from origin URL, percent-encoding port if present."""
    parsed = urlparse(origin)
    host = f"{parsed.hostname}%3A{parsed.port}" if parsed.port else parsed.hostname
    return f"did:web:{host}"


def did_document_from_keypair(origin: str, keypair: Keypair) -> dict:
    """Generate a DID document for a keypair."""
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
