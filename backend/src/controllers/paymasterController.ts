import type { RequestHandler } from 'express';
import { z } from 'zod';
import { env } from '../config/env.js';
import { signerAddress } from '../config/viemClients.js';
import { AppError, ErrorCode } from '../middleware/errorHandler.js';
import {
  buildPaymasterAndData,
  buildSignedHash,
  getUserOpHash,
  signHash
} from '../services/signerService.js';
import { validateUserOperation } from '../services/validationService.js';
import {
  PackedUserOperationSchema,
  type SignResponse,
  type StatusResponse
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

    const userOpHash = getUserOpHash(userOp, env.CHAIN_ID);
    const signedHash = buildSignedHash(
      userOpHash,
      env.PAYMASTER_ADDRESS,
      validUntil,
      validAfter,
      env.CHAIN_ID
    );
    const signature = await signHash(signedHash);
    const paymasterAndData = buildPaymasterAndData(
      env.PAYMASTER_ADDRESS,
      validUntil,
      validAfter,
      signature
    );

    const response: SignResponse = {
      paymasterAndData,
      validUntil,
      validAfter,
      signer: signerAddress
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
