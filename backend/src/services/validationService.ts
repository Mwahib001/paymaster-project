import { env } from '../config/env.js';
import { AppError, ErrorCode } from '../middleware/errorHandler.js';
import type { PackedUserOperation } from '../types/userOperation.js';

const allowedAddresses = new Set(
  env.ALLOWED_ADDRESSES.split(',')
    .map((address) => address.toLowerCase().trim())
    .filter(Boolean)
);

export function validateUserOperation(
  userOp: PackedUserOperation,
  validUntil: number,
  validAfter: number
): void {
  const now = Math.floor(Date.now() / 1000);

  if (validAfter > now || validUntil < now + 30 || validUntil > now + 300) {
    throw new AppError(
      400,
      ErrorCode.InvalidTimeRange,
      'validAfter must be current or earlier, and validUntil must be between 30 and 300 seconds from now'
    );
  }

  const callDataSizeBytes = userOp.callData.length / 2 - 1;

  if (callDataSizeBytes > 10240) {
    throw new AppError(400, ErrorCode.CallDataTooLarge, 'callData exceeds 10240 bytes');
  }

  if (env.ALLOWLIST_ENABLED && !allowedAddresses.has(userOp.sender.toLowerCase())) {
    throw new AppError(403, ErrorCode.SenderNotAllowlisted, 'sender is not allowlisted');
  }
}
