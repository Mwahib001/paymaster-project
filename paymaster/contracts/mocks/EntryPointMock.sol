// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.28;

import {IERC165} from "@openzeppelin/contracts/utils/introspection/IERC165.sol";
import {IEntryPoint} from "@account-abstraction/contracts/interfaces/IEntryPoint.sol";
import {IPaymaster} from "@account-abstraction/contracts/interfaces/IPaymaster.sol";
import {PackedUserOperation} from "@account-abstraction/contracts/interfaces/PackedUserOperation.sol";

/// @title EntryPointMock
/// @notice Minimal EntryPoint-compatible mock for paymaster tests and local deployments.
contract EntryPointMock is IERC165 {
  /// @notice Deposit balances by account.
  mapping(address account => uint256 balance) public balances;

  /// @notice Accepts ETH sent directly to the mock.
  receive() external payable {}

  /// @notice Reports support for ERC-165 and the EntryPoint interface id expected by BasePaymaster.
  /// @param interfaceId The interface identifier being queried.
  /// @return True when the interface is supported.
  function supportsInterface(bytes4 interfaceId) external pure returns (bool) {
    return interfaceId == type(IERC165).interfaceId || interfaceId == type(IEntryPoint).interfaceId;
  }

  /// @notice Deposits ETH for an account.
  /// @param account The account receiving the deposit credit.
  function depositTo(address account) external payable {
    balances[account] += msg.value;
  }

  /// @notice Withdraws ETH from the caller's deposit.
  /// @param withdrawAddress The recipient of the withdrawn ETH.
  /// @param amount The amount to withdraw.
  function withdrawTo(address payable withdrawAddress, uint256 amount) external {
    require(balances[msg.sender] >= amount, "insufficient deposit");
    balances[msg.sender] -= amount;
    withdrawAddress.transfer(amount);
  }

  /// @notice Returns an account's deposit balance.
  /// @param account The account whose balance is requested.
  /// @return The deposited ETH balance.
  function balanceOf(address account) external view returns (uint256) {
    return balances[account];
  }

  /// @notice Calls paymaster validation as the EntryPoint.
  /// @param paymaster The paymaster to validate through.
  /// @param userOp The packed UserOperation to validate.
  /// @param userOpHash The EntryPoint UserOperation hash.
  /// @param maxCost The maximum cost passed to the paymaster.
  /// @return context The context returned by the paymaster.
  /// @return validationData The validation data returned by the paymaster.
  function callValidate(
    IPaymaster paymaster,
    PackedUserOperation calldata userOp,
    bytes32 userOpHash,
    uint256 maxCost
  ) external returns (bytes memory context, uint256 validationData) {
    return paymaster.validatePaymasterUserOp(userOp, userOpHash, maxCost);
  }

  /// @notice Calls paymaster post-operation handling as the EntryPoint.
  /// @param paymaster The paymaster to call.
  /// @param mode The post-operation mode.
  /// @param context The context returned during validation.
  /// @param actualGasCost The actual gas cost being charged.
  /// @param actualUserOpFeePerGas The effective UserOperation fee per gas.
  function callPostOp(
    IPaymaster paymaster,
    IPaymaster.PostOpMode mode,
    bytes calldata context,
    uint256 actualGasCost,
    uint256 actualUserOpFeePerGas
  ) external {
    paymaster.postOp(mode, context, actualGasCost, actualUserOpFeePerGas);
  }
}
