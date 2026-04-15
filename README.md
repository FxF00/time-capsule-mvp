# Time Capsule DAO — MVP

A time-locked ETH vault built with Hardhat. Lock ETH now, designate beneficiaries who can claim it after an unlock date, and attach encrypted messages only they can read. All data stored on-chain with full transparency and cryptographic access control.

**Not a will. Not legal advice. Not financial advice.**

---

## Table of Contents

- [Project Overview](#project-overview)
- [How It Works](#how-it-works)
- [Key Features](#key-features)
- [Data Governance](#data-governance)
- [Architecture](#architecture)
- [How the Time-Lock Encryption Works](#how-the-time-lock-encryption-works)
- [Local Development Setup](#local-development-setup)
- [Message Encryption](#message-encryption)
- [Smart Contract ABI / Addresses](#smart-contract-abi--addresses)
- [Tech Stack](#tech-stack)

---

## Project Overview

Time Capsule DAO is a non-custodial time-locked vault smart contract. A founder locks ETH, sets a future unlock timestamp, designates beneficiaries with allocation percentages, and optionally attaches an encrypted message. After the unlock date, beneficiaries can claim their allocation directly — no intermediate custodian required. The encrypted message ensures the content remains private until the capsule is unlocked.

---

## How It Works

```
Founder
  │
  ├─ Creates capsule on TimeCapsuleVault
  │   ├─ Deposits ETH (min 0.001 ETH)
  │   ├─ Sets lock duration (60 seconds – 10 years)
  │   ├─ Adds beneficiaries + allocation % (must sum to 100)
  │   └─ Optionally attaches an encrypted message (stored on-chain)
  │
  └─ Before unlock: founder can cancel and reclaim funds

Beneficiary
  │
  └─ After unlock timestamp: calls claim(capsuleId) to receive allocation
       ├─ Contract transfers ETH directly to beneficiary wallet
       └─ Primary beneficiary (first in list) can decrypt the message (if attached)
```

---

## Key Features

- **Time-locked ETH vault** — ETH is held in a smart contract until the unlock timestamp
- **Multi-beneficiary support** — up to 10 beneficiaries per capsule with configurable allocation percentages (must sum to 100)
- **Founder cancellation** — founder can reclaim all funds before the unlock date
- **Shareable capsule links** — QR code / URL lets beneficiaries view and claim their capsule
- **Time-lock encrypted messages** — AES-256-GCM encrypted messages stored on-chain; only the primary beneficiary can decrypt after unlock
- **No custody risk** — funds go directly from vault to beneficiary; no middleman
- **Pausable by owner** — emergency stop mechanism built on OpenZeppelin Pausable (excludes `setMessageHash`)
- **Re-entrancy protection** — OpenZeppelin ReentrancyGuard on `claim()`, `claimBySig()`, and `cancelCapsule()`

---

## Data Governance

This project implements several blockchain-native governance mechanisms:

### Transparency & Auditability
All capsule data (founder, beneficiaries, allocations, timestamps, encrypted messages) is stored on-chain and publicly readable. Every state change emits an EVM event for off-chain indexing and audit trails:
- `CapsuleCreated` — capsule initiated with full parameters
- `BeneficiaryAdded` — each beneficiary and their allocation % logged
- `WithdrawalClaimed` — each claim event recorded on-chain
- `CapsuleCancelled` — cancellation and fund return logged

### Access Control
- **Owner** (`Ownable`) — can pause/unpause the contract
- **Founder** — sole authority to create capsules and update the encrypted message; cannot touch beneficiary funds after creation
- **Beneficiaries** — can only claim their own allocation after unlock; no access to other beneficiaries' shares
- **Beneficiary uniqueness** — duplicate beneficiary addresses are rejected at creation time

### Data Integrity
- **Immutable capsule data** — after creation, beneficiary list and allocations cannot be altered by anyone (only `messageHash` can be updated by founder)
- **On-chain unlock enforcement** — unlock timestamp is computed on-chain (`createdAt + lockDuration`), eliminating front-end time drift
- **Encrypted message integrity** — AES-256-GCM with 96-bit IV and 128-bit auth tag; any tampering is detected at decryption
- **Allocation sum enforcement** — contract rejects capsules where beneficiary allocations do not sum to exactly 100%

### Non-Repudiation
- **EIP-712 typed-data signatures** — `claimBySig()` accepts EIP-712 signatures, enabling beneficiary meta-transactions with cryptographic proof of intent
- **Beneficiary nonces** — prevents replay attacks on claim signatures

---

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                  React Frontend                      │
│            (Vite + TypeScript + ethers.js v6)       │
│                                                     │
│  Pages: Create | Claim | History                          │
│  Components: WalletConnect, CapsuleCard, CountdownTimer, Disclaimer, Toast, DurationSelector │
└──────────────────────┬──────────────────────────────┘
                       │ ethers.js v6
                       │ (reads capsule state, sends tx)
                       ▼
┌─────────────────────────────────────────────────────┐
│           TimeCapsuleVault (Solidity)               │
│         [Hardhat local node — deployable to any EVM network]  │
│                                                     │
│  State: capsules[], isBeneficiary, beneficiaryIndices, claimedBySig, beneficiaryNonces │
│  Core: createCapsule(), claim(), claimBySig(), cancelCapsule(), setMessageHash() │
│  Security: Ownable, ReentrancyGuard, Pausable, EIP712, ECDSA │
└─────────────────────────────────────────────────────┘
                       │
                       │ On-chain storage only
                       │ (messageHash = encrypted message, no IPFS)
                       ▼
               Encrypted message stored in
               Capsule.messageHash (on-chain)
```

### Smart Contracts

| Contract | Purpose |
|---|---|
| `TimeCapsuleVault.sol` | Main vault — stores capsules, ETH, manages claims |

---

## How the Time-Lock Encryption Works

Messages are encrypted client-side (in the browser) and stored directly on-chain. Decryption also happens client-side. Only the primary beneficiary (first in the beneficiary list) can decrypt.

### Algorithm: AES-256-GCM

1. **Key derivation** — The symmetric key is derived as:
   ```
   key = keccak256(ethers.solidityPacked(address, uint256)(primaryBeneficiaryAddress, unlockTimestamp))
   ```
   Both values are publicly known on-chain. The founder derives the key at creation time to encrypt; the primary beneficiary derives the same key after unlock to decrypt.

2. **Encryption** — A random 96-bit IV is generated per message. The plaintext is encrypted with AES-256-GCM using the derived key. The IV is prepended to the ciphertext.

3. **Storage** — The encrypted blob is stored directly on-chain in `capsule.messageHash`. No IPFS or off-chain storage.

4. **Decryption** — After `block.timestamp > unlockTimestamp`, the primary beneficiary calls `claim()` on-chain and then decrypts the message locally using their address and the now-public unlock timestamp.

### Why this is time-lock secure

- The key cannot be computed before `unlockTimestamp` because the future timestamp is stored on-chain and cannot be altered.
- After unlock, both inputs are public: `primaryBeneficiary` address is known and `unlockTimestamp` is now confirmed on-chain.

---

## Local Development Setup

### Prerequisites

- **Node.js 22** — Required. Use [nvm](https://github.com/nvm/nvm) to manage versions:
  ```bash
  nvm install 22
  nvm use 22
  ```

### 1. Install dependencies

```bash
npm install
```

This uses npm workspaces to install both `contracts/` and `frontend/` dependencies.

### 2. Start a local Hardhat node

```bash
npm run node
```

This starts a Hardhat node on `http://127.0.0.1:8545` with chain ID `31337`.

### 3. Deploy the contract locally

In a new terminal:

```bash
npx hardhat run scripts/deploy.ts --network localhost
```

The vault contract address will be printed (e.g. `0x5FbDB2315678afecb367f032d93F642f64180aa3`). Deployment info is also saved to `scripts/deployments.json`.

### 4. Update the frontend environment

Set the contract address in `frontend/.env`:

```
VITE_CONTRACT_ADDRESS=0x5FbDB2315678afecb367f032d93F642f64180aa3
```

### 5. Import a test account into MetaMask

To interact with the dApp, import this Hardhat test account into MetaMask:

- **Private key:** `0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80`
- **Network:** Custom RPC → `http://127.0.0.1:8545`, chain ID `31337`

This account has 10,000 ETH on the local Hardhat node.

### 6. Start the frontend

```bash
npm run dev:frontend
```

The frontend runs at **http://localhost:5173**.

### Run tests

```bash
npm run test
```

---

## Message Encryption

Messages are encrypted client-side using AES-256-GCM and stored directly on-chain in the `messageHash` field. No server or IPFS involved — only the primary beneficiary (first in the beneficiary list) can decrypt after unlock.

### Algorithm: AES-256-GCM

1. **Key derivation** — `key = keccak256(ethers.solidityPacked(address, uint256)(primaryBeneficiaryAddress, unlockTimestamp))`
   - Both values are publicly known on-chain, so the founder can derive the key at creation time to encrypt, and the primary beneficiary can derive the same key after unlock to decrypt.

2. **Encryption** — A random 96-bit IV is generated per message. Plaintext is encrypted with AES-256-GCM using the derived key. The IV is prepended to the ciphertext.

3. **Storage** — The base64-encoded ciphertext is stored directly in `capsule.messageHash` on-chain.

4. **Decryption** — After unlock, primary beneficiary calls `claim()` on-chain and then decrypts the message locally using their address and the now-public unlock timestamp.

### Why this is time-lock secure

- The key cannot be computed before `unlockTimestamp` because the beneficiary address is known but `unlockTimestamp` is a future value stored on-chain and cannot be altered.
- After unlock, both inputs are public: `primaryBeneficiary` (known) and `unlockTimestamp` (now public).

---

## Smart Contract ABI / Addresses

Deployed contract addresses are saved in `scripts/deployments.json` after each deployment. Each entry records:

```json
{
  "network": "localhost",
  "vault": "0x...",
  "timestamp": "2026-04-08T..."
}
```

The frontend reads the vault address from `VITE_CONTRACT_ADDRESS` in `frontend/.env`.

### Key contract functions

| Function | Description |
|---|---|
| `createCapsule(beneficiaryAddresses[], allocations[], lockDuration, messageHash)` | Create a new capsule (requires 0.001 ETH min) |
| `claim(capsuleId)` | Beneficiary claims their allocation after unlock |
| `claimBySig(capsuleId, signature)` | Beneficiary claims via EIP-712 signature (meta-transaction) |
| `cancelCapsule(capsuleId)` | Founder reclaims funds before unlock |
| `setMessageHash(capsuleId, messageHash)` | Founder updates the encrypted message after creation |
| `getCapsule(capsuleId)` | Returns full capsule struct |
| `getBeneficiaryCount(capsuleId)` | Returns number of beneficiaries |
| `isUnlocked(capsuleId)` | Returns true if unlock timestamp has passed |
| `getTimeRemaining(capsuleId)` | Seconds until unlock |
| `getUnlockTimestamp(capsuleId)` | Returns authoritative unlock timestamp (createdAt + lockDuration) |
| `getMyAllocation(capsuleId)` | Returns beneficiary's % allocation and claim status |

### Contract constants

| Constant | Value |
|---|---|
| `MIN_LOCK_SECONDS` | 60 seconds |
| `MAX_LOCK_SECONDS` | 10 years |
| `MIN_CREATION_FEE` | 0.001 ETH |
| `MAX_BENEFICIARIES` | 10 |

---

## Tech Stack

| Layer | Technology |
|---|---|
| Smart contracts | Solidity ^0.8.24, OpenZeppelin 5.x |
| Development framework | Hardhat |
| Web3 library | ethers.js v6 |
| Frontend | React 18, Vite 5, TypeScript |
| Message storage | On-chain (messageHash field) — encrypted content stored directly in contract |
| Encryption | Web Crypto API (AES-256-GCM) |
| Contract verification | @nomicfoundation/hardhat-verify |
| Contract types | TypeChain |
