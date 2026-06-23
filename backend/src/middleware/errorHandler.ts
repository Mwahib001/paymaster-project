import type { ErrorRequestHandler } from 'express';
import { logger } from '../utils/logger.js';

export enum ErrorCode {
  InvalidRequest = 'INVALID_REQUEST',
  InvalidTimeRange = 'INVALID_TIME_RANGE',
  CallDataTooLarge = 'CALL_DATA_TOO_LARGE',
  SenderNotAllowlisted = 'SENDER_NOT_ALLOWLISTED',
  SigningFailed = 'SIGNING_FAILED',
  InternalError = 'INTERNAL_ERROR'
}

export class AppError extends Error {
  public readonly statusCode: number;
  public readonly errorCode: ErrorCode;
  public readonly requestId?: string;

  public constructor(
    statusCode: number,
    errorCode: ErrorCode,
    message: string,
    requestId?: string
  ) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.errorCode = errorCode;
    this.requestId = requestId;
  }
}

export const errorHandler: ErrorRequestHandler = (error, req, res, _next) => {
  const requestId = error instanceof AppError ? error.requestId ?? req.requestId : req.requestId;
  const appError =
    error instanceof AppError
      ? error
      : new AppError(500, ErrorCode.InternalError, 'Internal server error', requestId);

  logger.error('Request failed', {
    requestId,
    code: appError.errorCode,
    message: appError.message,
    stack: error instanceof Error ? error.stack : undefined
  });

  res.status(appError.statusCode).json({
    error: {
      code: appError.errorCode,
      message: appError.message,
      requestId
    }
  });
};
