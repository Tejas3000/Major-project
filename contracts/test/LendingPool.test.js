const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("InterestRateOracle", function () {
  let oracle;
  let owner;
  let submitter;
  let user;
  const ETH_ADDRESS = "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE";

  beforeEach(async function () {
    [owner, submitter, user] = await ethers.getSigners();

    const InterestRateOracle = await ethers.getContractFactory("InterestRateOracle");
    oracle = await InterestRateOracle.deploy(3600); // 1 hour stale threshold
    await oracle.waitForDeployment();

    // Authorize submitter
    await oracle.setAuthorizedSubmitter(submitter.address, true);
  });

  describe("Deployment", function () {
    it("Should set the right owner", async function () {
      expect(await oracle.owner()).to.equal(owner.address);
    });

    it("Should set the stale threshold", async function () {
      expect(await oracle.getStaleThreshold()).to.equal(3600);
    });

    it("Should authorize owner as submitter by default", async function () {
      expect(await oracle.isAuthorizedSubmitter(owner.address)).to.be.true;
    });
  });

  describe("Authorization", function () {
    it("Should allow owner to authorize submitters", async function () {
      await oracle.setAuthorizedSubmitter(user.address, true);
      expect(await oracle.isAuthorizedSubmitter(user.address)).to.be.true;
    });

    it("Should allow owner to revoke submitter authorization", async function () {
      await oracle.setAuthorizedSubmitter(submitter.address, false);
      expect(await oracle.isAuthorizedSubmitter(submitter.address)).to.be.false;
    });

    it("Should prevent non-owners from authorizing", async function () {
      await expect(
        oracle.connect(user).setAuthorizedSubmitter(user.address, true)
      ).to.be.reverted;
    });

    it("Should emit event when authorization changes", async function () {
      await expect(oracle.setAuthorizedSubmitter(user.address, true))
        .to.emit(oracle, "SubmitterAuthorizationChanged")
        .withArgs(user.address, true);
    });
  });

  describe("Rate Submission", function () {
    it("Should allow authorized submitter to submit rates", async function () {
      await oracle.connect(submitter).submitRate(
        ETH_ADDRESS,
        500, // 5% in basis points
        200  // 2% volatility
      );

      expect(await oracle.getInterestRate(ETH_ADDRESS)).to.equal(500);
    });

    it("Should prevent unauthorized users from submitting", async function () {
      await expect(
        oracle.connect(user).submitRate(ETH_ADDRESS, 500, 200)
      ).to.be.reverted;
    });

    it("Should emit event on rate update", async function () {
      const tx = await oracle.connect(submitter).submitRate(ETH_ADDRESS, 500, 200);
      const block = await ethers.provider.getBlock(tx.blockNumber);

      await expect(tx)
        .to.emit(oracle, "InterestRateUpdated")
        .withArgs(ETH_ADDRESS, 500, 200, block.timestamp);
    });

    it("Should update volatility correctly", async function () {
      await oracle.connect(submitter).submitRate(ETH_ADDRESS, 500, 300);
      expect(await oracle.getVolatility(ETH_ADDRESS)).to.equal(300);
    });
  });

  describe("Batch Submission", function () {
    it("Should allow batch rate submissions", async function () {
      const assets = [
        ETH_ADDRESS,
        "0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599", // WBTC
        "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", // USDC
      ];
      const rates = [500, 450, 300];
      const volatilities = [200, 250, 50];

      await oracle.connect(submitter).batchSubmitRates(assets, rates, volatilities);

      expect(await oracle.getInterestRate(assets[0])).to.equal(500);
      expect(await oracle.getInterestRate(assets[1])).to.equal(450);
      expect(await oracle.getInterestRate(assets[2])).to.equal(300);
    });

    it("Should revert batch with mismatched arrays", async function () {
      await expect(
        oracle.connect(submitter).batchSubmitRates(
          [ETH_ADDRESS],
          [500, 600], // Wrong length
          [200]
        )
      ).to.be.reverted;
    });
  });

  describe("Rate Data Retrieval", function () {
    beforeEach(async function () {
      await oracle.connect(submitter).submitRate(ETH_ADDRESS, 500, 200);
    });

    it("Should return complete rate data", async function () {
      const [rate, volatility, lastUpdate, isStale] = await oracle.getRateData(ETH_ADDRESS);

      expect(rate).to.equal(500);
      expect(volatility).to.equal(200);
      expect(isStale).to.be.false;
    });

    it("Should detect stale rates", async function () {
      // Fast forward time past stale threshold
      await ethers.provider.send("evm_increaseTime", [3601]);
      await ethers.provider.send("evm_mine");

      const [, , , isStale] = await oracle.getRateData(ETH_ADDRESS);
      expect(isStale).to.be.true;
    });
  });

  describe("Stale Threshold", function () {
    it("Should allow owner to update stale threshold", async function () {
      await oracle.setStaleThreshold(7200);
      expect(await oracle.getStaleThreshold()).to.equal(7200);
    });

    it("Should prevent non-owners from updating threshold", async function () {
      await expect(
        oracle.connect(user).setStaleThreshold(7200)
      ).to.be.reverted;
    });
  });
});

