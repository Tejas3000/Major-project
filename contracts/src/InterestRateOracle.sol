// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title InterestRateOracle
 * @dev Oracle contract that receives interest rate updates from the ML backend
 * @notice This oracle is updated by an authorized backend service with ML-predicted rates
 */
contract InterestRateOracle is Ownable {
    // Mapping of asset address to current interest rate (in basis points, e.g., 500 = 5%)
    mapping(address => uint256) public interestRates;
    
    // Mapping of asset address to last update timestamp
    mapping(address => uint256) public lastUpdated;
    
    // Mapping of asset address to volatility index (0-100)
    mapping(address => uint256) public volatilityIndex;
    
    // Authorized updaters (backend services)
    mapping(address => bool) public authorizedUpdaters;
    
    // Minimum update interval (1 hour in seconds)
    uint256 public constant MIN_UPDATE_INTERVAL = 3600;
    
    // Events
    event InterestRateUpdated(address indexed asset, uint256 newRate, uint256 volatility, uint256 timestamp);
    event UpdaterAuthorized(address indexed updater, bool authorized);
    
    constructor() Ownable(msg.sender) {}
    
    /**
     * @dev Authorize or deauthorize an address to update rates
     */
    function setAuthorizedUpdater(address _updater, bool _authorized) external onlyOwner {
        authorizedUpdaters[_updater] = _authorized;
        emit UpdaterAuthorized(_updater, _authorized);
    }
    
    /**
     * @dev Update interest rate for an asset (called by authorized backend)
     * @param _asset The asset address
     * @param _rate The new interest rate in basis points (500 = 5%)
     * @param _volatility The volatility index (0-100)
     */
    function updateInterestRate(
        address _asset,
        uint256 _rate,
        uint256 _volatility
    ) external {
        require(authorizedUpdaters[msg.sender], "Not authorized");
        require(_rate <= 10000, "Rate too high"); // Max 100%
        require(_volatility <= 100, "Invalid volatility");
        
        interestRates[_asset] = _rate;
        volatilityIndex[_asset] = _volatility;
        lastUpdated[_asset] = block.timestamp;
        
        emit InterestRateUpdated(_asset, _rate, _volatility, block.timestamp);
    }
    
    /**
     * @dev Batch update interest rates for multiple assets
     */
    function batchUpdateRates(
        address[] calldata _assets,
        uint256[] calldata _rates,
        uint256[] calldata _volatilities
    ) external {
        require(authorizedUpdaters[msg.sender], "Not authorized");
        require(_assets.length == _rates.length && _rates.length == _volatilities.length, "Length mismatch");
        
        for (uint256 i = 0; i < _assets.length; i++) {
            require(_rates[i] <= 10000, "Rate too high");
            require(_volatilities[i] <= 100, "Invalid volatility");
            
            interestRates[_assets[i]] = _rates[i];
            volatilityIndex[_assets[i]] = _volatilities[i];
            lastUpdated[_assets[i]] = block.timestamp;
            
            emit InterestRateUpdated(_assets[i], _rates[i], _volatilities[i], block.timestamp);
        }
    }
    
    /**
     * @dev Get the current interest rate for an asset
     * @return rate The interest rate in basis points
     * @return timestamp The last update timestamp
     * @return volatility The volatility index
     */
    function getInterestRate(address _asset) external view returns (
        uint256 rate,
        uint256 timestamp,
        uint256 volatility
    ) {
        return (
            interestRates[_asset],
            lastUpdated[_asset],
            volatilityIndex[_asset]
        );
    }
    
    /**
     * @dev Check if rate data is fresh (updated within last hour)
     */
    function isRateFresh(address _asset) external view returns (bool) {
        return block.timestamp - lastUpdated[_asset] <= MIN_UPDATE_INTERVAL;
    }
}
