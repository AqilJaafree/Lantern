/** Public Devnet / Sepolia addresses (see anchor/deployments/devnet.json). No secrets here. */
export const CLUSTER = "devnet" as const;

/** IssuerConfig.minter set to this (the default pubkey) means any wallet may mint. */
export const OPEN_MINTER = "11111111111111111111111111111111";

/** Browser RPC (wallet + mint). A different provider from the server's so they don't share a rate limit. */
export const SOLANA_RPC = process.env.NEXT_PUBLIC_SOLANA_RPC ?? "https://solana-devnet.api.onfinality.io/public";

/** Server-side RPC for /api routes. */
export const SOLANA_RPC_SERVER = process.env.SOLANA_RPC ?? "https://api.devnet.solana.com";

export const LANTERN = {
  programId: "CMo46d7niK6id7f8vUR25zQjKr77ykvKoukDeUEKCXuh",
  mint: "7yupUQoWo5R7T6tvk7dCVjN4vXB94vSmSUHWeG5b4zM9",
  issuerConfig: "Vsf7QBUfHQSqnQG1wzdxVakRqsnCqFsSDeeAgHAG3fP",
  attestation: "DSezDRJyG6ZChmcpaig7fRhWjr3ehyoRmPWgQ9FS74wf",
  creConfig: "9b5sZUa7pEBDQiA2TTP5nss6BHH9aUATw8vEMFPqAMgM",
  tokenProgram: "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb",
  symbol: "xAAPL",
  decimals: 6,
} as const;

/** Keystone Forwarder programs; a tx through either one came from CRE. */
export const FORWARDERS: Record<string, string> = {
  "7kuEAA3mSC1Tz8gQjnvH7bKFda9xSPRRin9SZbH49cNK": "CRE (simulation forwarder)",
  CXsKEJcs25TQEYU2e5jZ8QTPE3ffMLZhH6BWHrdcCCB5: "CRE (Keystone forwarder)",
};

export const SEPOLIA = {
  token: "0xb41e1D98421BbD79d6D094e48DE9BFE01393e54C",
  symbol: "mxAAPL",
  decimals: 18,
  rpc: "https://eth-sepolia.nownodes.io",
} as const;

/** Lantern mint gates on EVM chains (evm/src/LanternGate.sol). gate = null until deployed. */
export const EVM_GATES = [
  {
    name: "sepolia",
    label: "Ethereum Sepolia",
    chainId: 11155111,
    gate: "0xE1e7c742E976c76982cDB1702B62471F84769AB2" as `0x${string}` | null,
    via: "NOWNodes",
    publicRpc: "https://ethereum-sepolia-rpc.publicnode.com",
    explorer: "https://sepolia.etherscan.io",
  },
  {
    name: "robinhood",
    label: "Robinhood Chain Testnet",
    chainId: 46630,
    gate: (process.env.NEXT_PUBLIC_ROBINHOOD_GATE || null) as `0x${string}` | null,
    via: "Robinhood RPC",
    publicRpc: "https://rpc.testnet.chain.robinhood.com",
    explorer: "https://explorer.testnet.chain.robinhood.com",
  },
] as const;

export const explorerTx = (sig: string) => `https://explorer.solana.com/tx/${sig}?cluster=${CLUSTER}`;
export const explorerAddress = (addr: string) =>
  `https://explorer.solana.com/address/${addr}?cluster=${CLUSTER}`;
export const etherscanAddress = (addr: string) => `https://sepolia.etherscan.io/address/${addr}`;
