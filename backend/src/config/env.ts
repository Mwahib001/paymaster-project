import dotenv from 'dotenv';
import type { Address, Hex } from 'viem';
import { z } from 'zod';

dotenv.config();

const booleanFromEnv = z.preprocess((value) => {
  if (typeof value !== 'string') {
    return value;
  }

  if (value.toLowerCase() === 'true') {
    return true;
  }

  if (value.toLowerCase() === 'false') {
    return false;
  }

  return value;
}, z.boolean());

const EnvSchema = z.object({
  PRIVATE_KEY: z
    .string()
    .startsWith('0x')
    .length(66)
    .transform((value) => value as Hex),
  RPC_URL: z.string().url(),
  PAYMASTER_ADDRESS: z.string().startsWith('0x').transform((value) => value as Address),
  ENTRYPOINT_ADDRESS: z.string().startsWith('0x').transform((value) => value as Address),
  CHAIN_ID: z.coerce.number().int().positive(),
  PORT: z.coerce.number().int().positive().default(3001),
  LOG_LEVEL: z.enum(['info', 'debug', 'warn', 'error']).default('info'),
  ALLOWLIST_ENABLED: booleanFromEnv.default(false),
  ALLOWED_ADDRESSES: z.string().default('')
});

const parsedEnv = EnvSchema.safeParse(process.env);

if (!parsedEnv.success) {
  console.error(parsedEnv.error);
  process.exit(1);
}

export const env = parsedEnv.data;
