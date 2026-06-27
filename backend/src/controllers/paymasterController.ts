import type { RequestHandler } from 'express';
import { z } from 'zod';
import { env } from '../config/env.js';
import { signerAddress, walletClient } from '../config/viemClients.js';
import { AppError, ErrorCode } from '../middleware/errorHandler.js';
import {
  buildPaymasterAndData,
  buildSponsorshipDigest,
  getUserOpHash,
  signHash
} from '../services/signerService.js';
import { validateUserOperation } from '../services/validationService.js';
import {
  PackedUserOperationSchema,
  type SignResponse,
  type StatusResponse,
  type SubmitResponse
} from '../types/userOperation.js';

const SignRequestSchema = z.object({
  userOp: PackedUserOperationSchema,
  validUntil: z.coerce.number().int().optional(),
  validAfter: z.coerce.number().int().optional()
});

export const signPaymasterOperation: RequestHandler = async (req, res, next) => {
  try {
    const parsed = SignRequestSchema.safeParse(req.body);

    if (!parsed.success) {
      throw new AppError(400, ErrorCode.InvalidRequest, parsed.error.message, req.requestId);
    }

    const now = Math.floor(Date.now() / 1000);
    const validAfter = parsed.data.validAfter ?? now;
    const validUntil = parsed.data.validUntil ?? now + 300;
    const { userOp } = parsed.data;

    validateUserOperation(userOp, validUntil, validAfter);

    // Sponsorship uses stable intent (ignores current paymasterAndData in userOp).
    // Client should insert the returned paymasterAndData (with real sig) into the UserOp
    // before computing the *final* userOpHash for the account's own signature.
    const sponsorshipDigest = buildSponsorshipDigest(
      userOp,
      env.PAYMASTER_ADDRESS,
      validUntil,
      validAfter,
      env.CHAIN_ID
    );
    const signature = await signHash(sponsorshipDigest);
    const paymasterAndData = buildPaymasterAndData(
      env.PAYMASTER_ADDRESS,
      validUntil,
      validAfter,
      signature
    );

    // Return the userOpHash computed with this exact paymasterAndData.
    // Client uses this for the smart account's signature (last step before sending to bundler).
    // Gotcha: account signature must be over the hash of the *final* UserOp.
    const userOpForHash = { ...userOp, paymasterAndData };
    const userOpHash = getUserOpHash(userOpForHash, env.CHAIN_ID);

    const response: SignResponse = {
      paymasterAndData,
      validUntil,
      validAfter,
      signer: signerAddress,
      userOpHash,
    };

    res.status(200).json(response);
  } catch (error) {
    if (error instanceof AppError) {
      next(error);
      return;
    }

    next(new AppError(500, ErrorCode.SigningFailed, 'Failed to sign user operation', req.requestId));
  }
};

export const getPaymasterStatus: RequestHandler = (_req, res) => {
  try {
    const response: StatusResponse = {
      signer: signerAddress,
      chainId: env.CHAIN_ID,
      paymasterAddress: env.PAYMASTER_ADDRESS,
      healthy: true
    };

    res.status(200).json(response);
  } catch {
    res.status(200).json({
      signer: signerAddress,
      chainId: env.CHAIN_ID,
      paymasterAddress: env.PAYMASTER_ADDRESS,
      healthy: false
    } satisfies StatusResponse);
  }
};

export const submitUserOperation: RequestHandler = async (req, res, next) => {
  try {
    const { userOp, beneficiary } = req.body as { userOp: any; beneficiary?: string };

    // Normalize strings to bigint where needed (frontend sends strings)
    const normalizedUserOp = {
      ...userOp,
      nonce: BigInt(userOp.nonce),
      preVerificationGas: BigInt(userOp.preVerificationGas),
    };

    const userOpHash = getUserOpHash(normalizedUserOp, env.CHAIN_ID);

    // Real submission path: act as bundler and call EntryPoint.handleOps
    // The backend wallet (funded in local/dev) pays the L1/L2 tx gas.
    // pm must have sufficient deposit; the op must be fully signed (account + paymaster).
    const beneficiaryAddress = (beneficiary || signerAddress) as `0x${string}`;

    // Minimal ABI for handleOps (PackedUserOperation[] , address)
    const entryPointAbi = [
      {
        name: 'handleOps',
        type: 'function',
        stateMutability: 'nonpayable',
        inputs: [
          {
            name: 'ops',
            type: 'tuple[]',
            components: [
              { name: 'sender', type: 'address' },
              { name: 'nonce', type: 'uint256' },
              { name: 'initCode', type: 'bytes' },
              { name: 'callData', type: 'bytes' },
              { name: 'accountGasLimits', type: 'bytes32' },
              { name: 'preVerificationGas', type: 'uint256' },
              { name: 'gasFees', type: 'bytes32' },
              { name: 'paymasterAndData', type: 'bytes' },
              { name: 'signature', type: 'bytes' },
            ],
          },
          { name: 'beneficiary', type: 'address' },
        ],
        outputs: [],
      },
    ] as const;

    const txHash = await walletClient.writeContract({
      address: env.ENTRYPOINT_ADDRESS,
      abi: entryPointAbi,
      functionName: 'handleOps',
      args: [[normalizedUserOp], beneficiaryAddress],
    });

    const response: SubmitResponse = {
      userOpHash,
      success: true,
    };

    // In real bundler this would be the userOpHash; here we did the bundler work directly.
    res.status(200).json({ ...response, txHash });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'submit failed';
    next(new AppError(500, ErrorCode.InternalError, `submit failed: ${message}`, req.requestId));
  }
};
