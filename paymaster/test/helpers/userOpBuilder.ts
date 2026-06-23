import type { Address, Hex } from "viem";

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
