use anchor_lang::prelude::*;
use anchor_lang::solana_program::sysvar;
use anchor_spl::token_interface::{Mint, TokenInterface};

use crate::instructions::apply_report::apply_report;
use crate::report::*;
use crate::state::*;

/// Relayer path. Permissionless: whoever pays for the transaction is just a
/// courier. Trust comes from the attestor's Ed25519 signature checked here.
#[derive(Accounts)]
pub struct SubmitAttestation<'info> {
    #[account(
        mut,
        seeds = [ISSUER_SEED, mint.key().as_ref()],
        bump = issuer_config.bump,
        has_one = mint,
    )]
    pub issuer_config: Account<'info, IssuerConfig>,

    #[account(
        mut,
        seeds = [ATTESTATION_SEED, issuer_config.key().as_ref()],
        bump = attestation.bump,
    )]
    pub attestation: Account<'info, Attestation>,

    /// Writable so a corporate action can update the Scaled UI multiplier.
    #[account(mut, mint::token_program = token_program)]
    pub mint: InterfaceAccount<'info, Mint>,

    /// CHECK: address-constrained to the instructions sysvar.
    #[account(address = sysvar::instructions::ID)]
    pub instructions: UncheckedAccount<'info>,

    pub token_program: Interface<'info, TokenInterface>,
}

pub fn handler(ctx: Context<SubmitAttestation>, report: AttestationReport) -> Result<()> {
    // Signature over the exact bytes, including program id and issuer (domain separation).
    let message = report.message(ctx.program_id, &ctx.accounts.issuer_config.key());
    verify_ed25519_ix(
        &ctx.accounts.instructions.to_account_info(),
        &ctx.accounts.issuer_config.attestor,
        &message,
    )?;

    let a = ctx.accounts;
    apply_report(
        &mut a.issuer_config,
        &mut a.attestation,
        &a.mint,
        &a.token_program,
        &report,
    )
}
