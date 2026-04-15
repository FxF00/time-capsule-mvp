// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/utils/cryptography/EIP712.sol";

/**
 * @title TimeCapsuleVault
 * @notice Single factory contract — all capsules stored in arrays, identified by uint256 id.
 *         Beneficiaries call claim(capsuleId) on this contract after unlock time.
 *         NOT a will. NOT legal advice. NOT financial advice.
 *
 * Approach A — eliminates time drift by storing createdAt + lockDuration on-chain.
 * The unlock condition is: block.timestamp >= createdAt + lockDuration
 * The frontend derives the encryption key from getUnlockTimestamp(capsuleId)
 * which is always createdAt + lockDuration (never drifts from the stored contract state).
 */
contract TimeCapsuleVault is Ownable, ReentrancyGuard, Pausable, EIP712 {

    // ============ Constants ============
    bytes32 constant _CLAIM_SIG_TYPEHASH = keccak256("ClaimSig(uint256 capsuleId,address beneficiary,uint256 nonce)");
    constructor() Ownable(msg.sender) EIP712("TimeCapsuleVault", "1") {}
    uint256 public constant MIN_LOCK_SECONDS = 60 seconds;
    uint256 public constant MAX_LOCK_SECONDS = 10 * 365 days;
    uint256 public constant MIN_CREATION_FEE = 0.001 ether;
    uint256 public constant MAX_BENEFICIARIES = 10;

    // ============ Structs ============
    struct Beneficiary {
        address payable wallet;
        uint256 allocationPercentage; // out of 100
        bool claimed;
    }

    struct Capsule {
        address founder;
        uint256 unlockTimestamp;     // == createdAt + lockDuration (kept for backward compat)
        bool isWithdrawn;            // true if founder cancelled or all claimed
        string messageHash;          // encrypted message payload, can be empty
        Beneficiary[] beneficiaries;
        uint256 depositedValue;      // ETH contributed by founder
        uint256 createdAt;           // block.timestamp at creation
        uint256 lockDuration;        // user-selected duration in seconds
        uint256 originalUnlockTime;  // user's originally intended unlock time (for display)
        address primaryBeneficiary; // first beneficiary — the only one who can decrypt the message
    }

    struct ClaimSig {
        uint256 capsuleId;
        address beneficiary;
        uint256 nonce;
    }

    // ============ State ============
    Capsule[] public capsules; // capsuleId => Capsule
    // capsuleId => beneficiary address => isBeneficiary
    mapping(uint256 => mapping(address => bool)) public isBeneficiary;
    // capsuleId => beneficiary address => beneficiary index
    mapping(uint256 => mapping(address => uint256)) public beneficiaryIndices;
    // capsuleId => beneficiary address => true if claimed via signature
    mapping(uint256 => mapping(address => bool)) public claimedBySig;
    // beneficiary address => nonce for meta-transactions
    mapping(address => uint256) public beneficiaryNonces;

    // ============ Events ============
    event CapsuleCreated(
        uint256 indexed capsuleId,
        address indexed founder,
        uint256 createdAt,
        uint256 lockDuration,
        uint256 originalUnlockTime,
        string messageHash,
        address indexed primaryBeneficiary
    );
    event BeneficiaryAdded(uint256 indexed capsuleId, address indexed beneficiary, uint256 allocation);
    event WithdrawalClaimed(uint256 indexed capsuleId, address indexed beneficiary, uint256 amount);
    event CapsuleCancelled(uint256 indexed capsuleId, address indexed founder);

    // ============ Errors ============
    error AlreadyWithdrawn();
    error DuplicateBeneficiary();
    error NotBeneficiary();
    error NothingToClaim();
    error TimeLockActive();
    error AlreadyClaimed();
    error ZeroAddress();
    error TooManyBeneficiaries();
    error MismatchLength();
    error LockTooShort();
    error LockTooLong();
    error InsufficientFee();
    error AllocationMustSumTo100();
    error Unauthorized();
    error InvalidSignature();
    error RelayerNotTrusted();

    // ============ Core Functions ============

    /// @notice Create a new time capsule vault
    /// @param beneficiaryAddresses Array of beneficiary addresses
    /// @param allocations Array of allocation percentages (must sum to 100)
    /// @param lockDuration Duration in seconds from now until the capsule unlocks
    /// @param messageHash Encrypted message payload stored on-chain (empty string = no message)
    /// @return capsuleId The ID of the newly created capsule
    function createCapsule(
        address[] calldata beneficiaryAddresses,
        uint256[] calldata allocations,
        uint256 lockDuration,
        string calldata messageHash
    ) external payable whenNotPaused returns (uint256 capsuleId) {
        // Validate
        if (beneficiaryAddresses.length == 0) revert ZeroAddress();
        if (beneficiaryAddresses.length > MAX_BENEFICIARIES) revert TooManyBeneficiaries();
        if (beneficiaryAddresses.length != allocations.length) revert MismatchLength();
        if (lockDuration < MIN_LOCK_SECONDS) revert LockTooShort();
        if (lockDuration > MAX_LOCK_SECONDS) revert LockTooLong();
        if (msg.value < MIN_CREATION_FEE) revert InsufficientFee();

        uint256 totalAlloc = 0;
        for (uint256 i = 0; i < allocations.length; i++) {
            totalAlloc += allocations[i];
        }
        if (totalAlloc != 100) revert AllocationMustSumTo100();

        // Compute timestamps on-chain — eliminates time drift
        uint256 createdAt = block.timestamp;
        uint256 originalUnlockTime = createdAt + lockDuration;

        // Create capsule
        capsuleId = capsules.length;
        Capsule storage c = capsules.push();
        c.founder = msg.sender;
        c.unlockTimestamp = originalUnlockTime; // backward compat: same as createdAt + lockDuration
        c.isWithdrawn = false;
        c.messageHash = messageHash;
        c.depositedValue = msg.value;
        c.createdAt = createdAt;
        c.lockDuration = lockDuration;
        c.originalUnlockTime = originalUnlockTime;
        c.primaryBeneficiary = beneficiaryAddresses[0];

        // Add beneficiaries
        for (uint256 i = 0; i < beneficiaryAddresses.length; i++) {
            if (beneficiaryAddresses[i] == address(0)) revert ZeroAddress();
            if (i > 0 && isBeneficiary[capsuleId][beneficiaryAddresses[i]]) revert DuplicateBeneficiary();
            c.beneficiaries.push(Beneficiary({
                wallet: payable(beneficiaryAddresses[i]),
                allocationPercentage: allocations[i],
                claimed: false
            }));
            isBeneficiary[capsuleId][beneficiaryAddresses[i]] = true;
            beneficiaryIndices[capsuleId][beneficiaryAddresses[i]] = i + 1;
            emit BeneficiaryAdded(capsuleId, beneficiaryAddresses[i], allocations[i]);
        }

        emit CapsuleCreated(capsuleId, msg.sender, createdAt, lockDuration, originalUnlockTime, messageHash, beneficiaryAddresses[0]);
    }

    /// @notice Beneficiary claims their unlocked allocation
    /// @param capsuleId The ID of the capsule
    function claim(uint256 capsuleId) external nonReentrant whenNotPaused {
        Capsule storage c = capsules[capsuleId];
        if (block.timestamp < c.createdAt + c.lockDuration) revert TimeLockActive();
        if (c.isWithdrawn) revert AlreadyWithdrawn();
        if (!isBeneficiary[capsuleId][msg.sender]) revert NotBeneficiary();

        Beneficiary storage b = _getBeneficiary(capsuleId, msg.sender);
        if (b.claimed) revert AlreadyClaimed();
        if (c.depositedValue == 0) revert NothingToClaim();

        b.claimed = true;
        beneficiaryNonces[msg.sender]++;
        uint256 amount = (c.depositedValue * b.allocationPercentage) / 100;
        emit WithdrawalClaimed(capsuleId, msg.sender, amount);
        (bool sent, ) = msg.sender.call{value: amount}("");
        require(sent, "Transfer failed");

        // Check if all beneficiaries have claimed
        bool allClaimed = true;
        for (uint256 i = 0; i < c.beneficiaries.length; i++) {
            if (!c.beneficiaries[i].claimed) { allClaimed = false; break; }
        }
        if (allClaimed) { c.isWithdrawn = true; }
    }

    /// @notice Beneficiary claims via EIP-712 signature (meta-transaction)
    /// @param capsuleId The ID of the capsule
    /// @param signature The EIP-712 signature from the beneficiary
    function claimBySig(uint256 capsuleId, bytes calldata signature) external nonReentrant whenNotPaused {
        ClaimSig memory claim = ClaimSig(capsuleId, msg.sender, beneficiaryNonces[msg.sender]);

        if (claimedBySig[capsuleId][msg.sender]) revert AlreadyClaimed();

        address signer = ECDSA.recover(_hashClaim(claim), signature);
        if (signer != msg.sender) revert InvalidSignature();

        Capsule storage c = capsules[capsuleId];
        if (block.timestamp < c.createdAt + c.lockDuration) revert TimeLockActive();
        if (c.isWithdrawn) revert AlreadyWithdrawn();
        if (!isBeneficiary[capsuleId][msg.sender]) revert NotBeneficiary();

        Beneficiary storage b = _getBeneficiary(capsuleId, msg.sender);
        if (b.claimed) revert AlreadyClaimed();
        if (c.depositedValue == 0) revert NothingToClaim();

        claimedBySig[capsuleId][msg.sender] = true;
        beneficiaryNonces[msg.sender]++;
        uint256 amount = (c.depositedValue * b.allocationPercentage) / 100;
        emit WithdrawalClaimed(capsuleId, msg.sender, amount);
        (bool sent, ) = msg.sender.call{value: amount}("");
        require(sent, "Transfer failed");

        // Check if all beneficiaries have claimed
        bool allClaimed = true;
        for (uint256 i = 0; i < c.beneficiaries.length; i++) {
            if (!c.beneficiaries[i].claimed) { allClaimed = false; break; }
        }
        if (allClaimed) { c.isWithdrawn = true; }
    }

    /// @notice Founder cancels and retrieves all funds before unlock
    /// @param capsuleId The ID of the capsule
    function cancelCapsule(uint256 capsuleId) external nonReentrant whenNotPaused {
        Capsule storage c = capsules[capsuleId];
        if (c.founder != msg.sender) revert Unauthorized();
        if (c.isWithdrawn) revert AlreadyWithdrawn();
        if (block.timestamp >= c.createdAt + c.lockDuration) revert TimeLockActive();

        c.isWithdrawn = true;
        uint256 amount = c.depositedValue;
        emit CapsuleCancelled(capsuleId, msg.sender);
        (bool sent, ) = payable(msg.sender).call{value: amount}("");
        require(sent, "Transfer failed");
    }

    /// @notice Sets or updates the encrypted message hash after capsule creation.
    /// @dev Allows the founder to post the encrypted message using the authoritative on-chain
    ///      unlock timestamp (computed after mining via getUnlockTimestamp) rather than an estimate.
    ///      This eliminates timestamp-drift as a cause of AES-GCM decryption failures.
    function setMessageHash(uint256 capsuleId, string calldata messageHash) external {
        Capsule storage c = capsules[capsuleId];
        if (c.founder != msg.sender) revert Unauthorized();
        c.messageHash = messageHash;
    }

    // ============ View Functions ============

    function getCapsule(uint256 capsuleId) external view returns (Capsule memory) {
        return capsules[capsuleId];
    }

    function getBeneficiaryCount(uint256 capsuleId) external view returns (uint256) {
        return capsules[capsuleId].beneficiaries.length;
    }

    /// @notice Returns the beneficiary's allocation percentage for a capsule
    function getMyAllocation(uint256 capsuleId) external view returns (uint256 allocation, bool claimed) {
        Beneficiary memory b = _getBeneficiary(capsuleId, msg.sender);
        return (b.allocationPercentage, b.claimed);
    }

    /// @notice Check if a capsule is unlocked
    function isUnlocked(uint256 capsuleId) external view returns (bool) {
        Capsule storage c = capsules[capsuleId];
        return block.timestamp >= c.createdAt + c.lockDuration;
    }

    /// @notice Get the current authoritative unlock timestamp (createdAt + lockDuration)
    /// @dev Use this for key derivation — it never drifts from the on-chain state
    function getUnlockTimestamp(uint256 capsuleId) external view returns (uint256) {
        Capsule storage c = capsules[capsuleId];
        return c.createdAt + c.lockDuration;
    }

    /// @notice Get time remaining until unlock
    function getTimeRemaining(uint256 capsuleId) external view returns (uint256) {
        Capsule storage c = capsules[capsuleId];
        uint256 unlockTime = c.createdAt + c.lockDuration;
        if (block.timestamp >= unlockTime) return 0;
        return unlockTime - block.timestamp;
    }

    // ============ Admin Functions ============

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    // ============ Internal ============

    function _getBeneficiary(uint256 capsuleId, address wallet) internal view returns (Beneficiary storage) {
        uint256 idx = beneficiaryIndices[capsuleId][wallet];
        if (idx == 0) revert NotBeneficiary();
        return capsules[capsuleId].beneficiaries[idx - 1];
    }

    /// @notice Returns the EIP-712 hash of a ClaimSig
    /// @param claim The claim struct to hash
    /// @return The EIP-712 typed hash
    function _hashClaim(ClaimSig memory claim) internal view returns (bytes32) {
        return _hashTypedDataV4(keccak256(abi.encode(_CLAIM_SIG_TYPEHASH, claim.capsuleId, claim.beneficiary, claim.nonce)));
    }

    receive() external payable {}
}
