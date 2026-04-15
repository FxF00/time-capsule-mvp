import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import "@nomicfoundation/hardhat-ethers";
import "@nomicfoundation/hardhat-verify";
import * as dotenv from "dotenv";

dotenv.config();

const SEPOLIA_RPC = process.env.SEPOLIA_RPC || "https://rpc.sepolia.org";
const PRIVATE_KEY = process.env.DEPLOYER_PRIVATE_KEY || "0x0000000000000000000000000000000000000000000000000000000000000000";
const ETHERSCAN_API_KEY = process.env.ETHERSCAN_API_KEY || "";

// 10 accounts with 1 ETH balance + 10 accounts with 0 ETH balance
const TEST_ACCOUNTS = [
  { privateKey: "0xb234fec900a8481928079bbc6c24c693e0695198b7eb5d3b9ae696fd7f329450", balance: "1000000000000000000" },  // 1 ETH
  { privateKey: "0x4165dfc31fe789a94d8eb7835ea071831747e9e738127777add19f45f379045d", balance: "1000000000000000000" },
  { privateKey: "0xbbe8ac2a520bfc42294a383b8c7b9d7e9ff5855b2f4545dc58592c6035497af4", balance: "1000000000000000000" },
  { privateKey: "0x2f3888bf011988e8de317e2cb96b42a6c30530c7da99abd7a5014039ca15599a", balance: "1000000000000000000" },
  { privateKey: "0xcf015ff5d9c0eea4aace9df1f74990158f4c4e74019a8c80e7945e84c5d99da5", balance: "1000000000000000000" },
  { privateKey: "0x785df7137f532bd126a48d5814a8deadcbadaee1d5a47a1835f4012d7188b8c8", balance: "1000000000000000000" },
  { privateKey: "0x7b1f4f0a320a3c2886d8467a240a482e3aaf5794e9533d9b4d151cf573071df8", balance: "1000000000000000000" },
  { privateKey: "0x5e6956b43fea8c9975588fbbbc5decc6f68a8a3fe6299eb6b7a7dd0ea9abc260", balance: "1000000000000000000" },
  { privateKey: "0xdaed85272f9627ce4908c1ff5b4e1b9e61d586d14bf32e2ee0606ac844cc51f4", balance: "1000000000000000000" },
  { privateKey: "0x1c96b7c039011cdac3f40928800773d3fb4f1676a61560234dc07f4ac463e57d", balance: "1000000000000000000" },
  { privateKey: "0x6e2509d81fa2680c4bf99f92ccfb29e81b5c201454dc51cd8c36adc1a504e624", balance: "0" },
  { privateKey: "0x444cdafcb787519158e8af6b445982d57f9b7e0925512d3050b8e58922a3ff9e", balance: "0" },
  { privateKey: "0xc92ef730216f54bfc369bb295ab1b595fd684c0199c70e0938051f0796404880", balance: "0" },
  { privateKey: "0xa9c5dfcf04debd0ade98b1ab7f0673c233d6c008eb483d858f60e80232b611bc", balance: "0" },
  { privateKey: "0x7b8f621b862cb4738f8a9c501ad2fb91d4f3d0cad01df2db07ac3e2e59d8b1ca", balance: "0" },
  { privateKey: "0x19181e23c4dd7030f303e948bb5b715a3c4563ce723ac5eed8116a256cf19971", balance: "0" },
  { privateKey: "0xb5ca5d46ca80267ca5108b0cc9b8d0bb529e77c4d644b3d0b7644ae7cd7efda7", balance: "0" },
  { privateKey: "0x6f53efbd47acbe1a2db29fcb381a1e19c1f2c0c679b005752aecc662ee950b24", balance: "0" },
  { privateKey: "0xaa8e4a4bfc85a286260c7a8c271b9ef919740bc2d52e6320aa81b268700a7931", balance: "0" },
  { privateKey: "0x2a37b4450845fd0b035aedcda22a365439fa5324892486b57266cfcbc9ae5e9a", balance: "0" },
];

const config: HardhatUserConfig = {
  paths: {
    sources: "./contracts/contracts",
    tests: "./test",
    cache: "./cache",
    artifacts: "./artifacts",
  },
  solidity: {
    version: "0.8.24",
    settings: {
      optimizer: { enabled: true, runs: 200 }
    }
  },
  networks: {
    hardhat: {
      chainId: 31337,
      // Start blockchain time at real current time (seconds)
      time: new Date(Math.floor(Date.now() / 1000) * 1000),
      mining: {
        auto: true,
        interval: 5000, // mine a block every 5 seconds to keep time in sync
      },
    },
    sepolia: {
      url: SEPOLIA_RPC,
      accounts: [PRIVATE_KEY],
      chainId: 11155111
    }
  },
  etherscan: {
    apiKey: {
      sepolia: ETHERSCAN_API_KEY,
    }
  },
  verify: {
    customChains: []
  }
};

export default config;
