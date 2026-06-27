import type { Address, Hex } from 'viem';
import { z } from 'zod';

const HexSchema = z.string().regex(/^0x[0-9a-fA-F]*$/);
const BigIntStringSchema = z.string().transform((value, ctx) => {
  try {
    return BigInt(value);
  } catch {
    ctx.addIssue({
      code: 'custom',
      message: 'Expected a bigint-compatible string'
    });

    return z.NEVER;
  }
});

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

export const PackedUserOperationSchema = z.object({
  sender: HexSchema.transform((value) => value as Address),
  nonce: BigIntStringSchema,
  initCode: HexSchema.transform((value) => value as Hex),
  callData: HexSchema.transform((value) => value as Hex),
  accountGasLimits: HexSchema.transform((value) => value as Hex),
  preVerificationGas: BigIntStringSchema,
  gasFees: HexSchema.transform((value) => value as Hex),
  paymasterAndData: HexSchema.transform((value) => value as Hex),
  signature: HexSchema.transform((value) => value as Hex)
});

export type SignResponse = {
  paymasterAndData: Hex;
  validUntil: number;
  validAfter: number;
  signer: Address;
  userOpHash: Hex; // Hash of the UserOp with paymasterAndData filled (for account signature)
};

export type StatusResponse = {
  signer: Address;
  chainId: number;
  paymasterAddress: Address;
  healthy: boolean;
};

export type SubmitResponse = {
  userOpHash: Hex;
  success: boolean;
};
