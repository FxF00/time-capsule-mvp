// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title MessageRegistry
 * @notice Stores IPFS CIDs for capsule messages.
 *         Messages are stored off-chain on IPFS; only the CID is on-chain.
 */
contract MessageRegistry is Ownable {

    constructor() Ownable(msg.sender) {}

    struct Message {
        string ipfsHash;
        address author;
        uint256 timestamp;
    }

    // capsuleId => Message
    mapping(bytes32 => Message) public messages;

    event MessageStored(bytes32 indexed capsuleId, string ipfsHash);

    /// @notice Store an IPFS hash for a capsule
    /// @param capsuleId Unique identifier for the capsule
    /// @param ipfsHash IPFS CID
    function storeMessage(bytes32 capsuleId, string calldata ipfsHash) external onlyOwner {
        require(bytes(ipfsHash).length > 0, "Empty hash");
        require(bytes(messages[capsuleId].ipfsHash).length == 0, "Already stored");
        messages[capsuleId] = Message({
            ipfsHash: ipfsHash,
            author: msg.sender,
            timestamp: block.timestamp
        });
        emit MessageStored(capsuleId, ipfsHash);
    }

    /// @notice Get the IPFS hash for a capsule
    function getMessage(bytes32 capsuleId) external view returns (string memory) {
        return messages[capsuleId].ipfsHash;
    }
}