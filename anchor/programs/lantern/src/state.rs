use anchor_lang::prelude::*;

pub const ISSUER_SEED: &[u8] = b"issuer";
pub const ATTESTATION_SEED: &[u8] = b"attestation";
pub const CRE_CONFIG_SEED: &[u8] = b"cre";

/// Custodian holdings are reported in micro-shares (1 share = 1_000_000),
/// so the token must use 6 decimals for raw units to line up 1:1 pre-split.
pub const TOKEN_DECIMALS: u8 = 6;

/// How far an attestation's `observed_at` may run ahead of the cluster clock.
/// Devnet's clock can lag wall time, so this is looser than the 30s in the PRD.
pub const MAX_FUTURE_SKEW_SECS: i64 = 60;

/// Issuer configuration. Its PDA is also the token's mint authority,
/// freeze authority (or none), and Scaled UI multiplier authority.
#[account]
#[derive(InitSpace)]
pub struct IssuerConfig {
    pub admin: Pubkey,
    pub minter: Pubkey,
    /// Ed25519 key whose signature every attestation report must carry.
    pub attestor: Pubkey,
    pub mint: Pubkey,
    pub staleness_secs: u32,
    /// Identifies the cluster a report is meant for (domain separation).
    pub cluster_id: u8,
    /// Set by attestations: supply exceeded backing. Cleared only by attestations.
    pub auto_paused: bool,
    /// Set by the admin. Never touched by attestations.
    pub admin_paused: bool,
    /// The mint has the Token-2022 Scaled UI Amount extension controlled by this PDA.
    pub scaled_ui: bool,
    pub bump: u8,
}

/// Single latest attestation for an issuer.
#[account]
#[derive(InitSpace)]
pub struct Attestation {
    pub issuer: Pubkey,
    pub nonce: u64,
    pub observed_at: i64,
    pub shares_held: u64,
    pub split_num: u32,
    pub split_den: u32,
    pub other_chain_supply: u64,
    pub max_supply: u64,
    pub submitted_slot: u64,
    pub bump: u8,
}

/// Which CRE workflow may deliver reports through the Keystone Forwarder
/// (`on_report`). Separate PDA so existing issuers need no migration.
#[account]
#[derive(InitSpace)]
pub struct CreConfig {
    pub issuer: Pubkey,
    pub forwarder_program: Pubkey,
    pub forwarder_state: Pubkey,
    /// CRE workflow owner (EVM address), from report metadata bytes 42..62.
    pub workflow_owner: [u8; 20],
    /// CRE workflow name, from report metadata bytes 32..42.
    pub workflow_name: [u8; 10],
    pub bump: u8,
}
