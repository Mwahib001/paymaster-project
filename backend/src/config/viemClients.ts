import { createPublicClient, createWalletClient, http } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { env } from './env.js';

const localChain = {
  id: env.CHAIN_ID,
  name: `Chain ${env.CHAIN_ID}`,
  nativeCurrency: {
    name: 'Ether',
    symbol: 'ETH',
    decimals: 18
  },
  rpcUrls: {
    default: {
      http: [env.RPC_URL]
    }
  }
} as const;

const account = privateKeyToAccount(env.PRIVATE_KEY);

export const publicClient = createPublicClient({
  chain: localChain,
  transport: http(env.RPC_URL)
});

export const walletClient = createWalletClient({
  account,
  chain: localChain,
  transport: http(env.RPC_URL)
});

export const signerAddress = account.address;
