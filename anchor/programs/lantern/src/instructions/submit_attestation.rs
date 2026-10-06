use anchor_lang::prelude::*;
use anchor_lang::solana_program::{program::invoke_signed, sysvar};
use anchor_spl::token_2022::spl_token_2022::extension::scaled_ui_amount::instruction::update_multiplier;
use anchor_spl::token_interface::{Mint, TokenInterface};

use crate::errors::LanternError;
use crate::events::*;
use crate::report::*;
use crate::state::*;

/// Permissionless: whoever pays for the transaction (CRE, relayer, anyone)
/// is just a courier. Trust comes from the attestor signature checked here.
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
    let issuer_key = ctx.accounts.issuer_config.key();
    let config = &ctx.accounts.issuer_config;
    let prev = &ctx.accounts.attestation;
    let now = Clock::get()?.unix_timestamp;

    // Signature over the exact bytes, including program id and issuer (domain separation).
    let message = report.message(ctx.program_id, &issuer_key);
    verify_ed25519_ix(
        &ctx.accounts.instructions.to_account_info(),
        &config.attestor,
        &message,
    )?;
    require!(
        report.cluster_id == config.cluster_id,
        LanternError::DomainMismatch
    );

    // Replay and ordering.
    require!(report.nonce > prev.nonce, LanternError::NonceReplay);
    require!(
        report.observed_at > prev.observed_at,
        LanternError::TimestampRegression
    );
    require!(
        report.observed_at <= now + MAX_FUTURE_SKEW_SECS,
        LanternError::FutureTimestamp
    );

    // The backing rule is enforced here, not just trusted from the report.
    require!(
        report.max_supply == report.backed_max_supply()?,
        LanternError::MaxSupplyMismatch
    );

    // Corporate action: split factor changed since the last attestation.
    let split_changed = !same_split(
        prev.split_num,
        prev.split_den,
        report.split_num,
        report.split_den,
    );
    let (old_num, old_den) = (prev.split_num, prev.split_den);
    let mut ui_multiplier_updated = false;
    if split_changed && config.scaled_ui {
        let mint_key = ctx.accounts.mint.key();
        let ix = update_multiplier(
            &ctx.accounts.token_program.key(),
            &mint_key,
            &issuer_key,
            &[],
            report.split_num as f64 / report.split_den as f64,
            0, // effective immediately
        )?;
        invoke_signed(
            &ix,
            &[
                ctx.accounts.mint.to_account_info(),
                ctx.accounts.issuer_config.to_account_info(),
            ],
            &[&[ISSUER_SEED, mint_key.as_ref(), &[config.bump]]],
        )?;
        ui_multiplier_updated = true;
    }

    let attestation = &mut ctx.accounts.attestation;
    attestation.nonce = report.nonce;
    attestation.observed_at = report.observed_at;
    attestation.shares_held = report.shares_held;
    attestation.split_num = report.split_num;
    attestation.split_den = report.split_den;
    attestation.other_chain_supply = report.other_chain_supply;
    attestation.max_supply = report.max_supply;
    attestation.submitted_slot = Clock::get()?.slot;

    // S5: auto-pause on shortfall, auto-resume on recovery. Never touches admin_paused.
    let current_supply = ctx.accounts.mint.supply;
    let config = &mut ctx.accounts.issuer_config;
    let auto_paused = current_supply > report.max_supply;
    if auto_paused != config.auto_paused {
        config.auto_paused = auto_paused;
        emit!(PauseChanged {
            issuer: issuer_key,
            auto_paused,
            admin_paused: config.admin_paused,
        });
    }

    if split_changed {
        emit!(CorporateAction {
            issuer: issuer_key,
            old_split_num: old_num,
            old_split_den: old_den,
            new_split_num: report.split_num,
            new_split_den: report.split_den,
            ui_multiplier_updated,
        });
    }

    emit!(AttestationSubmitted {
        issuer: issuer_key,
        nonce: report.nonce,
        observed_at: report.observed_at,
        shares_held: report.shares_held,
        split_num: report.split_num,
        split_den: report.split_den,
        other_chain_supply: report.other_chain_supply,
        max_supply: report.max_supply,
        current_supply,
    });

    Ok(())
}
