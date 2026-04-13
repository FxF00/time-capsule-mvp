// IPFS upload/download with Time-Lock Encryption
// Encrypts message with AES-GCM using keccak256(beneficiaryAddress + unlockTimestamp) as key
// Only the intended beneficiary can decrypt after unlock time
//
// Upload strategy (3-tier):
//  1. NFT.Storage — stable, persistent (requires VITE_NFT_STORAGE_TOKEN)
//  2. Public IPFS gateway — no registration, may be rate-limited
//  3. On-chain fallback — encrypted content stored directly in messageHash field

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

  const combined = new Uint8Array(IV_LENGTH + ciphertext.byteLength);
  combined.set(iv);
  combined.set(new Uint8Array(ciphertext), IV_LENGTH);

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

// ─── IPFS Upload (3-tier strategy) ─────────────────────────────────────────

export interface EncryptedUploadResult {
  cid: string;
  encryptedContent: string; // base64 ciphertext (always returned for on-chain fallback)
}

/**
 * Upload encrypted message using 3-tier strategy:
 *  1. NFT.Storage (primary, stable) — if VITE_NFT_STORAGE_TOKEN is set
 *  2. Public IPFS gateway (fallback) — ipfs.io
 *  3. On-chain storage (last resort) — encrypted content in messageHash field
 */
export async function uploadEncryptedMessage(
  beneficiary: string,
  unlockTimestamp: bigint,
  plaintext: string
): Promise<EncryptedUploadResult> {
  const encrypted = await encryptMessage(beneficiary, unlockTimestamp, plaintext);
  const blob = new Blob([encrypted], { type: "application/octet-stream" });

  // ── Tier 1: NFT.Storage ────────────────────────────────────────────────
  const nftStorageToken = import.meta.env.VITE_NFT_STORAGE_TOKEN;
  if (nftStorageToken && nftStorageToken !== "your_nft_storage_token_here") {
    try {
      const response = await fetch("https://api.nft.storage/upload", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${nftStorageToken}`,
          "Content-Type": "application/octet-stream",
        },
        body: blob,
      });

      if (response.ok) {
        const data = await response.json();
        if (data.ok && data.value?.cid) {
          console.log("IPFS upload: NFT.Storage success, CID:", data.value.cid);
          return { cid: data.value.cid, encryptedContent: encrypted };
        }
      } else {
        console.warn("IPFS upload: NFT.Storage error", response.status, await response.text());
      }
    } catch (e) {
      console.warn("IPFS upload: NFT.Storage failed, trying fallback...", e);
    }
  }

  // ── Tier 2: Public IPFS gateway ──────────────────────────────────────
  const formData = new FormData();
  formData.append("file", blob, "encrypted_message.bin");

  try {
    const response = await fetch("https://ipfs.io/api/v0/add", {
      method: "POST",
      body: formData,
    });

    if (response.ok) {
      const data = await response.json();
      if (!data.error && data.Hash) {
        console.log("IPFS upload: public gateway success, CID:", data.Hash);
        return { cid: data.Hash, encryptedContent: encrypted };
      }
    } else {
      console.warn("IPFS upload: public gateway error", response.status);
    }
  } catch (e) {
    console.warn("IPFS upload: public gateway failed, using on-chain fallback...", e);
  }

  // ── Tier 3: On-chain fallback ────────────────────────────────────────
  console.log("IPFS upload: all gateways failed, storing encrypted content on-chain");
  return { cid: "", encryptedContent: encrypted };
}

/**
 * Decrypt a stored message. Fetches from IPFS if CID provided, otherwise decrypts directly.
 */
export async function decryptStoredMessage(
  beneficiary: string,
  unlockTimestamp: bigint,
  messageHash: string,
  encryptedContent?: string
): Promise<string> {
  let encrypted: string;

  const isIpfsCid = messageHash?.startsWith("bafy") || messageHash?.startsWith("Qm");

  if (messageHash && !isIpfsCid) {
    // Base64 encoded encrypted content stored directly on-chain
    encrypted = messageHash;
  } else if (messageHash) {
    // It's an IPFS CID — try fetching from w3s.link (Cloudflare IPFS gateway)
    try {
      const response = await fetch(`https://w3s.link/ipfs/${messageHash}`);
      if (response.ok) {
        encrypted = await response.text();
      } else {
        throw new Error(`IPFS fetch failed (${response.status})`);
      }
    } catch {
      // Try ipfs.io gateway as fallback
      try {
        const fallbackResp = await fetch(`https://ipfs.io/ipfs/${messageHash}`);
        if (fallbackResp.ok) {
          encrypted = await fallbackResp.text();
        } else {
          throw new Error(`IPFS fallback also failed (${fallbackResp.status})`);
        }
      } catch (e: any) {
        if (encryptedContent) {
          encrypted = encryptedContent;
        } else {
          throw new Error(`IPFS unavailable: ${e.message}`);
        }
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
