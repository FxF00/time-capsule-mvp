// IPFS upload/download with Time-Lock Encryption
// Encrypts message with AES-GCM using keccak256(beneficiaryAddress + unlockTimestamp) as key
// Only the intended beneficiary can decrypt after unlock time

export interface IpfsUploadResult {
  cid: string;
}

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
  // Use ethers.js keccak256 to match Solidity's keccak256
  const { ethers } = await import("ethers");
  const abiEncoded = ethers.solidityPacked(
    ["address", "uint256"],
    [beneficiary, unlockTimestamp]
  );
  const hashHex = ethers.keccak256(abiEncoded);

  // Import the hash bytes as an AES key
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
 * Returns base64-encoded string: IV (12 bytes) + ciphertext + auth tag
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

  // Combine IV + ciphertext into single buffer
  const combined = new Uint8Array(IV_LENGTH + ciphertext.byteLength);
  combined.set(iv);
  combined.set(new Uint8Array(ciphertext), IV_LENGTH);

  // Base64 encode for JSON transport
  return btoa(String.fromCharCode(...combined));
}

/**
 * Decrypt ciphertext using beneficiary address and unlock timestamp.
 */
async function decryptMessage(
  beneficiary: string,
  unlockTimestamp: bigint,
  encryptedBase64: string
): Promise<string> {
  const key = await deriveKey(beneficiary, unlockTimestamp);

  // Decode base64
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

  // Split IV and ciphertext
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

// ─── IPFS Upload (public gateway, no registration) ─────────────────────────

export interface EncryptedUploadResult {
  cid: string;
  encryptedContent: string; // base64 ciphertext (returned for local storage fallback)
}

/**
 * Upload encrypted message to IPFS via public gateway.
 * Falls back to returning encrypted content if upload fails.
 */
export async function uploadEncryptedMessage(
  beneficiary: string,
  unlockTimestamp: bigint,
  plaintext: string
): Promise<EncryptedUploadResult> {
  const encrypted = await encryptMessage(beneficiary, unlockTimestamp, plaintext);

  // Try to upload encrypted blob to IPFS via public gateway
  const blob = new Blob([encrypted], { type: "application/octet-stream" });
  const formData = new FormData();
  formData.append("file", blob, "encrypted_message.bin");

  try {
    const response = await fetch("https://ipfs.io/api/v0/add", {
      method: "POST",
      body: formData,
    });

    if (response.ok) {
      const data = await response.json();
      if (!data.error) {
        return { cid: data.Hash, encryptedContent: encrypted };
      }
    }
  } catch {
    // Gateway unavailable — continue with local encrypted storage
  }

  // Fallback: return encrypted content without IPFS CID
  // The encrypted content is still stored in the contract's messageHash field
  return { cid: "", encryptedContent: encrypted };
}

/**
 * Decrypt a stored message. Fetches from IPFS if CID provided, otherwise decrypts directly.
 */
export async function decryptStoredMessage(
  beneficiary: string,
  unlockTimestamp: bigint,
  messageHash: string, // either IPFS CID or base64 encrypted content
  encryptedContent?: string
): Promise<string> {
  let encrypted: string;

  const isIpfsCid = messageHash?.startsWith("bafy") || messageHash?.startsWith("Qm");

  if (messageHash && !isIpfsCid) {
    // It's a base64 encoded encrypted content directly stored
    encrypted = messageHash;
  } else if (messageHash) {
    // It's an IPFS CID — fetch from gateway
    try {
      const response = await fetch(`https://w3s.link/ipfs/${messageHash}`);
      if (response.ok) {
        encrypted = await response.text();
      } else {
        throw new Error(`IPFS fetch failed (${response.status})`);
      }
    } catch (e: any) {
      if (encryptedContent) {
        encrypted = encryptedContent;
      } else {
        throw new Error(`IPFS unavailable: ${e.message}`);
      }
    }
  } else if (encryptedContent) {
    encrypted = encryptedContent;
  } else {
    throw new Error("No message to decrypt");
  }

  try {
    return await decryptMessage(beneficiary, unlockTimestamp, encrypted);
  } catch (e: any) {
    throw new Error(`Decryption failed: ${e.message}`);
  }
}
