import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { ethers } from 'ethers';
import { getContract, getClaimStatus } from './contract.js';

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(express.json());
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type']
}));

// Request logging middleware
app.use((req, res, next) => {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] ${req.method} ${req.path} - IP: ${req.ip}`);
  next();
});

// Rate limiting: 3 requests per IP per minute
const rateLimitMap = new Map();
const RATE_LIMIT_MAX = 3;
const RATE_LIMIT_WINDOW_MS = 60 * 1000;

function rateLimiter(req, res, next) {
  const ip = req.ip;
  const now = Date.now();
  const record = rateLimitMap.get(ip);

  if (!record) {
    rateLimitMap.set(ip, { count: 1, resetTime: now + RATE_LIMIT_WINDOW_MS });
    next();
    return;
  }

  if (now > record.resetTime) {
    rateLimitMap.set(ip, { count: 1, resetTime: now + RATE_LIMIT_WINDOW_MS });
    next();
    return;
  }

  if (record.count >= RATE_LIMIT_MAX) {
    const retryAfter = Math.ceil((record.resetTime - now) / 1000);
    res.status(429).json({
      error: 'Too many requests',
      retryAfter: `${retryAfter} seconds`
    });
    return;
  }

  record.count++;
  next();
}

// Initialize provider and wallet
const provider = new ethers.JsonRpcProvider(process.env.RPC_URL, process.env.CHAIN_ID);
const wallet = new ethers.Wallet(process.env.PRIVATE_KEY, provider);
const contractAddress = process.env.CONTRACT_ADDRESS;

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    relayer: wallet.address
  });
});

// Relay endpoint - accepts signed claim messages and submits to blockchain
app.post('/relay', rateLimiter, async (req, res) => {
  try {
    const { capsuleId, beneficiary, signature } = req.body;

    // Validate input
    if (capsuleId === undefined || !beneficiary || !signature) {
      return res.status(400).json({ error: 'Missing required fields: capsuleId, beneficiary, signature' });
    }

    // Parse capsuleId to BigInt
    const capsuleIdBn = BigInt(capsuleId);

    // Get contract with signer
    const contract = getContract(provider, contractAddress);
    const contractWithSigner = contract.connect(wallet);

    // Verify signature using ethers.verifyMessage
    // The message being signed should be the capsuleId (as a domain-separated EIP-712 message)
    // For TimeCapsuleVault, the beneficiary signs the capsuleId to authorize claim
    const messageHash = ethers.solidityPacked(['uint256'], [capsuleIdBn]);
    const messageHashBytes = ethers.toBeHex(messageHash, 32);

    // Recover the signer from the signature
    const recoveredAddress = ethers.verifyMessage(messageHashBytes, signature);

    console.log(`[${new Date().toISOString()}] Signature verification:`);
    console.log(`  - Beneficiary from request: ${beneficiary}`);
    console.log(`  - Recovered address: ${recoveredAddress}`);

    // Check if recovered address matches beneficiary
    if (recoveredAddress.toLowerCase() !== beneficiary.toLowerCase()) {
      console.log(`  - Verification FAILED: addresses do not match`);
      return res.status(400).json({ error: 'Invalid signature' });
    }

    console.log(`  - Verification PASSED`);

    // Submit transaction to the contract
    console.log(`[${new Date().toISOString()}] Submitting claimBySig transaction...`);
    console.log(`  - Capsule ID: ${capsuleId}`);
    console.log(`  - Beneficiary: ${beneficiary}`);
    console.log(`  - Relayer: ${wallet.address}`);

    try {
      const tx = await contractWithSigner.claimBySig(capsuleIdBn, signature);
      console.log(`  - Transaction hash: ${tx.hash}`);

      res.json({
        txHash: tx.hash,
        status: 'submitted'
      });
    } catch (txError) {
      // Handle transaction revert
      console.log(`  - Transaction reverted: ${txError.reason || txError.message}`);

      let revertReason = 'Transaction reverted';
      if (txError.reason) {
        revertReason = txError.reason;
      } else if (txError.data) {
        // Try to decode revert reason from error data
        try {
          const interfaceContract = new ethers.Interface([
            'function Error(string reason)'
          ]);
          const decoded = interfaceContract.decodeErrorResult(txError.data);
          revertReason = decoded[0];
        } catch (e) {
          // Use raw error message if decode fails
          revertReason = txError.message || 'Unknown revert';
        }
      }

      return res.status(400).json({ error: revertReason });
    }
  } catch (error) {
    console.error(`[${new Date().toISOString()}] Error in /relay:`, error.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Status endpoint - check if a capsule has been claimed
app.get('/status/:capsuleId/:beneficiary', async (req, res) => {
  try {
    const { capsuleId, beneficiary } = req.params;

    // Validate addresses
    if (!ethers.isAddress(beneficiary)) {
      return res.status(400).json({ error: 'Invalid beneficiary address' });
    }

    const capsuleIdBn = BigInt(capsuleId);
    const contract = getContract(provider, contractAddress);

    const { capsule, claimed } = await getClaimStatus(contract, capsuleIdBn, beneficiary);

    // Get the beneficiary's nonce
    const nonce = await contract.beneficiaryNonces(beneficiary);

    res.json({
      claimed,
      nonce: Number(nonce),
      capsule: {
        founder: capsule[0],
        unlockTimestamp: Number(capsule[1]),
        isWithdrawn: capsule[2],
        messageHash: capsule[3],
        depositedValue: capsule[4].toString(),
        createdAt: Number(capsule[5]),
        lockDuration: Number(capsule[6]),
        originalUnlockTime: Number(capsule[7]),
        primaryBeneficiary: capsule[8]
      }
    });
  } catch (error) {
    console.error(`[${new Date().toISOString()}] Error in /status:`, error.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`TimeCapsule Relayer started on port ${PORT}`);
  console.log(`Relayer address: ${wallet.address}`);
  console.log(`Contract address: ${contractAddress}`);
  console.log(`Chain ID: ${process.env.CHAIN_ID}`);
  console.log('-----------------------------------');
  console.log('Endpoints:');
  console.log(`  GET  /health`);
  console.log(`  POST /relay`);
  console.log(`  GET  /status/:capsuleId/:beneficiary`);
});
