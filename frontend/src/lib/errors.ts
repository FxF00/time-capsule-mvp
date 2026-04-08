/**
 * Parse ethers.js revert reasons into human-readable messages.
 */
export function parseContractError(err: any): string {
  const message = err?.message || String(err);

  // Try to extract revert reason from ethers error
  let reason = message;

  // ethers v6 encodes revert reasons as hex in error.data or error.reason
  if (err?.reason) {
    reason = err.reason;
  } else if (err?.data) {
    const data = err.data;
    // Check for known error signatures
    if (data === "0x08c379a0") {
      // Error(string) — standard revert
      try {
        // The revert reason is encoded after the 4-byte selector
        const hex = data.slice(10);
        // Decode ASCII hex
        reason = hex2ascii(hex);
      } catch {
        reason = "Transaction reverted";
      }
    } else {
      // Check for custom error selectors
      reason = parseCustomError(data) || message;
    }
  } else if (message.includes("TimeLockActive")) {
    reason = "Capsule is still locked";
  } else if (message.includes("NotBeneficiary")) {
    reason = "You are not the beneficiary of this capsule";
  } else if (message.includes("AlreadyClaimed")) {
    reason = "You have already claimed this capsule";
  } else if (message.includes("AlreadyWithdrawn")) {
    reason = "This capsule has already been withdrawn";
  } else if (message.includes("user rejected") || message.includes("User denied")) {
    reason = "Transaction was rejected in your wallet";
  } else if (message.includes("insufficient funds")) {
    reason = "Insufficient funds to complete this transaction";
  }

  return reason;
}

function parseCustomError(data: string): string | null {
  // Known custom error selectors (keccak256 of error signatures)
  const known: Record<string, string> = {
    "0x1f6106ee": "Capsule is still locked",      // TimeLockActive()
    "0x5c1b8673": "You are not the beneficiary of this capsule", // NotBeneficiary()
    "0x2f8f3cc8": "You have already claimed this capsule",        // AlreadyClaimed()
    "0x3b9c27a2": "This capsule has already been withdrawn",      // AlreadyWithdrawn()
  };

  // Try both exact match and prefix match
  if (known[data]) return known[data];
  const prefix = data.slice(0, 10);
  return known[prefix] || null;
}

function hex2ascii(hex: string): string {
  let str = "";
  for (let i = 0; i < hex.length; i += 2) {
    const charCode = parseInt(hex.slice(i, i + 2), 16);
    if (charCode === 0) break; // stop at null terminator
    str += String.fromCharCode(charCode);
  }
  // Remove padding (solidity pads right with 0x20 spaces)
  return str.replace(/ +$/, "");
}