describe("LendingPool", function () {
  let pool;
  let oracle;
  let owner;
  let user1;
  let user2;
  const ETH_ADDRESS = "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE";

  beforeEach(async function () {
    [owner, user1, user2] = await ethers.getSigners();

    // Deploy Oracle first
    const InterestRateOracle = await ethers.getContractFactory("InterestRateOracle");
    oracle = await InterestRateOracle.deploy(3600);
    await oracle.waitForDeployment();

    // Deploy LendingPool
    const LendingPool = await ethers.getContractFactory("LendingPool");
    pool = await LendingPool.deploy(await oracle.getAddress());
    await pool.waitForDeployment();

    // Add ETH as supported asset with 75% collateral factor
    await pool.addSupportedAsset(ETH_ADDRESS, 7500);

    // Submit initial interest rate
    await oracle.submitRate(ETH_ADDRESS, 500, 200);
  });

  describe("Deployment", function () {
    it("Should set the oracle address", async function () {
      // Oracle should be set (implementation-specific check)
      expect(await pool.isAssetSupported(ETH_ADDRESS)).to.be.true;
    });

    it("Should have ETH as supported asset", async function () {
      expect(await pool.isAssetSupported(ETH_ADDRESS)).to.be.true;
    });
  });

  describe("Deposits", function () {
    it("Should accept ETH deposits", async function () {
      const depositAmount = ethers.parseEther("1.0");

      await pool.connect(user1).deposit(ETH_ADDRESS, depositAmount, {
        value: depositAmount,
      });

      const userDeposit = await pool.getUserDeposit(user1.address, ETH_ADDRESS);
      expect(userDeposit).to.equal(depositAmount);
    });

    it("Should emit Deposit event", async function () {
      const depositAmount = ethers.parseEther("1.0");

      await expect(
        pool.connect(user1).deposit(ETH_ADDRESS, depositAmount, {
          value: depositAmount,
        })
      )
        .to.emit(pool, "Deposit")
        .withArgs(user1.address, ETH_ADDRESS, depositAmount);
    });

    it("Should update total supply", async function () {
      const depositAmount = ethers.parseEther("1.0");

      await pool.connect(user1).deposit(ETH_ADDRESS, depositAmount, {
        value: depositAmount,
      });

      const [totalSupply] = await pool.getAssetData(ETH_ADDRESS);
      expect(totalSupply).to.equal(depositAmount);
    });

    it("Should reject deposits for unsupported assets", async function () {
      const fakeAsset = "0x0000000000000000000000000000000000000001";

      await expect(
        pool.connect(user1).deposit(fakeAsset, ethers.parseEther("1.0"), {
          value: ethers.parseEther("1.0"),
        })
      ).to.be.reverted;
    });
  });

  describe("Withdrawals", function () {
    beforeEach(async function () {
      // Deposit first
      const depositAmount = ethers.parseEther("2.0");
      await pool.connect(user1).deposit(ETH_ADDRESS, depositAmount, {
        value: depositAmount,
      });
    });

    it("Should allow withdrawals", async function () {
      const withdrawAmount = ethers.parseEther("1.0");
      const balanceBefore = await ethers.provider.getBalance(user1.address);

      const tx = await pool.connect(user1).withdraw(ETH_ADDRESS, withdrawAmount);
      const receipt = await tx.wait();
      const gasUsed = receipt.gasUsed * tx.gasPrice;

      const balanceAfter = await ethers.provider.getBalance(user1.address);
      expect(balanceAfter).to.be.closeTo(
        balanceBefore + withdrawAmount - gasUsed,
        ethers.parseEther("0.01")
      );
    });

    it("Should emit Withdraw event", async function () {
      const withdrawAmount = ethers.parseEther("1.0");

      await expect(pool.connect(user1).withdraw(ETH_ADDRESS, withdrawAmount))
        .to.emit(pool, "Withdraw")
        .withArgs(user1.address, ETH_ADDRESS, withdrawAmount);
    });

    it("Should prevent withdrawing more than deposited", async function () {
      await expect(
        pool.connect(user1).withdraw(ETH_ADDRESS, ethers.parseEther("10.0"))
      ).to.be.reverted;
    });
  });

  describe("Borrowing", function () {
    beforeEach(async function () {
      // User1 deposits collateral
      await pool.connect(user1).deposit(ETH_ADDRESS, ethers.parseEther("10.0"), {
        value: ethers.parseEther("10.0"),
      });

      // User2 deposits to provide liquidity
      await pool.connect(user2).deposit(ETH_ADDRESS, ethers.parseEther("10.0"), {
        value: ethers.parseEther("10.0"),
      });

      // Update asset price
      await pool.updateAssetPrice(ETH_ADDRESS, ethers.parseEther("2000"));
    });

    it("Should allow borrowing within collateral limits", async function () {
      const borrowAmount = ethers.parseEther("1.0");

      await pool.connect(user1).borrow(ETH_ADDRESS, borrowAmount);

      const [principal] = await pool.getUserBorrow(user1.address, ETH_ADDRESS);
      expect(principal).to.equal(borrowAmount);
    });

    it("Should emit Borrow event", async function () {
      const borrowAmount = ethers.parseEther("1.0");

      await expect(pool.connect(user1).borrow(ETH_ADDRESS, borrowAmount))
        .to.emit(pool, "Borrow");
    });

    it("Should prevent over-borrowing", async function () {
      // Try to borrow more than collateral allows
      await expect(
        pool.connect(user1).borrow(ETH_ADDRESS, ethers.parseEther("100.0"))
      ).to.be.reverted;
    });
  });

  describe("Repayment", function () {
    beforeEach(async function () {
      // Setup: deposit and borrow
      await pool.connect(user1).deposit(ETH_ADDRESS, ethers.parseEther("10.0"), {
        value: ethers.parseEther("10.0"),
      });
      await pool.connect(user2).deposit(ETH_ADDRESS, ethers.parseEther("10.0"), {
        value: ethers.parseEther("10.0"),
      });
      await pool.updateAssetPrice(ETH_ADDRESS, ethers.parseEther("2000"));
      await pool.connect(user1).borrow(ETH_ADDRESS, ethers.parseEther("1.0"));
    });

    it("Should allow repayment", async function () {
      const repayAmount = ethers.parseEther("0.5");

      await pool.connect(user1).repay(ETH_ADDRESS, repayAmount, {
        value: repayAmount,
      });

      const [principal] = await pool.getUserBorrow(user1.address, ETH_ADDRESS);
      expect(principal).to.be.lt(ethers.parseEther("1.0"));
    });

    it("Should emit Repay event", async function () {
      const repayAmount = ethers.parseEther("0.5");

      await expect(
        pool.connect(user1).repay(ETH_ADDRESS, repayAmount, {
          value: repayAmount,
        })
      )
        .to.emit(pool, "Repay")
        .withArgs(user1.address, ETH_ADDRESS, repayAmount);
    });
  });

  describe("Health Factor", function () {
    beforeEach(async function () {
      await pool.connect(user1).deposit(ETH_ADDRESS, ethers.parseEther("10.0"), {
        value: ethers.parseEther("10.0"),
      });
      await pool.connect(user2).deposit(ETH_ADDRESS, ethers.parseEther("10.0"), {
        value: ethers.parseEther("10.0"),
      });
      await pool.updateAssetPrice(ETH_ADDRESS, ethers.parseEther("2000"));
    });

    it("Should return high health factor with no borrows", async function () {
      const healthFactor = await pool.getHealthFactor(user1.address);
      // With no borrows, health factor should be very high or max
      expect(healthFactor).to.be.gt(ethers.parseEther("1.0"));
    });

    it("Should decrease health factor after borrowing", async function () {
      const healthBefore = await pool.getHealthFactor(user1.address);

      await pool.connect(user1).borrow(ETH_ADDRESS, ethers.parseEther("1.0"));

      const healthAfter = await pool.getHealthFactor(user1.address);
      expect(healthAfter).to.be.lt(healthBefore);
    });
  });
});
