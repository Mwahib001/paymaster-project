import { randomUUID } from 'node:crypto';
import type { RequestHandler } from 'express';
import { logger } from '../utils/logger.js';

export const requestLogger: RequestHandler = (req, res, next) => {
  const requestId = randomUUID();
  const startTime = Date.now();

  req.requestId = requestId;
  res.setHeader('X-Request-Id', requestId);

  logger.info('Request received', {
    method: req.method,
    url: req.originalUrl,
    requestId,
    ip: req.ip
  });

  res.on('finish', () => {
    logger.info('Request completed', {
      statusCode: res.statusCode,
      durationMs: Date.now() - startTime,
      requestId
    });
  });

  next();
};
