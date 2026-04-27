import { test, expect } from "bun:test";
import {
  generateKeypair,
  signBytes,
  verifyBytes,
  didWebFromOrigin,
  didDocumentFromKeypair,
  publicKeyFromDid,
  b64u,
  fromB64u,
} from "../src/crypto.ts";

test("generates valid Ed25519 keypair", async () => {
  const kp = await generateKeypair();
  expect(kp.publicKey.length).toBe(32);
  expect(kp.privateKey.length).toBe(32);
});

test("sign/verify roundtrip", async () => {
  const kp = await generateKeypair();
  const msg = new TextEncoder().encode('{"a":1,"b":2}');
  const sig = await signBytes(kp.privateKey, msg);
  expect(await verifyBytes(kp.publicKey, msg, sig)).toBe(true);
});

test("verify rejects tampered message", async () => {
  const kp = await generateKeypair();
  const msg = new TextEncoder().encode('{"a":1}');
  const sig = await signBytes(kp.privateKey, msg);
  const bad = new TextEncoder().encode('{"a":2}');
  expect(await verifyBytes(kp.publicKey, bad, sig)).toBe(false);
});

test("verify rejects wrong public key", async () => {
  const kpA = await generateKeypair();
  const kpB = await generateKeypair();
  const msg = new TextEncoder().encode("hello");
  const sig = await signBytes(kpA.privateKey, msg);
  expect(await verifyBytes(kpB.publicKey, msg, sig)).toBe(false);
});

test("didWebFromOrigin", () => {
  expect(didWebFromOrigin("https://example.com")).toBe("did:web:example.com");
  expect(didWebFromOrigin("https://example.com:8443")).toBe(
    "did:web:example.com%3A8443",
  );
});

test("did document round-trips through publicKeyFromDid", async () => {
  const kp = await generateKeypair();
  const doc = didDocumentFromKeypair("https://example.com", kp);
  const recovered = publicKeyFromDid(doc);
  expect(Buffer.from(recovered).equals(Buffer.from(kp.publicKey))).toBe(true);
});

test("publicKeyFromDid selects by signer id when provided", async () => {
  const kp = await generateKeypair();
  const doc = didDocumentFromKeypair("https://example.com", kp);
  const recovered = publicKeyFromDid(doc, "did:web:example.com#key-1");
  expect(Buffer.from(recovered).equals(Buffer.from(kp.publicKey))).toBe(true);
});

test("publicKeyFromDid throws when signer id not found", async () => {
  const kp = await generateKeypair();
  const doc = didDocumentFromKeypair("https://example.com", kp);
  expect(() =>
    publicKeyFromDid(doc, "did:web:example.com#nonexistent"),
  ).toThrow();
});

test("b64u roundtrip", () => {
  const bytes = new Uint8Array([0, 1, 2, 250, 251, 252, 253, 254, 255]);
  expect(fromB64u(b64u(bytes))).toEqual(bytes);
});
