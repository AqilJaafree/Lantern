export type VaultEventKind = "drain" | "topup" | "split" | "reset" | "attest" | "mint-ok" | "mint-fail";

export interface VaultEvent {
  kind: VaultEventKind;
}

/** One orbit ring of tokens: a chain where the token circulates. */
export interface ChainRing {
  key: string;
  label: string;
  /** CSS hex color. */
  color: string;
  /** Token supply on this chain, in whole tokens. */
  supply: number;
  gated: boolean;
}

/** What the scene should converge to. Everything here comes from live state. */
export interface VaultTarget {
  /** Gold bars to stack (custodian shares / unit). */
  bars: number;
  /** backed / outstanding; 1 = fully backed. */
  ratio: number;
  /** Onchain: minting is allowed right now. */
  gateOpen: boolean;
  chains: ChainRing[];
}
