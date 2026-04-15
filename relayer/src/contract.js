import { ethers } from 'ethers';

const ABI = [
  'function claimBySig(uint256 capsuleId, bytes calldata signature) external',
  'function claimedBySig(uint256,address) view returns (bool)',
  'function beneficiaryNonces(address) view returns (uint256)',
  'function capsules(uint256) view returns (address founder, uint256 unlockTimestamp, bool isWithdrawn, string messageHash, uint256 depositedValue, uint256 createdAt, uint256 lockDuration, uint256 originalUnlockTime, address primaryBeneficiary)'
];

export function getContract(provider, contractAddress) {
  return new ethers.Contract(contractAddress, ABI, provider);
}

export async function getClaimStatus(contract, capsuleId, beneficiary) {
  const [capsule, claimed] = await Promise.all([
    contract.capsules(capsuleId),
    contract.claimedBySig(capsuleId, beneficiary),
  ]);
  return { capsule, claimed };
}
