import { ethers } from "ethers";
import type { Config } from "./config";

const ERC20_ABI = [
  "function balanceOf(address) view returns (uint256)",
  "function decimals() view returns (uint8)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function approve(address spender, uint256 amount) returns (bool)",
];

const ONRAMP_ABI = [
  "function wrap(uint256 amount)",
];

const CTF_ABI = [
  "function isApprovedForAll(address owner, address operator) view returns (bool)",
  "function setApprovalForAll(address operator, bool approved)",
];

export function provider(config: Config): ethers.JsonRpcProvider {
  return new ethers.JsonRpcProvider(config.polygonRpc, config.chainId);
}

export interface BalanceSnapshot {
  matic: string;
  usdcE: string;
  pUsd: string;
  raw: { matic: bigint; usdcE: bigint; pUsd: bigint };
}

export async function readBalances(
  config: Config,
  address: string,
): Promise<BalanceSnapshot> {
  const p = provider(config);
  const usdc = new ethers.Contract(config.contracts.usdcE, ERC20_ABI, p);
  const pusd = new ethers.Contract(config.contracts.pUsd, ERC20_ABI, p);
  const [matic, usdcRaw, pUsdRaw] = await Promise.all([
    p.getBalance(address),
    usdc.balanceOf!(address) as Promise<bigint>,
    pusd.balanceOf!(address) as Promise<bigint>,
  ]);
  return {
    matic: ethers.formatEther(matic),
    usdcE: ethers.formatUnits(usdcRaw, 6),
    pUsd: ethers.formatUnits(pUsdRaw, 6),
    raw: { matic, usdcE: usdcRaw, pUsd: pUsdRaw },
  };
}

export async function pUsdAllowance(
  config: Config,
  owner: string,
): Promise<bigint> {
  const p = provider(config);
  const pusd = new ethers.Contract(config.contracts.pUsd, ERC20_ABI, p);
  return (await pusd.allowance!(owner, config.contracts.ctfExchange)) as bigint;
}

export async function ctfApprovedForAll(
  config: Config,
  owner: string,
): Promise<boolean> {
  const p = provider(config);
  const ctf = new ethers.Contract(config.contracts.conditionalTokens, CTF_ABI, p);
  return (await ctf.isApprovedForAll!(
    owner,
    config.contracts.ctfExchange,
  )) as boolean;
}

export async function ensureUsdcAllowanceForOnramp(
  config: Config,
  signer: ethers.Wallet,
  amount: bigint,
): Promise<ethers.TransactionReceipt | null> {
  const p = provider(config);
  const owner = await signer.getAddress();
  const usdc = new ethers.Contract(
    config.contracts.usdcE,
    ERC20_ABI,
    signer.connect(p),
  );
  const current = (await usdc.allowance!(owner, config.contracts.onramp)) as bigint;
  if (current >= amount) return null;
  const tx = await usdc.approve!(config.contracts.onramp, ethers.MaxUint256);
  return tx.wait();
}

export async function wrapUsdcToPusd(
  config: Config,
  signer: ethers.Wallet,
  amount6dp: bigint,
): Promise<ethers.TransactionReceipt> {
  const p = provider(config);
  const onramp = new ethers.Contract(
    config.contracts.onramp,
    ONRAMP_ABI,
    signer.connect(p),
  );
  const tx = await onramp.wrap!(amount6dp);
  return tx.wait();
}

export async function approveExchangeForPusd(
  config: Config,
  signer: ethers.Wallet,
): Promise<ethers.TransactionReceipt> {
  const p = provider(config);
  const pusd = new ethers.Contract(
    config.contracts.pUsd,
    ERC20_ABI,
    signer.connect(p),
  );
  const tx = await pusd.approve!(config.contracts.ctfExchange, ethers.MaxUint256);
  return tx.wait();
}

export async function approveCtfForExchange(
  config: Config,
  signer: ethers.Wallet,
): Promise<ethers.TransactionReceipt> {
  const p = provider(config);
  const ctf = new ethers.Contract(
    config.contracts.conditionalTokens,
    CTF_ABI,
    signer.connect(p),
  );
  const tx = await ctf.setApprovalForAll!(config.contracts.ctfExchange, true);
  return tx.wait();
}

/** Parse a 6-decimal stablecoin amount (USDC.e and pUSD both use 6dp). */
export function parseSixDecimal(amount: number | string): bigint {
  return ethers.parseUnits(String(amount), 6);
}
