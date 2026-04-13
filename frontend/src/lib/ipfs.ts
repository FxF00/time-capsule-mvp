// Encrypted message storage with Time-Lock Encryption
// Encrypts message with AES-GCM using keccak256(beneficiaryAddress + unlockTimestamp) as key
// Only the intended beneficiary can decrypt after unlock time
// Encrypted content is stored directly in the contract's messageHash field (no IPFS).

// ─── Encryption / Decryption ────────────────────────────────────────────────

const ALGORITHM = "AES-GCM";
const KEY_LENGTH = 256;
const IV_LENGTH = 12; // 96-bit IV for AES-GCM

/**
 * Derive a symmetric key from beneficiary address and unlock timestamp.
 * Key = keccak256(abi.encode(beneficiary, unlockTimestamp))
 * Result is used as raw bytes for AES-GCM.
 */
async function deriveKey(beneficiary: string, unlockTimestamp: bigint): Promise<CryptoKey> {
  const { ethers } = await import("ethers");
  const abiEncoded = ethers.solidityPacked(
    ["address", "uint256"],
    [beneficiary, unlockTimestamp]
  );
  const hashHex = ethers.keccak256(abiEncoded);

  const keyBytes = ethers.toBeArray(hashHex);
  return crypto.subtle.importKey(
    "raw",
    new Uint8Array(keyBytes),
    { name: ALGORITHM, length: KEY_LENGTH },
    false,
    ["encrypt", "decrypt"]
  );
}

/**
 * Encrypt plaintext message.
 * Returns base64-encoded string: IV (12 bytes) + ciphertext + auth tag (16 bytes)
 */
async function encryptMessage(
  beneficiary: string,
  unlockTimestamp: bigint,
  plaintext: string
): Promise<string> {
  const key = await deriveKey(beneficiary, unlockTimestamp);
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));
  const encoded = new TextEncoder().encode(plaintext);

  const ciphertext = await crypto.subtle.encrypt(
    { name: ALGORITHM, iv },
    key,
    encoded
  );

  const combined = new Uint8Array(IV_LENGTH + ciphertext.byteLength);
  combined.set(iv);
  combined.set(new Uint8Array(ciphertext), IV_LENGTH);

  return btoa(String.fromCharCode(...combined));
}

/**
 * Decrypt base64-encoded ciphertext using beneficiary address and unlock timestamp.
 */
async function decryptMessage(
  beneficiary: string,
  unlockTimestamp: bigint,
  encryptedBase64: string
): Promise<string> {
  const key = await deriveKey(beneficiary, unlockTimestamp);

  let bytes: Uint8Array;
  try {
    const binary = atob(encryptedBase64);
    bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
  } catch {
    throw new Error(`Decrypt: base64 decode failed for "${encryptedBase64.slice(0, 20)}..." (len=${encryptedBase64.length})`);
  }

  if (bytes.length < IV_LENGTH + 16) {
    throw new Error(`Decrypt: ciphertext too short (${bytes.length} bytes, need ${IV_LENGTH + 16}+)`);
  }

  const iv = bytes.slice(0, IV_LENGTH);
  const ciphertext = bytes.slice(IV_LENGTH);

  let decrypted: ArrayBuffer;
  try {
    decrypted = await crypto.subtle.decrypt(
      { name: ALGORITHM, iv },
      key,
      ciphertext
    );
  } catch (e: any) {
    throw new Error(`Decrypt: AES-GCM auth failed — wrong key or corrupted data (${e.message || e})`);
  }

  try {
    return new TextDecoder().decode(decrypted);
  } catch {
    throw new Error("Decrypt: UTF-8 decode failed — wrong key or corrupt plaintext");
  }
}

// ─── Message Storage ─────────────────────────────────────────────────────────

export interface EncryptedUploadResult {
  cid: string; // empty string — no IPFS, stored on-chain
  encryptedContent: string; // base64 ciphertext stored in messageHash field
}

/**
 * Encrypt and prepare message for on-chain storage.
 * The encrypted content is stored directly in the contract's messageHash field.
 */
export async function uploadEncryptedMessage(
  beneficiary: string,
  unlockTimestamp: bigint,
  plaintext: string
): Promise<EncryptedUploadResult> {
  const encrypted = await encryptMessage(beneficiary, unlockTimestamp, plaintext);
  return { cid: "", encryptedContent: encrypted };
}

/**
 * Decrypt a message stored on-chain in the messageHash field.
 */
export async function decryptStoredMessage(
  beneficiary: string,
  unlockTimestamp: bigint,
  messageHash: string,
  _encryptedContent?: string
): Promise<string> {
  if (!messageHash) {
    throw new Error("No message to decrypt");
  }

  try {
    return await decryptMessage(beneficiary, unlockTimestamp, messageHash);
  } catch (e: any) {
    throw new Error(`Decryption failed: ${e.message}`);
  }
}
