const { ethers } = require("hardhat");

async function main() {
  console.log("Deploying DeFi Lending Platform contracts...\n");

  const [deployer] = await ethers.getSigners();
  console.log("Deploying contracts with account:", deployer.address);
  console.log("Account balance:", (await ethers.provider.getBalance(deployer.address)).toString());

  // Deploy Interest Rate Oracle
  console.log("\n1. Deploying InterestRateOracle...");
  const InterestRateOracle = await ethers.getContractFactory("InterestRateOracle");
  const oracle = await InterestRateOracle.deploy();
  await oracle.waitForDeployment();
  const oracleAddress = await oracle.getAddress();
  console.log("InterestRateOracle deployed to:", oracleAddress);

  // Deploy Lending Pool
  console.log("\n2. Deploying LendingPool...");
  const LendingPool = await ethers.getContractFactory("LendingPool");
  const lendingPool = await LendingPool.deploy(oracleAddress);
  await lendingPool.waitForDeployment();
  const lendingPoolAddress = await lendingPool.getAddress();
  console.log("LendingPool deployed to:", lendingPoolAddress);

  // Authorize the deployer as an oracle updater (for testing)
  console.log("\n3. Configuring oracle...");
  await oracle.setAuthorizedUpdater(deployer.address, true);
  console.log("Deployer authorized as oracle updater");

  // Deploy mock tokens for testing (optional - skip in production)
  console.log("\n4. Deploying mock tokens for testing...");
  
  // You can deploy mock ERC20 tokens here for testing
  // In production, you would use real token addresses

  console.log("\n=== Deployment Complete ===");
  console.log("\nContract Addresses:");
  console.log("-------------------");
  console.log("InterestRateOracle:", oracleAddress);
  console.log("LendingPool:", lendingPoolAddress);

  console.log("\n=== Next Steps ===");
  console.log("1. Update .env with contract addresses");
  console.log("2. Configure assets in LendingPool");
  console.log("3. Set up backend to update oracle");
  console.log("4. Update frontend config with addresses");

  // Save deployment addresses to a file
  const fs = require("fs");
  const deploymentInfo = {
    network: network.name,
    chainId: network.config.chainId,
    deployer: deployer.address,
    contracts: {
      InterestRateOracle: oracleAddress,
      LendingPool: lendingPoolAddress
    },
    deployedAt: new Date().toISOString()
  };

  fs.writeFileSync(
    "./deployments.json",
    JSON.stringify(deploymentInfo, null, 2)
  );
  console.log("\nDeployment info saved to deployments.json");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
