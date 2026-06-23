import { ipKeyGenerator, rateLimit } from 'express-rate-limit';

export const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false
});

export const walletLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    const sender = req.body?.userOp?.sender;

    if (typeof sender === 'string') {
      return sender.toLowerCase();
    }

    return ipKeyGenerator(req.ip ?? '');
  }
});
