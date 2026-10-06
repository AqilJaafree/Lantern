use anchor_lang::prelude::*;
use anchor_lang::solana_program::program_option::COption;
use anchor_spl::token_2022::spl_token_2022::{
    self,
    extension::{
        scaled_ui_amount::ScaledUiAmountConfig, BaseStateWithExtensions, StateWithExtensions,
    },
    state::Mint as SplMint,
};
use anchor_spl::token_interface::{Mint, TokenInterface};

use crate::errors::LanternError;
use crate::state::*;

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct InitIssuerParams {
    pub minter: Pubkey,
    pub attestor: Pubkey,
    pub staleness_secs: u32,
    pub cluster_id: u8,
}

#[derive(Accounts)]
pub struct InitIssuer<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,

    #[account(mint::token_program = token_program)]
    pub mint: InterfaceAccount<'info, Mint>,

    #[account(
        init,
        payer = admin,
        space = 8 + IssuerConfig::INIT_SPACE,
        seeds = [ISSUER_SEED, mint.key().as_ref()],
        bump,
    )]
    pub issuer_config: Account<'info, IssuerConfig>,

    #[account(
        init,
        payer = admin,
        space = 8 + Attestation::INIT_SPACE,
        seeds = [ATTESTATION_SEED, issuer_config.key().as_ref()],
        bump,
    )]
    pub attestation: Account<'info, Attestation>,

    pub token_program: Interface<'info, TokenInterface>,
    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<InitIssuer>, params: InitIssuerParams) -> Result<()> {
    let pda = ctx.accounts.issuer_config.key();
    let mint = &ctx.accounts.mint;

    require!(params.staleness_secs > 0, LanternError::InvalidStaleness);
    require!(
        mint.decimals == TOKEN_DECIMALS,
        LanternError::InvalidMintDecimals
    );
    // S4: the PDA must be the only way to mint.
    require!(
        mint.mint_authority == COption::Some(pda),
        LanternError::InvalidMintAuthority
    );
    require!(
        mint.freeze_authority.is_none() || mint.freeze_authority == COption::Some(pda),
        LanternError::InvalidFreezeAuthority
    );

    let scaled_ui = if ctx.accounts.token_program.key() == spl_token_2022::ID {
        let mint_info = mint.to_account_info();
        let data = mint_info.try_borrow_data()?;
        let state = StateWithExtensions::<SplMint>::unpack(&data)?;
        match state.get_extension::<ScaledUiAmountConfig>() {
            Ok(ext) => {
                let authority: Option<Pubkey> = ext.authority.into();
                require!(
                    authority == Some(pda),
                    LanternError::InvalidScaledUiAuthority
                );
                true
            }
            Err(_) => false,
        }
    } else {
        false
    };

    let config = &mut ctx.accounts.issuer_config;
    config.admin = ctx.accounts.admin.key();
    config.minter = params.minter;
    config.attestor = params.attestor;
    config.mint = mint.key();
    config.staleness_secs = params.staleness_secs;
    config.cluster_id = params.cluster_id;
    config.auto_paused = false;
    config.admin_paused = false;
    config.scaled_ui = scaled_ui;
    config.bump = ctx.bumps.issuer_config;

    // Empty attestation: observed_at = 0 is always stale, so minting is
    // blocked until the first real report lands (fail closed).
    let attestation = &mut ctx.accounts.attestation;
    attestation.issuer = pda;
    attestation.split_num = 1;
    attestation.split_den = 1;
    attestation.bump = ctx.bumps.attestation;

    Ok(())
}
