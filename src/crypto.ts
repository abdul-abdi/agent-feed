import * as ed from "@noble/ed25519";

export interface Keypair {
  publicKey: Uint8Array;
  privateKey: Uint8Array;
}

export interface DidVerificationMethod {
  id: string;
  type: "Ed25519VerificationKey2020";
  controller: string;
  publicKeyMultibase: string;
}

export interface DidDocument {
  id: string;
  verificationMethod: DidVerificationMethod[];
}

export async function generateKeypair(): Promise<Keypair> {
  const privateKey = ed.utils.randomPrivateKey();
  const publicKey = await ed.getPublicKeyAsync(privateKey);
  return { publicKey, privateKey };
}

export function signBytes(
  privateKey: Uint8Array,
  message: Uint8Array,
): Promise<Uint8Array> {
  return ed.signAsync(message, privateKey);
}

export async function verifyBytes(
  publicKey: Uint8Array,
  message: Uint8Array,
  signature: Uint8Array,
): Promise<boolean> {
  try {
    return await ed.verifyAsync(signature, message, publicKey);
  } catch {
    return false;
  }
}

export function didWebFromOrigin(origin: string): string {
  const u = new URL(origin);
  const host = u.port ? `${u.hostname}%3A${u.port}` : u.hostname;
  return `did:web:${host}`;
}

export function b64u(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("base64url");
}

export function fromB64u(s: string): Uint8Array {
  return new Uint8Array(Buffer.from(s, "base64url"));
}

export function publicKeyFromDid(doc: DidDocument): Uint8Array {
  const vm = doc.verificationMethod[0];
  if (!vm) throw new Error("verificationMethod not found");
  const mb = vm.publicKeyMultibase;
  if (!mb.startsWith("u"))
    throw new Error("only base64url multibase ('u' prefix) supported in v0");
  return fromB64u(mb.slice(1));
}

export function didDocumentFromKeypair(
  origin: string,
  kp: Keypair,
): DidDocument {
  const id = didWebFromOrigin(origin);
  return {
    id,
    verificationMethod: [
      {
        id: `${id}#key-1`,
        type: "Ed25519VerificationKey2020",
        controller: id,
        publicKeyMultibase: "u" + b64u(kp.publicKey),
      },
    ],
  };
}
