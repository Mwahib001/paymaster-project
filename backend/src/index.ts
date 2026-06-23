import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import { env } from './config/env.js';
import { errorHandler } from './middleware/errorHandler.js';
import { globalLimiter } from './middleware/rateLimiter.js';
import { requestLogger } from './middleware/requestLogger.js';
import { paymasterRoutes } from './routes/paymasterRoutes.js';
import { logger } from './utils/logger.js';

const app = express();

app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(requestLogger);
app.use(globalLimiter);
app.use('/api/v1/paymaster', paymasterRoutes);
app.use(errorHandler);

app.listen(env.PORT, () => {
  logger.info('Paymaster backend started', {
    port: env.PORT,
    chainId: env.CHAIN_ID,
    paymasterAddress: env.PAYMASTER_ADDRESS,
    signer: 'configured'
  });
});
