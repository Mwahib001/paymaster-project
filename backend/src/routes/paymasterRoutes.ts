import { Router } from 'express';
import {
  getPaymasterStatus,
  signPaymasterOperation
} from '../controllers/paymasterController.js';
import { walletLimiter } from '../middleware/rateLimiter.js';

export const paymasterRoutes = Router();

paymasterRoutes.post('/sign', walletLimiter, signPaymasterOperation);
paymasterRoutes.get('/status', getPaymasterStatus);
