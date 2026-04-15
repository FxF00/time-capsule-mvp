# TimeCapsule Relayer

EIP-712 meta-transaction relayer for the TimeCapsuleVault contract.

## Setup

```bash
# Install dependencies
npm install

# Copy environment file and configure
cp .env.example .env
```

Edit `.env`:
- `PRIVATE_KEY` - Relayer wallet private key (fund this wallet with MATIC for gas)
- `CONTRACT_ADDRESS` - Deployed TimeCapsuleVault contract address
- `RPC_URL` - Blockchain RPC endpoint (e.g., https://polygon-rpc.com)
- `CHAIN_ID` - Chain ID (137 for Polygon mainnet)

## Run

```bash
npm start        # Production
npm run dev      # Development (with auto-reload)
```

## Gas Costs

The relayer wallet pays for gas on behalf of users. On Polygon, gas is ~0.001 MATIC per transaction.

## API Endpoints

- `GET /health` - Health check
- `POST /relay` - Submit a signed claim transaction
- `GET /status/:capsuleId/:beneficiary` - Check claim status
