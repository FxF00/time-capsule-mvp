# Time Capsule DAO — MVP

A time-locked ETH vault that lets you lock ETH now and designate beneficiaries who can claim it after an unlock date. Built on Polygon, with off-chain messages encrypted so only the intended beneficiary can read them after the unlock time.

**Not a will. Not legal advice. Not financial advice.**

---

## Table of Contents

- [Project Overview](#project-overview)
- [How It Works](#how-it-works)
- [Key Features](#key-features)
- [Architecture](#architecture)
- [How the Time-Lock Encryption Works](#how-the-time-lock-encryption-works)
- [Local Development Setup](#local-development-setup)
- [Testnet Deployment](#testnet-deployment)
- [IPFS Message Encryption](#ipfs-message-encryption)
- [Smart Contract ABI / Addresses](#smart-contract-abi--addresses)
- [Tech Stack](#tech-stack)

---

## Project Overview

Time Capsule DAO is a non-custodial time-locked vault smart contract on Polygon. A founder locks ETH, sets a future unlock timestamp, designates beneficiaries with allocation percentages, and optionally attaches an encrypted message. After the unlock date, beneficiaries can claim their allocation directly — no intermediate custodian required. The encrypted message ensures the content remains private until the capsule is unlocked.

---

## How It Works

```
Founder
  │
  ├─ Creates capsule on TimeCapsuleVault
  │   ├─ Deposits ETH (min 0.001 ETH)
  │   ├─ Sets unlock timestamp (1 day – 10 years)
  │   ├─ Adds beneficiaries + allocation % (must sum to 100)
  │   └─ Optionally attaches an encrypted IPFS message
  │
  └─ Before unlock: founder can cancel and reclaim funds

Beneficiary
  │
  └─ After unlock timestamp: calls claim(capsuleId) to receive allocation
       ├─ Contract transfers ETH directly to beneficiary wallet
       └─ Beneficiary can decrypt the IPFS message (if attached)
```

---

## Key Features

- **Time-locked ETH vault** — ETH is held in a smart contract until the unlock timestamp
- **Multi-beneficiary support** — up to 10 beneficiaries per capsule with configurable allocation percentages (must sum to 100)
- **Founder cancellation** — founder can reclaim all funds before the unlock date
- **Shareable capsule links** — QR code / URL lets beneficiaries view and claim their capsule
- **Time-lock encrypted messages** — AES-256-GCM encrypted messages stored on IPFS; only the beneficiary can decrypt after unlock
- **No custody risk** — funds go directly from vault to beneficiary; no middleman
- **Pausable by owner** — emergency stop mechanism built on OpenZeppelin Pausable
- **Re-entrancy protection** — OpenZeppelin ReentrancyGuard on all state-changing functions

---

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                  React Frontend                      │
│            (Vite + TypeScript + ethers.js v6)       │
│                                                     │
│  Pages: CreateCapsule | ClaimCapsule | ReceiveCapsule│
│  Components: WalletConnect, CapsuleCard, Countdown   │
└──────────────────────┬──────────────────────────────┘
                       │ ethers.js v6
                       │ (reads capsule state, sends tx)
                       ▼
┌─────────────────────────────────────────────────────┐
│           TimeCapsuleVault (Solidity)               │
│         [Polygon mainnet / Mumbai testnet]           │
│                                                     │
│  State: capsules[], beneficiaryIndices[][]           │
│  Core: createCapsule(), claim(), cancelCapsule()    │
│  Security: Ownable, ReentrancyGuard, Pausable       │
└─────────────────────────────────────────────────────┘
                       │
                       │ IPFS gateway (public)
                       ▼
┌─────────────────────────────────────────────────────┐
│              Off-chain IPFS Storage                  │
│     Encrypted message blob (AES-256-GCM)            │
│     CID stored as messageHash in Capsule struct     │
└─────────────────────────────────────────────────────┘
```

### Smart Contracts

| Contract | Purpose |
|---|---|
| `TimeCapsuleVault.sol` | Main vault — stores capsules, ETH, manages claims |

---

## How the Time-Lock Encryption Works

Messages are encrypted client-side (in the browser) before being uploaded to IPFS. Decryption also happens client-side.

### Algorithm: AES-256-GCM

1. **Key derivation** — The symmetric key is derived as:
   ```
   key = keccak256(abi.encode(beneficiaryAddress, unlockTimestamp))
   ```
   This hash is computed using `ethers.keccak256` (matching Solidity's `keccak256`). The beneficiary address and unlock timestamp are both publicly known (on-chain), so the founder can compute the key at creation time to encrypt, and the beneficiary can compute the same key after unlock to decrypt.

2. **Encryption** — A random 96-bit IV is generated per message. The plaintext is encrypted with AES-256-GCM using the derived key. The IV is prepended to the ciphertext for transport.

3. **Storage** — The encrypted blob is uploaded to IPFS via a public gateway. The resulting CID is stored on-chain as `messageHash` in the `Capsule` struct.

4. **Decryption** — After `block.timestamp > unlockTimestamp`, the beneficiary calls `claim()` on-chain and then fetches and decrypts the message using their wallet address and the now-public unlock timestamp.

### Why this is time-lock secure

- The key cannot be computed before `unlockTimestamp` because the beneficiary does not know the future timestamp in advance (the founder sets it, but it is stored on-chain and cannot be altered).
- After unlock, the key is `keccak256(beneficiary + unlockTimestamp)`. The `unlockTimestamp` is now public and the beneficiary address is known, so the beneficiary can recompute the key and decrypt.

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

## Testnet Deployment

### Get test MATIC

Request MATIC from the Polygon faucet:

- **Mumbai:** https://mumbai.polygonscan.com/ — use the "Faucet" button on the dashboard after connecting your wallet
- Or: https://faucet.polygon.technology/

### Configure environment

Copy `.env.example` to `contracts/.env` and fill in your values:

```bash
cp .env.example contracts/.env
```

Edit `contracts/.env`:
```env
PRIVATE_KEY=0x_your_burner_wallet_private_key
POLYGONSCAN_API_KEY=your_polygonscan_api_key
```

Get a free Polygonscan API key at https://polygonscan.com/apis

### Deploy to Mumbai testnet

```bash
npm run deploy:mumbai
```

### Deploy to Polygon mainnet

```bash
npm run deploy:polygon
```

> **Note:** Polygon Mumbai is deprecated. For production testnet deployment, use the Amoy testnet. Update `hardhat.config.ts` to add an `amoy` network entry with RPC `https://rpc-amoy.polygon.technology/` and chain ID `80002`, then add a corresponding `deploy:amoy` script.

### Update frontend with deployed address

After deployment, update the contract address in `frontend/.env`:

```
VITE_CONTRACT_ADDRESS=0x_your_deployed_vault_address
```

---

## IPFS Message Encryption

Messages are encrypted client-side using AES-256-GCM before upload. No server sees the plaintext.

### Setup

1. Get a free API token from https://nft.storage/manage
2. Add it to `frontend/.env`:
   ```
   VITE_NFT_STORAGE_TOKEN=your_nft_storage_token
   ```
3. If no token is provided, the app falls back to using a public IPFS gateway for uploads (no registration required).

### How messages flow

1. **Create capsule** — Founder enters a message on the Create page
2. **Encrypt** — Browser derives the AES key from `keccak256(beneficiary + unlockTimestamp)` and encrypts the message
3. **Upload** — Encrypted blob is POSTed to `https://ipfs.io/api/v0/add` (or NFT.Storage if token is set)
4. **Store CID** — The IPFS CID is saved on-chain in `capsule.messageHash`
5. **Beneficiary claim** — After unlock, beneficiary fetches from IPFS and decrypts locally

---

## Smart Contract ABI / Addresses

Deployed contract addresses are saved in `scripts/deployments.json` after each deployment. Each entry records:

```json
{
  "network": "mumbai",
  "vault": "0x...",
  "timestamp": "2026-04-08T..."
}
```

The frontend reads the vault address from `VITE_CONTRACT_ADDRESS` in `frontend/.env`.

### Key contract functions

| Function | Description |
|---|---|
| `createCapsule(beneficiaries[], allocations[], lockDurationSeconds, messageHash)` | Create a new capsule (requires 0.001 ETH min) |
| `claim(capsuleId)` | Beneficiary claims their allocation after unlock |
| `cancelCapsule(capsuleId)` | Founder reclaims funds before unlock |
| `getCapsule(capsuleId)` | Returns full capsule struct |
| `isUnlocked(capsuleId)` | Returns true if unlock timestamp has passed |
| `getTimeRemaining(capsuleId)` | Seconds until unlock |
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
| IPFS | Public gateway (ipfs.io, w3s.link) + optional NFT.Storage |
| Encryption | Web Crypto API (AES-256-GCM) |
| Contract verification | @nomicfoundation/hardhat-verify |
| Contract types | TypeChain |
