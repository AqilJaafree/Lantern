use anchor_lang::prelude::*;
use anchor_lang::solana_program::program::invoke_signed;
use anchor_spl::token_2022::spl_token_2022::extension::scaled_ui_amount::instruction::update_multiplier;
use anchor_spl::token_interface::{Mint, TokenInterface};

use crate::errors::LanternError;
use crate::events::*;
use crate::report::*;
use crate::state::*;

/// Validate an authenticated report and apply it. Shared by both delivery
/// paths (`submit_attestation` via Ed25519, `on_report` via the CRE
/// forwarder); the caller has already authenticated the sender.
pub fn apply_report<'info>(
    issuer_config: &mut Account<'info, IssuerConfig>,
    attestation: &mut Account<'info, Attestation>,
    mint: &InterfaceAccount<'info, Mint>,
    token_program: &Interface<'info, TokenInterface>,
    report: &AttestationReport,
) -> Result<()> {
    let issuer_key = issuer_config.key();
    let now = Clock::get()?.unix_timestamp;

    require!(
        report.cluster_id == issuer_config.cluster_id,
        LanternError::DomainMismatch
    );

    // Replay and ordering.
    require!(report.nonce > attestation.nonce, LanternError::NonceReplay);
    require!(
        report.observed_at > attestation.observed_at,
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
        attestation.split_num,
        attestation.split_den,
        report.split_num,
        report.split_den,
    );
    let (old_num, old_den) = (attestation.split_num, attestation.split_den);
    let mut ui_multiplier_updated = false;
    if split_changed && issuer_config.scaled_ui {
        let mint_key = mint.key();
        let ix = update_multiplier(
            &token_program.key(),
            &mint_key,
            &issuer_key,
            &[],
            report.split_num as f64 / report.split_den as f64,
            0, // effective immediately
        )?;
        invoke_signed(
            &ix,
            &[mint.to_account_info(), issuer_config.to_account_info()],
            &[&[ISSUER_SEED, mint_key.as_ref(), &[issuer_config.bump]]],
        )?;
        ui_multiplier_updated = true;
    }

    attestation.nonce = report.nonce;
    attestation.observed_at = report.observed_at;
    attestation.shares_held = report.shares_held;
    attestation.split_num = report.split_num;
    attestation.split_den = report.split_den;
    attestation.other_chain_supply = report.other_chain_supply;
    attestation.max_supply = report.max_supply;
    attestation.submitted_slot = Clock::get()?.slot;

    // S5: auto-pause on shortfall, auto-resume on recovery. Never touches admin_paused.
    let current_supply = mint.supply;
    let auto_paused = current_supply > report.max_supply;
    if auto_paused != issuer_config.auto_paused {
        issuer_config.auto_paused = auto_paused;
        emit!(PauseChanged {
            issuer: issuer_key,
            auto_paused,
            admin_paused: issuer_config.admin_paused,
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
