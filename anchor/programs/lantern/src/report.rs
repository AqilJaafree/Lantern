use anchor_lang::prelude::*;
use anchor_lang::solana_program::sysvar::instructions::{
    load_current_index_checked, load_instruction_at_checked,
};

use crate::errors::LanternError;

/// Prefix of every signed report, so the attestor key can't be tricked into
/// signing something that parses as a report.
/// Native Ed25519 signature verification program.
pub const ED25519_PROGRAM_ID: Pubkey = pubkey!("Ed25519SigVerify111111111111111111111111111");

pub const REPORT_DOMAIN: &[u8; 16] = b"LANTERN_ATTEST01";

/// Signed payload produced by the CRE workflow.
///
/// Signed bytes (little-endian, fixed layout, `MESSAGE_LEN` bytes):
/// `REPORT_DOMAIN | program_id | issuer_config | cluster_id | nonce | observed_at |
///  shares_held | split_num | split_den | other_chain_supply | max_supply`
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Debug, PartialEq, Eq)]
pub struct AttestationReport {
    pub cluster_id: u8,
    pub nonce: u64,
    pub observed_at: i64,
    /// Custodian holdings in micro-shares.
    pub shares_held: u64,
    /// Cumulative split factor since token launch (2/1 after a 2-for-1 split).
    pub split_num: u32,
    pub split_den: u32,
    /// Supply on all non-Solana chains, normalized to 6 decimals, rounded up.
    pub other_chain_supply: u64,
    pub max_supply: u64,
}

impl AttestationReport {
    pub const MESSAGE_LEN: usize = 16 + 32 + 32 + 1 + 8 + 8 + 8 + 4 + 4 + 8 + 8;

    pub fn message(&self, program_id: &Pubkey, issuer: &Pubkey) -> Vec<u8> {
        let mut m = Vec::with_capacity(Self::MESSAGE_LEN);
        m.extend_from_slice(REPORT_DOMAIN);
        m.extend_from_slice(program_id.as_ref());
        m.extend_from_slice(issuer.as_ref());
        m.push(self.cluster_id);
        m.extend_from_slice(&self.nonce.to_le_bytes());
        m.extend_from_slice(&self.observed_at.to_le_bytes());
        m.extend_from_slice(&self.shares_held.to_le_bytes());
        m.extend_from_slice(&self.split_num.to_le_bytes());
        m.extend_from_slice(&self.split_den.to_le_bytes());
        m.extend_from_slice(&self.other_chain_supply.to_le_bytes());
        m.extend_from_slice(&self.max_supply.to_le_bytes());
        m
    }

    /// Backing rule: floor(shares_held × split_den / split_num) − other_chain_supply,
    /// floored at zero.
    pub fn backed_max_supply(&self) -> Result<u64> {
        require!(
            self.split_num > 0 && self.split_den > 0,
            LanternError::InvalidSplitFactor
        );
        let backed = (self.shares_held as u128)
            .checked_mul(self.split_den as u128)
            .ok_or(LanternError::Overflow)?
            / self.split_num as u128;
        let cap = backed.saturating_sub(self.other_chain_supply as u128);
        u64::try_from(cap).map_err(|_| error!(LanternError::Overflow))
    }
}

/// Same ratio, compared without division.
pub fn same_split(a_num: u32, a_den: u32, b_num: u32, b_den: u32) -> bool {
    (a_num as u64) * (b_den as u64) == (b_num as u64) * (a_den as u64)
}

/// Requires that the instruction immediately before this one is a native
/// Ed25519 signature check of exactly `message` by `signer`. The Ed25519
/// program aborts the whole transaction if the signature is invalid, so
/// finding the instruction is enough.
pub fn verify_ed25519_ix(ix_sysvar: &AccountInfo, signer: &Pubkey, message: &[u8]) -> Result<()> {
    let current = load_current_index_checked(ix_sysvar)? as usize;
    require!(current > 0, LanternError::InvalidSignature);
    let ix = load_instruction_at_checked(current - 1, ix_sysvar)?;

    require_keys_eq!(
        ix.program_id,
        ED25519_PROGRAM_ID,
        LanternError::InvalidSignature
    );
    require!(ix.accounts.is_empty(), LanternError::InvalidSignature);

    // Layout: [num_signatures u8, padding u8, Ed25519SignatureOffsets (7 × u16), ...data]
    let d = &ix.data;
    require!(d.len() >= 16 && d[0] == 1, LanternError::InvalidSignature);
    let read = |i: usize| u16::from_le_bytes([d[i], d[i + 1]]);

    let sig_offset = read(2) as usize;
    let sig_ix = read(4);
    let pk_offset = read(6) as usize;
    let pk_ix = read(8);
    let msg_offset = read(10) as usize;
    let msg_size = read(12) as usize;
    let msg_ix = read(14);

    // All data must live inside the Ed25519 instruction itself.
    require!(
        sig_ix == u16::MAX && pk_ix == u16::MAX && msg_ix == u16::MAX,
        LanternError::InvalidSignature
    );
    require!(
        d.get(sig_offset..sig_offset + 64).is_some(),
        LanternError::InvalidSignature
    );
    let pk = d
        .get(pk_offset..pk_offset + 32)
        .ok_or(LanternError::InvalidSignature)?;
    let msg = d
        .get(msg_offset..msg_offset + msg_size)
        .ok_or(LanternError::InvalidSignature)?;

    require!(pk == signer.as_ref(), LanternError::InvalidSignature);
    require!(msg == message, LanternError::InvalidSignature);
    Ok(())
}
