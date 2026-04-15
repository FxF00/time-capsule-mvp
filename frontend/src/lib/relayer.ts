const RELAYER_URL = import.meta.env.VITE_RELAYER_URL || "http://localhost:3001";

export interface RelayRequest {
  capsuleId: number;
  beneficiary: string;
  signature: string;
}

export interface RelayResponse {
  txHash: string;
}

export class RelayerError extends Error {
  constructor(
    message: string,
    public readonly statusCode?: number
  ) {
    super(message);
    this.name = "RelayerError";
  }
}

/**
 * Submit a signed claim message to the relayer endpoint.
 * The relayer will broadcast the transaction paying for gas.
 */
export async function submitClaimSignature(
  capsuleId: number,
  beneficiary: string,
  signature: string
): Promise<RelayResponse> {
  const res = await fetch(`${RELAYER_URL}/relay`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ capsuleId, beneficiary, signature }),
  });

  if (!res.ok) {
    let message = `Relayer error: ${res.status}`;
    try {
      const body = await res.text();
      if (body) message = body;
    } catch { /* ignore */ }
    throw new RelayerError(message, res.status);
  }

  return res.json() as Promise<RelayResponse>;
}

/**
 * Poll the relayer for transaction status.
 */
export async function getRelayStatus(txHash: string): Promise<{ status: string; confirmed: boolean }> {
  const res = await fetch(`${RELAYER_URL}/status/${txHash}`);
  if (!res.ok) {
    throw new RelayerError(`Status check failed: ${res.status}`, res.status);
  }
  return res.json() as Promise<{ status: string; confirmed: boolean }>;
}
