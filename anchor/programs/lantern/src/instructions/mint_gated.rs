use anchor_lang::prelude::*;
use anchor_spl::token_interface::{self, Mint, MintTo, TokenAccount, TokenInterface};

use crate::errors::LanternError;
use crate::events::*;
use crate::state::*;

#[derive(Accounts)]
pub struct MintGated<'info> {
    pub minter: Signer<'info>,

    #[account(
        seeds = [ISSUER_SEED, mint.key().as_ref()],
        bump = issuer_config.bump,
        has_one = mint,
    )]
    pub issuer_config: Account<'info, IssuerConfig>,

    #[account(
        seeds = [ATTESTATION_SEED, issuer_config.key().as_ref()],
        bump = attestation.bump,
    )]
    pub attestation: Account<'info, Attestation>,

    #[account(mut, mint::token_program = token_program)]
    pub mint: InterfaceAccount<'info, Mint>,

    #[account(
        mut,
        token::mint = mint,
        token::token_program = token_program,
    )]
    pub destination: InterfaceAccount<'info, TokenAccount>,

    pub token_program: Interface<'info, TokenInterface>,
}

pub fn handler(ctx: Context<MintGated>, amount: u64) -> Result<()> {
    let config = &ctx.accounts.issuer_config;
    let attestation = &ctx.accounts.attestation;
    let now = Clock::get()?.unix_timestamp;

    // Single minter, or open minting when the admin set OPEN_MINTER.
    require!(
        config.minter == OPEN_MINTER || config.minter == ctx.accounts.minter.key(),
        LanternError::Unauthorized
    );
    require!(!config.admin_paused, LanternError::AdminPaused);
    require!(!config.auto_paused, LanternError::AutoPaused);

    // Fail closed: no fresh attestation, no minting.
    let age = now.saturating_sub(attestation.observed_at);
    require!(
        attestation.nonce > 0 && age <= config.staleness_secs as i64,
        LanternError::StaleAttestation
    );

    let new_supply = ctx
        .accounts
        .mint
        .supply
        .checked_add(amount)
        .ok_or(LanternError::Overflow)?;
    require!(
        new_supply <= attestation.max_supply,
        LanternError::ExceedsBacking
    );

    let mint_key = ctx.accounts.mint.key();
    let seeds: &[&[u8]] = &[ISSUER_SEED, mint_key.as_ref(), &[config.bump]];
    token_interface::mint_to(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            MintTo {
                mint: ctx.accounts.mint.to_account_info(),
                to: ctx.accounts.destination.to_account_info(),
                authority: ctx.accounts.issuer_config.to_account_info(),
            },
            &[seeds],
        ),
        amount,
    )?;

    emit!(Minted {
        issuer: config.key(),
        destination: ctx.accounts.destination.key(),
        amount,
        new_supply,
        max_supply: attestation.max_supply,
        attestation_nonce: attestation.nonce,
    });

    Ok(())
}
