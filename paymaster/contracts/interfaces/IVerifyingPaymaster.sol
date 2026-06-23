// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.28;

import {IEntryPoint} from "@account-abstraction/contracts/interfaces/IEntryPoint.sol";
import {IPaymaster} from "@account-abstraction/contracts/interfaces/IPaymaster.sol";

/// @title IVerifyingPaymaster
/// @notice Interface for a paymaster that sponsors UserOperations authorized by an off-chain signer.
interface IVerifyingPaymaster is IPaymaster {
  /// @notice Emitted when the verifying signer is replaced.
  /// @param oldSigner The signer address that was previously accepted.
  /// @param newSigner The signer address that is now accepted.
  event SignerUpdated(address indexed oldSigner, address indexed newSigner);

  /// @notice Emitted when ETH is deposited into the EntryPoint for this paymaster.
  /// @param amount The amount of ETH deposited.
  event FundsDeposited(uint256 amount);

  /// @notice Emitted when ETH is withdrawn from this paymaster's EntryPoint deposit.
  /// @param to The recipient of the withdrawn ETH.
  /// @param amount The amount of ETH withdrawn.
  event FundsWithdrawn(address indexed to, uint256 amount);

  /// @notice Emitted after a sponsored UserOperation is charged to the paymaster.
  /// @param userOpHash The EntryPoint hash of the sponsored UserOperation.
  /// @param sender The account that submitted the UserOperation.
  /// @param actualGasCost The actual gas cost charged for the UserOperation.
  event UserOperationSponsored(bytes32 indexed userOpHash, address indexed sender, uint256 actualGasCost);

  /// @notice Reverted when signature data is missing or malformed.
  error InvalidSignature();

  /// @notice Reverted when the sponsorship validity window has already expired.
  error SignatureExpired();

  /// @notice Reverted when the validity range is malformed.
  error InvalidTimeRange();

  /// @notice Reverted when the paymaster deposit cannot cover the requested maximum cost.
  error InsufficientDeposit();

  /// @notice Reverted when an address argument cannot be zero.
  error ZeroAddress();

  /// @notice Returns the EntryPoint trusted by this paymaster.
  /// @return The EntryPoint contract.
  function entryPoint() external view returns (IEntryPoint);

  /// @notice Returns the off-chain signer whose signatures authorize sponsorship.
  /// @return The verifying signer address.
  function verifyingSigner() external view returns (address);

  /// @notice Deposits ETH into the EntryPoint for this paymaster.
  function depositFunds() external payable;

  /// @notice Withdraws ETH from this paymaster's EntryPoint deposit.
  /// @param to The recipient address.
  /// @param amount The amount of ETH to withdraw.
  function withdrawFunds(address payable to, uint256 amount) external;

  /// @notice Updates the signer whose signatures authorize sponsorship.
  /// @param newSigner The replacement signer address.
  function updateSigner(address newSigner) external;

  /// @notice Returns this paymaster's current EntryPoint deposit.
  /// @return The deposit balance.
  function getDeposit() external view returns (uint256);
}
