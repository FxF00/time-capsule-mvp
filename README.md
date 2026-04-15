# Time Capsule — Ethereum dApp

A decentralized time capsule vault on Ethereum. Lock ETH and encrypted messages for one or multiple beneficiaries, with a configurable time lock. Funds and messages are only claimable after the unlock timestamp passes.

---

## Project Stats

| Metric | Value |
|--------|-------|
| Total commits | 79 |
| Development period | 2026-04-08 to 2026-04-15 |
| Solidity (lines) | 295 |
| TypeScript / TSX (lines) | 7,940 |
| CSS (lines) | 1,153 |
| **Total source lines** | **~9,400** |

---

## Features

- **Time-locked vault** — ETH is locked until a user-defined unlock timestamp
- **Multi-beneficiary** — up to 10 beneficiaries with percentage-based allocation
- **AES-256-GCM encrypted messages** — encrypted with `keccak256(beneficiary + unlockTimestamp)`, stored on-chain
- **Shareable claim links** — generate a `/receive/:founder/:capsuleId` link for beneficiaries
- **Live countdown timer** — synced to chain block timestamp
- **Transaction history** — on-chain event parsing for full audit trail
- **Gas estimation** — pre-flight gas estimate before submitting transactions
- **Silver liquid metal UI** — animated background with vault rings, floating capsules, clock ticks

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Smart contract | Solidity 0.8.x, Hardhat |
| Frontend | React 18, TypeScript, Vite |
| Styling | Custom CSS (no framework) |
| Wallet | MetaMask via ethers.js v6 |
| Encryption | AES-256-GCM (Web Crypto API) |
| Network | Polygon Amoy testnet / Hardhat localhost |

---

## Smart Contracts

### `TimeCapsuleVault.sol`
Core vault contract. Handles capsule creation, beneficiary allocation, time-lock enforcement, and ETH distribution.

```
Key functions:
  createCapsule(address[], uint256[], uint256, string)  — create capsule with beneficiaries + lock duration
  claim(uint256)                                        — claim ETH after unlock
  cancelCapsule(uint256)                                — founder cancels before unlock
  setMessageHash(uint256, string)                       — attach encrypted message hash
  capsules(uint256)                                     — read capsule state
  getUnlockTimestamp(uint256)                           — get unlock time for decryption key derivation
```

### `MessageRegistry.sol`
Stores encrypted message hashes on-chain, associated to capsule IDs.

---

## Getting Started

### Prerequisites
- Node.js 22+
- MetaMask browser extension

### 1. Install dependencies
```bash
cd "Assignment 2/tc-mvp"
npm install
```

### 2. Start local Hardhat node
```bash
npm run node
```

### 3. Deploy contracts (new terminal)
```bash
cd contracts
npx hardhat run scripts/deploy.ts --network localhost
```

Copy the deployed contract address into `frontend/.env`:
```
VITE_CONTRACT_ADDRESS=<deployed address>
```

### 4. Start frontend
```bash
npm run dev:frontend
# http://localhost:5173
```

### 5. Configure MetaMask
- Network: `Localhost 8545`
- Chain ID: `31337`
- Import a test account using one of the private keys printed by Hardhat

---

## Project Structure

```
tc-mvp/
├── contracts/
│   ├── contracts/
│   │   ├── TimeCapsuleVault.sol     # Core vault logic
│   │   └── MessageRegistry.sol     # On-chain message hash storage
│   └── scripts/
│       └── deploy.ts               # Hardhat deploy script
├── frontend/
│   ├── src/
│   │   ├── App.tsx                 # Router + background FX + navbar
│   │   ├── pages/
│   │   │   ├── CreateCapsule.tsx   # Create flow
│   │   │   ├── ClaimCapsule.tsx    # Claim flow (lookup + share-link mode)
│   │   │   ├── History.tsx         # On-chain event history
│   │   │   └── ReceiveCapsule.tsx  # Beneficiary receive page
│   │   ├── components/
│   │   │   ├── CapsuleCard.tsx     # Capsule info display
│   │   │   ├── CountdownTimer.tsx  # Chain-synced countdown
│   │   │   ├── DateTimePicker.tsx  # Unlock time selector
│   │   │   └── DurationSelector.tsx
│   │   ├── hooks/
│   │   │   └── useTimeCapsule.ts   # Contract interaction hook
│   │   └── lib/
│   │       ├── contracts.ts        # ethers.js contract bindings
│   │       └── ipfs.ts             # AES-256 encrypt/decrypt
│   └── index.css                   # Design system + animations
├── test/
│   └── TimeCapsuleVault.test.ts    # 38 unit tests
└── scripts/
    └── e2e-test.ts                 # End-to-end test script
```

---

## Testing

```bash
# Unit tests (38 tests)
npm test

# End-to-end test (requires running node + deployed contract)
node scripts/e2e-test.ts
```

---

## Environment Variables

**`frontend/.env`**
```
VITE_CONTRACT_ADDRESS=0x...   # Deployed TimeCapsuleVault address
VITE_NFT_STORAGE_TOKEN=...    # Optional: NFT.Storage token for IPFS fallback
```

**`.env`** (root, for Hardhat scripts)
```
PRIVATE_KEY=0x...             # Deployer private key
POLYGON_AMOY_RPC=...          # RPC endpoint (recommend Alchemy)
```

---

## Network Support

| Network | Chain ID | Notes |
|---------|----------|-------|
| Hardhat Localhost | 31337 | Development |
| Polygon Amoy | 80002 | Testnet |
| Polygon Mainnet | 137 | Production |

---

**Not a will. Not legal advice. Not financial advice.**
