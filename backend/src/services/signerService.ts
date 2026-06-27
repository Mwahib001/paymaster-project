import {
  concat,
  encodeAbiParameters,
  keccak256,
  pad,
  toBytes,
  toHex,
  type Address,
  type Hex
} from 'viem';
import { env } from '../config/env.js';
import { walletClient } from '../config/viemClients.js';
import type { PackedUserOperation } from '../types/userOperation.js';

// NOTE: This computes the canonical ERC-4337 v0.7+ userOpHash (matches EntryPoint.getUserOpHash).
// Use this for the *account* signature (after paymasterAndData is finalized).
// Gotcha: must be computed on the final UserOp (pmAndData with real sig) for the account sig.
export function getUserOpHash(userOp: PackedUserOperation, chainId: number): Hex {
  const innerHash = keccak256(
    encodeAbiParameters(
      [
        { type: 'address' },
        { type: 'uint256' },
        { type: 'bytes32' },
        { type: 'bytes32' },
        { type: 'bytes32' },
        { type: 'uint256' },
        { type: 'bytes32' },
        { type: 'bytes32' },
      ],
      [
        userOp.sender,
        userOp.nonce,
        keccak256(userOp.initCode),
        keccak256(userOp.callData),
        userOp.accountGasLimits,
        userOp.preVerificationGas,
        userOp.gasFees,
        keccak256(userOp.paymasterAndData),
      ]
    )
  );

  return keccak256(
    encodeAbiParameters(
      [{ type: 'bytes32' }, { type: 'address' }, { type: 'uint256' }],
      [innerHash, env.ENTRYPOINT_ADDRESS as Address, BigInt(chainId)]
    )
  );
}

// Sponsorship digest for the *paymaster* off-chain signature.
// Matches VerifyingPaymaster._validatePaymasterUserOp intentHash + wrapping.
// Critically independent of paymasterAndData contents (avoids circularity with the sig itself).
export function buildSponsorshipDigest(
  userOp: PackedUserOperation,
  paymasterAddress: Address,
  validUntil: number,
  validAfter: number,
  chainId: number
): Hex {
  const intentHash = keccak256(
    encodeAbiParameters(
      [
        { type: 'address' },
        { type: 'uint256' },
        { type: 'bytes32' },
        { type: 'bytes32' },
        { type: 'uint256' },
        { type: 'bytes32' },
        { type: 'uint48' },
        { type: 'uint48' },
        { type: 'uint256' },
      ],
      [
        userOp.sender,
        userOp.nonce,
        keccak256(userOp.callData),
        userOp.accountGasLimits,
        userOp.preVerificationGas,
        userOp.gasFees,
        validUntil,
        validAfter,
        BigInt(chainId),
      ]
    )
  );

  // Contract does: signedHash = keccak( abi.encode(intentHash, paymaster) )
  // then toEthSignedMessageHash(signedHash) before recover.
  return keccak256(
    encodeAbiParameters(
      [{ type: 'bytes32' }, { type: 'address' }],
      [intentHash, paymasterAddress]
    )
  );
}

export async function signHash(hash: Hex): Promise<Hex> {
  // Gotcha: passing { raw: <the 32-byte 'signedHash' from contract> } + viem produces a sig
  // that recovers correctly under MessageHashUtils.toEthSignedMessageHash(hash) in Solidity.
  return walletClient.signMessage({ message: { raw: toBytes(hash) } });
}

export function buildPaymasterAndData(
  paymasterAddress: Address,
  validUntil: number,
  validAfter: number,
  signature: Hex
): Hex {
  // Standard ERC-4337 v0.7+ layout for paymasterAndData:
  // pm (20) + pmVerificationGas(16) + pmPostOpGas(16) + validUntil(6) + validAfter(6) + sig
  // Use positive values so the EntryPoint accepts the paymaster in prepayment/gas calc.
  const pmGas = concat([
    pad(toHex(200000n), { size: 16 }),
    pad(toHex(100000n), { size: 16 }),
  ]);
  return concat([
    paymasterAddress,
    pmGas,
    toHex(validUntil, { size: 6 }),
    toHex(validAfter, { size: 6 }),
    signature
  ]);
}
