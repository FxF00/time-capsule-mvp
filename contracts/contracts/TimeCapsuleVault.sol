// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";

/**
 * @title TimeCapsuleVault
 * @notice Single factory contract — all capsules stored in arrays, identified by uint256 id.
 *         Beneficiaries call claim(capsuleId) on this contract after unlock time.
 *         NOT a will. NOT legal advice. NOT financial advice.
 */
contract TimeCapsuleVault is Ownable, ReentrancyGuard, Pausable {

    // ============ Constants ============
    constructor() Ownable(msg.sender) {}
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
        uint256 unlockTimestamp;
        bool isWithdrawn; // true if founder cancelled or all claimed
        string messageHash; // IPFS CID, can be empty
        Beneficiary[] beneficiaries;
        uint256 depositedValue; // ETH contributed by founder
    }

    // ============ State ============
    Capsule[] public capsules; // capsuleId => Capsule
    // capsuleId => beneficiary address => isBeneficiary
    mapping(uint256 => mapping(address => bool)) public isBeneficiary;
    // capsuleId => beneficiary address => beneficiary index
    mapping(uint256 => mapping(address => uint256)) public beneficiaryIndices;

    // ============ Events ============
    event CapsuleCreated(
        uint256 indexed capsuleId,
        address indexed founder,
        uint256 unlockTimestamp,
        uint256 value,
        string messageHash
    );
    event BeneficiaryAdded(uint256 indexed capsuleId, address indexed beneficiary, uint256 allocation);
    event WithdrawalClaimed(uint256 indexed capsuleId, address indexed beneficiary, uint256 amount);
    event CapsuleCancelled(uint256 indexed capsuleId, address indexed founder);

    // ============ Errors ============
    error AlreadyWithdrawn();
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

    // ============ Core Functions ============

    /// @notice Create a new time capsule vault
    /// @param beneficiaryAddresses Array of beneficiary addresses
    /// @param allocations Array of allocation percentages (must sum to 100)
    /// @param unlockTimestamp The exact Unix timestamp when the capsule unlocks (used for key derivation — must be in the future)
    /// @param messageHash IPFS CID of the optional message (empty string = no message)
    /// @return capsuleId The ID of the newly created capsule
    function createCapsule(
        address[] calldata beneficiaryAddresses,
        uint256[] calldata allocations,
        uint256 unlockTimestamp,
        string calldata messageHash
    ) external payable whenNotPaused returns (uint256 capsuleId) {
        // Validate
        if (beneficiaryAddresses.length == 0) revert ZeroAddress();
        if (beneficiaryAddresses.length > MAX_BENEFICIARIES) revert TooManyBeneficiaries();
        if (beneficiaryAddresses.length != allocations.length) revert MismatchLength();
        if (unlockTimestamp < block.timestamp + MIN_LOCK_SECONDS) revert LockTooShort();
        if (unlockTimestamp > block.timestamp + MAX_LOCK_SECONDS) revert LockTooLong();
        if (msg.value < MIN_CREATION_FEE) revert InsufficientFee();

        uint256 totalAlloc = 0;
        for (uint256 i = 0; i < allocations.length; i++) {
            totalAlloc += allocations[i];
        }
        if (totalAlloc != 100) revert AllocationMustSumTo100();

        // Create capsule
        capsuleId = capsules.length;
        Capsule storage c = capsules.push();
        c.founder = msg.sender;
        c.unlockTimestamp = unlockTimestamp;
        c.isWithdrawn = false;
        c.messageHash = messageHash;
        c.depositedValue = msg.value;

        // Add beneficiaries
        for (uint256 i = 0; i < beneficiaryAddresses.length; i++) {
            if (beneficiaryAddresses[i] == address(0)) revert ZeroAddress();
            c.beneficiaries.push(Beneficiary({
                wallet: payable(beneficiaryAddresses[i]),
                allocationPercentage: allocations[i],
                claimed: false
            }));
            isBeneficiary[capsuleId][beneficiaryAddresses[i]] = true;
            beneficiaryIndices[capsuleId][beneficiaryAddresses[i]] = i + 1;
            emit BeneficiaryAdded(capsuleId, beneficiaryAddresses[i], allocations[i]);
        }

        emit CapsuleCreated(capsuleId, msg.sender, c.unlockTimestamp, msg.value, messageHash);
    }

    /// @notice Beneficiary claims their unlocked allocation
    /// @param capsuleId The ID of the capsule
    function claim(uint256 capsuleId) external nonReentrant whenNotPaused {
        Capsule storage c = capsules[capsuleId];
        if (block.timestamp < c.unlockTimestamp) revert TimeLockActive();
        if (c.isWithdrawn) revert AlreadyWithdrawn();
        if (!isBeneficiary[capsuleId][msg.sender]) revert NotBeneficiary();

        Beneficiary storage b = _getBeneficiary(capsuleId, msg.sender);
        if (b.claimed) revert AlreadyClaimed();
        if (c.depositedValue == 0) revert NothingToClaim();

        b.claimed = true;
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
        if (block.timestamp >= c.unlockTimestamp) revert TimeLockActive();
        if (c.isWithdrawn) revert AlreadyWithdrawn();

        c.isWithdrawn = true;
        uint256 amount = c.depositedValue;
        emit CapsuleCancelled(capsuleId, msg.sender);
        (bool sent, ) = payable(msg.sender).call{value: amount}("");
        require(sent, "Transfer failed");
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
        return capsules[capsuleId].unlockTimestamp <= block.timestamp;
    }

    /// @notice Get time remaining until unlock
    function getTimeRemaining(uint256 capsuleId) external view returns (uint256) {
        if (block.timestamp >= capsules[capsuleId].unlockTimestamp) return 0;
        return capsules[capsuleId].unlockTimestamp - block.timestamp;
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

    receive() external payable {}
}