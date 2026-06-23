import {
  concat,
  encodeAbiParameters,
  encodePacked,
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

export function getUserOpHash(userOp: PackedUserOperation, chainId: number): Hex {
  const innerHash = keccak256(
    concat([
      pad(userOp.sender, { size: 32 }),
      pad(toHex(userOp.nonce), { size: 32 }),
      keccak256(userOp.initCode),
      keccak256(userOp.callData),
      userOp.accountGasLimits,
      pad(toHex(userOp.preVerificationGas), { size: 32 }),
      userOp.gasFees,
      keccak256(userOp.paymasterAndData)
    ])
  );

  return keccak256(
    encodePacked(
      ['bytes32', 'address', 'uint256'],
      [innerHash, env.ENTRYPOINT_ADDRESS as Address, BigInt(chainId)]
    )
  );
}

export function buildSignedHash(
  userOpHash: Hex,
  paymasterAddress: Address,
  validUntil: number,
  validAfter: number,
  chainId: number
): Hex {
  const hash = keccak256(
    encodeAbiParameters(
      [
        { type: 'bytes32' },
        { type: 'address' },
        { type: 'uint48' },
        { type: 'uint48' },
        { type: 'uint256' }
      ],
      [userOpHash, paymasterAddress, validUntil, validAfter, BigInt(chainId)]
    )
  );

  return keccak256(concat([toHex('\x19Ethereum Signed Message:\n32'), hash]));
}

export async function signHash(hash: Hex): Promise<Hex> {
  return walletClient.signMessage({ message: { raw: toBytes(hash) } });
}

export function buildPaymasterAndData(
  paymasterAddress: Address,
  validUntil: number,
  validAfter: number,
  signature: Hex
): Hex {
  return concat([
    paymasterAddress,
    toHex(validUntil, { size: 6 }),
    toHex(validAfter, { size: 6 }),
    signature
  ]);
}
