// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "./InterestRateOracle.sol";

/**
 * @title LendingPool
 * @dev Main lending pool contract for the DeFi platform
 * @notice Users can supply assets to earn interest and borrow against collateral
 */
contract LendingPool is ReentrancyGuard, Pausable, Ownable {
    using SafeERC20 for IERC20;

    // ============ Structs ============

    struct UserSupply {
        uint256 amount;           // Amount supplied
        uint256 interestEarned;   // Accumulated interest
        uint256 lastUpdateTime;   // Last time interest was calculated
    }

    struct UserBorrow {
        uint256 principal;        // Original borrowed amount
        uint256 interestAccrued;  // Accumulated interest
        uint256 lastUpdateTime;   // Last time interest was calculated
        uint256 collateralAmount; // Collateral deposited
        address collateralAsset;  // Collateral asset address
    }

    struct AssetConfig {
        bool isActive;            // Whether the asset is active for lending
        uint256 collateralFactor; // Collateral factor (in basis points, 8000 = 80%)
        uint256 liquidationThreshold; // Liquidation threshold (in basis points)
        uint256 liquidationBonus; // Bonus for liquidators (in basis points, 500 = 5%)
        uint256 reserveFactor;    // Reserve factor (in basis points)
        uint256 totalSupplied;    // Total amount supplied
        uint256 totalBorrowed;    // Total amount borrowed
        uint256 totalReserves;    // Protocol reserves
    }

    // ============ State Variables ============

    // Interest Rate Oracle
    InterestRateOracle public immutable interestRateOracle;

    // Supported assets configuration
    mapping(address => AssetConfig) public assetConfigs;

    // User supplies: user => asset => supply info
    mapping(address => mapping(address => UserSupply)) public userSupplies;

    // User borrows: user => asset => borrow info
    mapping(address => mapping(address => UserBorrow)) public userBorrows;

    // List of assets user has supplied
    mapping(address => address[]) public userSuppliedAssets;

    // List of assets user has borrowed
    mapping(address => address[]) public userBorrowedAssets;

    // Minimum collateral ratio (150% = 15000 basis points)
    uint256 public constant MIN_COLLATERAL_RATIO = 15000;

    // Basis points denominator
    uint256 public constant BASIS_POINTS = 10000;

    // Seconds per year for interest calculation
    uint256 public constant SECONDS_PER_YEAR = 31536000;

    // ============ Events ============

    event AssetConfigured(address indexed asset, uint256 collateralFactor, uint256 liquidationThreshold);
    event Supply(address indexed user, address indexed asset, uint256 amount);
    event Withdraw(address indexed user, address indexed asset, uint256 amount);
    event Borrow(address indexed user, address indexed asset, uint256 amount, address collateralAsset, uint256 collateralAmount);
    event Repay(address indexed user, address indexed asset, uint256 amount);
    event Liquidation(address indexed liquidator, address indexed borrower, address indexed asset, uint256 amount);
    event CollateralDeposited(address indexed user, address indexed asset, uint256 amount);
    event CollateralWithdrawn(address indexed user, address indexed asset, uint256 amount);

    // ============ Constructor ============

    constructor(address _interestRateOracle) Ownable(msg.sender) {
        require(_interestRateOracle != address(0), "Invalid oracle address");
        interestRateOracle = InterestRateOracle(_interestRateOracle);
    }

    // ============ Admin Functions ============

    /**
     * @dev Configure an asset for lending
     */
    function configureAsset(
        address _asset,
        uint256 _collateralFactor,
        uint256 _liquidationThreshold,
        uint256 _liquidationBonus,
        uint256 _reserveFactor
    ) external onlyOwner {
        require(_asset != address(0), "Invalid asset");
        require(_collateralFactor <= BASIS_POINTS, "Invalid collateral factor");
        require(_liquidationThreshold <= BASIS_POINTS, "Invalid liquidation threshold");
        require(_liquidationBonus <= 2000, "Liquidation bonus too high"); // Max 20%
        require(_reserveFactor <= 5000, "Reserve factor too high"); // Max 50%

        assetConfigs[_asset] = AssetConfig({
            isActive: true,
            collateralFactor: _collateralFactor,
            liquidationThreshold: _liquidationThreshold,
            liquidationBonus: _liquidationBonus,
            reserveFactor: _reserveFactor,
            totalSupplied: assetConfigs[_asset].totalSupplied,
            totalBorrowed: assetConfigs[_asset].totalBorrowed,
            totalReserves: assetConfigs[_asset].totalReserves
        });

        emit AssetConfigured(_asset, _collateralFactor, _liquidationThreshold);
    }

    /**
     * @dev Pause the contract
     */
    function pause() external onlyOwner {
        _pause();
    }

    /**
     * @dev Unpause the contract
     */
    function unpause() external onlyOwner {
        _unpause();
    }

    // ============ Supply Functions ============

    /**
     * @dev Supply assets to the lending pool
     * @param _asset Asset address to supply
     * @param _amount Amount to supply
     */
    function supply(address _asset, uint256 _amount) external nonReentrant whenNotPaused {
        require(_amount > 0, "Amount must be > 0");
        require(assetConfigs[_asset].isActive, "Asset not active");

        // Update interest before modifying balance
        _updateSupplyInterest(msg.sender, _asset);

        // Transfer tokens from user
        IERC20(_asset).safeTransferFrom(msg.sender, address(this), _amount);

        // Update user supply
        UserSupply storage userSupply = userSupplies[msg.sender][_asset];
        if (userSupply.amount == 0) {
            userSuppliedAssets[msg.sender].push(_asset);
        }
        userSupply.amount += _amount;
        userSupply.lastUpdateTime = block.timestamp;

        // Update total supplied
        assetConfigs[_asset].totalSupplied += _amount;

        emit Supply(msg.sender, _asset, _amount);
    }

    /**
     * @dev Withdraw supplied assets
     * @param _asset Asset address to withdraw
     * @param _amount Amount to withdraw
     */
    function withdraw(address _asset, uint256 _amount) external nonReentrant whenNotPaused {
        UserSupply storage userSupply = userSupplies[msg.sender][_asset];
        require(userSupply.amount >= _amount, "Insufficient balance");

        // Update interest before modifying balance
        _updateSupplyInterest(msg.sender, _asset);

        // Check if withdrawal affects health factor
        require(_checkHealthFactorAfterWithdraw(msg.sender, _asset, _amount), "Would liquidate position");

        // Update balances
        userSupply.amount -= _amount;
        assetConfigs[_asset].totalSupplied -= _amount;

        // Transfer tokens to user (including earned interest)
        uint256 totalWithdraw = _amount;
        if (userSupply.interestEarned > 0 && _amount == userSupply.amount) {
            totalWithdraw += userSupply.interestEarned;
            userSupply.interestEarned = 0;
        }

        IERC20(_asset).safeTransfer(msg.sender, totalWithdraw);

        emit Withdraw(msg.sender, _asset, totalWithdraw);
    }

    // ============ Borrow Functions ============

    /**
     * @dev Borrow assets against collateral
     * @param _asset Asset to borrow
     * @param _amount Amount to borrow
     * @param _collateralAsset Collateral asset address
     * @param _collateralAmount Collateral amount
     */
    function borrow(
        address _asset,
        uint256 _amount,
        address _collateralAsset,
        uint256 _collateralAmount
    ) external nonReentrant whenNotPaused {
        require(_amount > 0, "Amount must be > 0");
        require(assetConfigs[_asset].isActive, "Asset not active");
        require(assetConfigs[_collateralAsset].isActive, "Collateral not active");
        require(
            assetConfigs[_asset].totalSupplied - assetConfigs[_asset].totalBorrowed >= _amount,
            "Insufficient liquidity"
        );

        // Transfer collateral from user
        IERC20(_collateralAsset).safeTransferFrom(msg.sender, address(this), _collateralAmount);

        // Check collateral ratio
        require(
            _checkCollateralRatio(_asset, _amount, _collateralAsset, _collateralAmount),
            "Insufficient collateral"
        );

        // Update interest before modifying balance
        _updateBorrowInterest(msg.sender, _asset);

        // Update user borrow
        UserBorrow storage userBorrow = userBorrows[msg.sender][_asset];
        if (userBorrow.principal == 0) {
            userBorrowedAssets[msg.sender].push(_asset);
        }
        userBorrow.principal += _amount;
        userBorrow.collateralAmount += _collateralAmount;
        userBorrow.collateralAsset = _collateralAsset;
        userBorrow.lastUpdateTime = block.timestamp;

        // Update total borrowed
        assetConfigs[_asset].totalBorrowed += _amount;

        // Transfer borrowed tokens to user
        IERC20(_asset).safeTransfer(msg.sender, _amount);

        emit Borrow(msg.sender, _asset, _amount, _collateralAsset, _collateralAmount);
        emit CollateralDeposited(msg.sender, _collateralAsset, _collateralAmount);
    }

    /**
     * @dev Repay borrowed assets
     * @param _asset Asset to repay
     * @param _amount Amount to repay
     */
    function repay(address _asset, uint256 _amount) external nonReentrant whenNotPaused {
        UserBorrow storage userBorrow = userBorrows[msg.sender][_asset];
        require(userBorrow.principal > 0, "No borrow to repay");

        // Update interest
        _updateBorrowInterest(msg.sender, _asset);

        uint256 totalDebt = userBorrow.principal + userBorrow.interestAccrued;
        uint256 repayAmount = _amount > totalDebt ? totalDebt : _amount;

        // Transfer repayment from user
        IERC20(_asset).safeTransferFrom(msg.sender, address(this), repayAmount);

        // Calculate interest vs principal payment
        if (repayAmount <= userBorrow.interestAccrued) {
            userBorrow.interestAccrued -= repayAmount;
        } else {
            uint256 principalPayment = repayAmount - userBorrow.interestAccrued;
            userBorrow.interestAccrued = 0;
            userBorrow.principal -= principalPayment;
        }

        // Update total borrowed
        assetConfigs[_asset].totalBorrowed -= repayAmount;

        // Return collateral if fully repaid
        if (userBorrow.principal == 0 && userBorrow.interestAccrued == 0) {
            uint256 collateralToReturn = userBorrow.collateralAmount;
            address collateralAsset = userBorrow.collateralAsset;
            userBorrow.collateralAmount = 0;
            
            IERC20(collateralAsset).safeTransfer(msg.sender, collateralToReturn);
            emit CollateralWithdrawn(msg.sender, collateralAsset, collateralToReturn);
        }

        emit Repay(msg.sender, _asset, repayAmount);
    }

    // ============ Liquidation Functions ============

    /**
     * @dev Liquidate an undercollateralized position
     * @param _borrower Address of the borrower to liquidate
     * @param _asset Asset being borrowed
     * @param _repayAmount Amount to repay on behalf of borrower
     */
    function liquidate(
        address _borrower,
        address _asset,
        uint256 _repayAmount
    ) external nonReentrant whenNotPaused {
        UserBorrow storage userBorrow = userBorrows[_borrower][_asset];
        require(userBorrow.principal > 0, "No borrow to liquidate");

        // Update interest
        _updateBorrowInterest(_borrower, _asset);

        // Check if position is liquidatable
        require(!_isPositionHealthy(_borrower, _asset), "Position is healthy");

        uint256 totalDebt = userBorrow.principal + userBorrow.interestAccrued;
        uint256 maxLiquidation = totalDebt / 2; // Can liquidate up to 50% of debt
        uint256 actualRepay = _repayAmount > maxLiquidation ? maxLiquidation : _repayAmount;

        // Transfer repayment from liquidator
        IERC20(_asset).safeTransferFrom(msg.sender, address(this), actualRepay);

        // Calculate collateral to seize (with bonus)
        uint256 collateralBonus = assetConfigs[_asset].liquidationBonus;
        uint256 collateralToSeize = (actualRepay * (BASIS_POINTS + collateralBonus)) / BASIS_POINTS;
        
        // Ensure we don't seize more than available
        if (collateralToSeize > userBorrow.collateralAmount) {
            collateralToSeize = userBorrow.collateralAmount;
        }

        // Update borrower's position
        if (actualRepay <= userBorrow.interestAccrued) {
            userBorrow.interestAccrued -= actualRepay;
        } else {
            uint256 principalPayment = actualRepay - userBorrow.interestAccrued;
            userBorrow.interestAccrued = 0;
            userBorrow.principal -= principalPayment;
        }
        userBorrow.collateralAmount -= collateralToSeize;

        // Update totals
        assetConfigs[_asset].totalBorrowed -= actualRepay;

        // Transfer collateral to liquidator
        IERC20(userBorrow.collateralAsset).safeTransfer(msg.sender, collateralToSeize);

        emit Liquidation(msg.sender, _borrower, _asset, actualRepay);
    }

    // ============ View Functions ============

    /**
     * @dev Get user's health factor
     */
    function getHealthFactor(address _user) external view returns (uint256) {
        return _calculateHealthFactor(_user);
    }

    /**
     * @dev Get current borrow rate for an asset (from oracle)
     */
    function getBorrowRate(address _asset) public view returns (uint256) {
        (uint256 rate, , ) = interestRateOracle.getInterestRate(_asset);
        return rate;
    }

    /**
     * @dev Get current supply rate for an asset
     */
    function getSupplyRate(address _asset) public view returns (uint256) {
        uint256 borrowRate = getBorrowRate(_asset);
        AssetConfig memory config = assetConfigs[_asset];
        
        if (config.totalSupplied == 0) return 0;
        
        uint256 utilization = (config.totalBorrowed * BASIS_POINTS) / config.totalSupplied;
        uint256 supplyRate = (borrowRate * utilization * (BASIS_POINTS - config.reserveFactor)) / (BASIS_POINTS * BASIS_POINTS);
        
        return supplyRate;
    }

    /**
     * @dev Get utilization rate for an asset
     */
    function getUtilizationRate(address _asset) external view returns (uint256) {
        AssetConfig memory config = assetConfigs[_asset];
        if (config.totalSupplied == 0) return 0;
        return (config.totalBorrowed * BASIS_POINTS) / config.totalSupplied;
    }

    /**
     * @dev Get user's total supply and borrow values
     */
    function getUserAccountData(address _user) external view returns (
        uint256 totalSupplied,
        uint256 totalBorrowed,
        uint256 healthFactor
    ) {
        address[] memory suppliedAssets = userSuppliedAssets[_user];
        address[] memory borrowedAssets = userBorrowedAssets[_user];

        for (uint256 i = 0; i < suppliedAssets.length; i++) {
            totalSupplied += userSupplies[_user][suppliedAssets[i]].amount;
        }

        for (uint256 i = 0; i < borrowedAssets.length; i++) {
            UserBorrow memory borrow_ = userBorrows[_user][borrowedAssets[i]];
            totalBorrowed += borrow_.principal + borrow_.interestAccrued;
        }

        healthFactor = _calculateHealthFactor(_user);
    }

    // ============ Internal Functions ============

    /**
     * @dev Update supply interest for a user
     */
    function _updateSupplyInterest(address _user, address _asset) internal {
        UserSupply storage userSupply = userSupplies[_user][_asset];
        
        if (userSupply.amount == 0 || userSupply.lastUpdateTime == 0) {
            userSupply.lastUpdateTime = block.timestamp;
            return;
        }

        uint256 timeElapsed = block.timestamp - userSupply.lastUpdateTime;
        if (timeElapsed == 0) return;

        uint256 supplyRate = getSupplyRate(_asset);
        uint256 interest = (userSupply.amount * supplyRate * timeElapsed) / (BASIS_POINTS * SECONDS_PER_YEAR);
        
        userSupply.interestEarned += interest;
        userSupply.lastUpdateTime = block.timestamp;
    }

    /**
     * @dev Update borrow interest for a user
     */
    function _updateBorrowInterest(address _user, address _asset) internal {
        UserBorrow storage userBorrow = userBorrows[_user][_asset];
        
        if (userBorrow.principal == 0 || userBorrow.lastUpdateTime == 0) {
            userBorrow.lastUpdateTime = block.timestamp;
            return;
        }

        uint256 timeElapsed = block.timestamp - userBorrow.lastUpdateTime;
        if (timeElapsed == 0) return;

        uint256 borrowRate = getBorrowRate(_asset);
        uint256 interest = ((userBorrow.principal + userBorrow.interestAccrued) * borrowRate * timeElapsed) / (BASIS_POINTS * SECONDS_PER_YEAR);
        
        userBorrow.interestAccrued += interest;
        userBorrow.lastUpdateTime = block.timestamp;

        // Add to reserves
        uint256 reserveAmount = (interest * assetConfigs[_asset].reserveFactor) / BASIS_POINTS;
        assetConfigs[_asset].totalReserves += reserveAmount;
    }

    /**
     * @dev Check if collateral ratio is sufficient
     */
    function _checkCollateralRatio(
        address _borrowAsset,
        uint256 _borrowAmount,
        address _collateralAsset,
        uint256 _collateralAmount
    ) internal view returns (bool) {
        // Simplified: assume 1:1 price ratio for demo
        // In production, use Chainlink or another price oracle
        uint256 collateralFactor = assetConfigs[_collateralAsset].collateralFactor;
        uint256 adjustedCollateral = (_collateralAmount * collateralFactor) / BASIS_POINTS;
        
        return adjustedCollateral >= (_borrowAmount * MIN_COLLATERAL_RATIO) / BASIS_POINTS;
    }

    /**
     * @dev Check health factor after withdrawal
     */
    function _checkHealthFactorAfterWithdraw(
        address _user,
        address _asset,
        uint256 _withdrawAmount
    ) internal view returns (bool) {
        // If user has no borrows, always allow withdrawal
        if (userBorrowedAssets[_user].length == 0) return true;

        // Check if remaining supply covers borrow
        uint256 remainingSupply = userSupplies[_user][_asset].amount - _withdrawAmount;
        uint256 collateralFactor = assetConfigs[_asset].collateralFactor;
        uint256 adjustedCollateral = (remainingSupply * collateralFactor) / BASIS_POINTS;

        // Calculate total debt
        uint256 totalDebt = 0;
        for (uint256 i = 0; i < userBorrowedAssets[_user].length; i++) {
            UserBorrow memory borrow_ = userBorrows[_user][userBorrowedAssets[_user][i]];
            totalDebt += borrow_.principal + borrow_.interestAccrued;
        }

        return adjustedCollateral >= totalDebt;
    }

    /**
     * @dev Calculate health factor for a user
     */
    function _calculateHealthFactor(address _user) internal view returns (uint256) {
        uint256 totalCollateralValue = 0;
        uint256 totalDebtValue = 0;

        // Sum up collateral values
        for (uint256 i = 0; i < userSuppliedAssets[_user].length; i++) {
            address asset = userSuppliedAssets[_user][i];
            uint256 amount = userSupplies[_user][asset].amount;
            uint256 liquidationThreshold = assetConfigs[asset].liquidationThreshold;
            totalCollateralValue += (amount * liquidationThreshold) / BASIS_POINTS;
        }

        // Sum up debt values
        for (uint256 i = 0; i < userBorrowedAssets[_user].length; i++) {
            address asset = userBorrowedAssets[_user][i];
            UserBorrow memory borrow_ = userBorrows[_user][asset];
            totalDebtValue += borrow_.principal + borrow_.interestAccrued;
        }

        if (totalDebtValue == 0) return type(uint256).max;

        return (totalCollateralValue * BASIS_POINTS) / totalDebtValue;
    }

    /**
     * @dev Check if a position is healthy
     */
    function _isPositionHealthy(address _user, address _asset) internal view returns (bool) {
        UserBorrow memory borrow_ = userBorrows[_user][_asset];
        uint256 totalDebt = borrow_.principal + borrow_.interestAccrued;
        
        if (totalDebt == 0) return true;

        uint256 collateralFactor = assetConfigs[borrow_.collateralAsset].liquidationThreshold;
        uint256 adjustedCollateral = (borrow_.collateralAmount * collateralFactor) / BASIS_POINTS;

        return adjustedCollateral >= totalDebt;
    }
}
