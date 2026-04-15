import { ethers } from "ethers";
import { CONTRACT_ADDRESS } from "./contracts";

// EIP-712 domain for TimeCapsuleVault
export const EIP712_DOMAIN = {
  name: "TimeCapsuleVault",
  version: "1",
  chainId: 137, // Polygon Mainnet — adjusted per network via signClaimMessage
  verifyingContract: CONTRACT_ADDRESS,
};

// Must be Record<string, TypedDataField[]> for ethers v6 signTypedData
export const CLAIM_TYPE: Record<string, { name: string; type: string }[]> = {
  Claim: [
    { name: "capsuleId", type: "uint256" },
    { name: "beneficiary", type: "address" },
    { name: "nonce", type: "uint256" },
  ],
};

export interface ClaimMessage {
  capsuleId: number;
  beneficiary: string;
  nonce: number;
}

/**
 * Sign a claim message using EIP-712 typed data signing.
 * Requires a connected signer (MetaMask or WalletConnect).
 */
export async function signClaimMessage(
  capsuleId: number,
  beneficiary: string,
  nonce: number,
  signer: ethers.JsonRpcSigner
): Promise<string> {
  const network = await signer.provider!.getNetwork();
  const chainId = Number(network.chainId);

  const domain = {
    ...EIP712_DOMAIN,
    chainId,
    verifyingContract: CONTRACT_ADDRESS,
  };

  const message: ClaimMessage = {
    capsuleId,
    beneficiary,
    nonce,
  };

  // ethers v6 signTypedData — types must be Record<string, TypedDataField[]>
  const signature = await signer.signTypedData(domain, CLAIM_TYPE, message);
  return signature;
}
