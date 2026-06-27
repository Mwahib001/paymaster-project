import { Router } from 'express';
import {
  getPaymasterStatus,
  signPaymasterOperation,
  submitUserOperation
} from '../controllers/paymasterController.js';
import { walletLimiter } from '../middleware/rateLimiter.js';

export const paymasterRoutes = Router();

paymasterRoutes.post('/sign', walletLimiter, signPaymasterOperation);
paymasterRoutes.post('/submit', walletLimiter, submitUserOperation);
paymasterRoutes.get('/status', getPaymasterStatus);
