import { concatHex, pad, toHex, type Address, type Hex } from "viem";

export type PackedUserOperation = {
  sender: Address;
  nonce: bigint;
  initCode: Hex;
  callData: Hex;
  accountGasLimits: Hex;
  preVerificationGas: bigint;
  gasFees: Hex;
  paymasterAndData: Hex;
  signature: Hex;
};

const EMPTY_BYTES = "0x";
const PACKED_ZERO = "0x0000000000000000000000000000000000000000000000000000000000000000";

export function buildUserOp(
  sender: Address,
  nonce: bigint,
  callData: Hex,
  overrides: Partial<PackedUserOperation> = {},
): PackedUserOperation {
  return {
    sender,
    nonce,
    initCode: EMPTY_BYTES,
    callData,
    accountGasLimits: PACKED_ZERO,
    preVerificationGas: 0n,
    gasFees: PACKED_ZERO,
    paymasterAndData: EMPTY_BYTES,
    signature: EMPTY_BYTES,
    ...overrides,
  };
}

export const DUMMY_PAYMASTER_SIGNATURE: Hex = `0x${"00".repeat(65)}`;

export function packUint128Pair(left: bigint, right: bigint): Hex {
  return concatHex([
    pad(toHex(left), { size: 16 }),
    pad(toHex(right), { size: 16 }),
  ]);
}

export const SIG_VALIDATION_SUCCESS = 0n;
export const SIG_VALIDATION_FAILED = 1n;
