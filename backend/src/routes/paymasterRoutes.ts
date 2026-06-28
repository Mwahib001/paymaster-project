import { Router } from 'express';
import {
  getPaymasterStatus,
  signPaymasterOperation,
  submitUserOperation,
  computeUserOpHash
} from '../controllers/paymasterController.js';
import { walletLimiter } from '../middleware/rateLimiter.js';

export const paymasterRoutes = Router();

paymasterRoutes.post('/sign', walletLimiter, signPaymasterOperation);
paymasterRoutes.post('/submit', walletLimiter, submitUserOperation);
paymasterRoutes.post('/compute-hash', computeUserOpHash);
paymasterRoutes.get('/status', getPaymasterStatus);
