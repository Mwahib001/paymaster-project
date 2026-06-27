// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.28;

import {BasePaymaster} from "@account-abstraction/contracts/core/BasePaymaster.sol";
import {_packValidationData} from "@account-abstraction/contracts/core/Helpers.sol";
import {IEntryPoint} from "@account-abstraction/contracts/interfaces/IEntryPoint.sol";
import {IPaymaster} from "@account-abstraction/contracts/interfaces/IPaymaster.sol";
import {PackedUserOperation} from "@account-abstraction/contracts/interfaces/PackedUserOperation.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {MessageHashUtils} from "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";

/// @title VerifyingPaymaster
/// @notice ERC-4337 paymaster that sponsors UserOperations approved by a trusted off-chain signer.
contract VerifyingPaymaster is BasePaymaster {
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

  /// @notice Off-chain signer whose signatures authorize sponsorship.
  address public verifyingSigner;

  /// @notice Tracks UserOperation hashes that have already been accepted.
  mapping(bytes32 userOpHash => bool used) private _usedHashes;

  /// @notice Creates a verifying paymaster for an EntryPoint and signer.
  /// @param _entryPoint The EntryPoint this paymaster trusts.
  /// @param _verifyingSigner The off-chain signer whose signatures authorize sponsorship.
  /// @param _owner The owner allowed to administer funds and signer updates.
  constructor(
    IEntryPoint _entryPoint,
    address _verifyingSigner,
    address _owner
  ) BasePaymaster(_entryPoint) {
    if (address(_entryPoint) == address(0) || _verifyingSigner == address(0) || _owner == address(0)) {
      revert ZeroAddress();
    }

    verifyingSigner = _verifyingSigner;

    if (_owner != owner()) {
      _transferOwnership(_owner);
    }
  }

  /// @notice Validates a sponsored UserOperation using a paymaster signature.
  /// @param userOp The packed UserOperation being validated.
  /// @param userOpHash The EntryPoint hash of the UserOperation.
  /// @param maxCost The maximum ETH cost the paymaster may be charged.
  /// @return context Encoded post-operation context.
  /// @return validationData Packed signature status and validity bounds.
  function _validatePaymasterUserOp(
    PackedUserOperation calldata userOp,
    bytes32 userOpHash,
    uint256 maxCost
  ) internal override returns (bytes memory context, uint256 validationData) {
    // Support standard v0.7 paymasterAndData layout:
    // [0:20] pm | [20:52] pmVerificationGas+pmPostOpGas (32B) | [52:58] validUntil | [58:64] validAfter | [64:] sig
    // Our sponsor data starts after the 32B pm gas fields.
    if (userOp.paymasterAndData.length < 64 + 65) {
      revert InvalidSignature();
    }

    uint48 validUntil = uint48(bytes6(userOp.paymasterAndData[52:58]));
    uint48 validAfter = uint48(bytes6(userOp.paymasterAndData[58:64]));

    if (validAfter >= validUntil) {
      revert InvalidTimeRange();
    }

    if (block.timestamp > validUntil) {
      revert SignatureExpired();
    }

    if (entryPoint.balanceOf(address(this)) < maxCost) {
      revert InsufficientDeposit();
    }

    if (_usedHashes[userOpHash]) {
      return ("", _packValidationData(true, validUntil, validAfter));
    }

    bytes calldata signature = userOp.paymasterAndData[64:];

    // Sponsorship digest is built from stable UserOp intent fields + window + chain.
    // This is independent of paymasterAndData (the signature lives inside it).
    // Full userOpHash (from EntryPoint) is used only for replay protection and events.
    bytes32 intentHash = keccak256(abi.encode(
      userOp.sender,
      userOp.nonce,
      keccak256(userOp.callData),
      userOp.accountGasLimits,
      userOp.preVerificationGas,
      userOp.gasFees,
      validUntil,
      validAfter,
      block.chainid
    ));
    bytes32 signedHash = keccak256(abi.encode(intentHash, address(this)));
    bytes32 ethSignedHash = MessageHashUtils.toEthSignedMessageHash(signedHash);
    address recoveredSigner = ECDSA.recover(ethSignedHash, signature);

    if (recoveredSigner != verifyingSigner) {
      return ("", _packValidationData(true, validUntil, validAfter));
    }

    _usedHashes[userOpHash] = true;

    return (abi.encode(userOpHash, userOp.sender, uint256(0)), _packValidationData(false, validUntil, validAfter));
  }

  /// @notice Emits sponsorship details after a UserOperation is charged.
  /// @param mode The post-operation mode reported by the EntryPoint.
  /// @param context The context returned from validation.
  /// @param actualGasCost The actual gas cost charged to this paymaster.
  /// @param actualUserOpFeePerGas The effective UserOperation fee per gas.
  function _postOp(
    IPaymaster.PostOpMode mode,
    bytes calldata context,
    uint256 actualGasCost,
    uint256 actualUserOpFeePerGas
  ) internal override {
    (mode, actualUserOpFeePerGas);
    (bytes32 userOpHash, address sender, ) = abi.decode(context, (bytes32, address, uint256));

    emit UserOperationSponsored(userOpHash, sender, actualGasCost);
  }

  /// @notice Deposits ETH into the EntryPoint for this paymaster.
  function depositFunds() external payable onlyOwner {
    entryPoint.depositTo{value: msg.value}(address(this));
    emit FundsDeposited(msg.value);
  }

  /// @notice Withdraws ETH from this paymaster's EntryPoint deposit.
  /// @param to The recipient address.
  /// @param amount The amount of ETH to withdraw.
  function withdrawFunds(address payable to, uint256 amount) external onlyOwner {
    if (to == address(0)) {
      revert ZeroAddress();
    }

    entryPoint.withdrawTo(to, amount);
    emit FundsWithdrawn(to, amount);
  }

  /// @notice Updates the signer whose signatures authorize sponsorship.
  /// @param newSigner The replacement signer address.
  function updateSigner(address newSigner) external onlyOwner {
    if (newSigner == address(0)) {
      revert ZeroAddress();
    }

    address oldSigner = verifyingSigner;
    verifyingSigner = newSigner;

    emit SignerUpdated(oldSigner, newSigner);
  }
}
