use anchor_lang::prelude::*;

use crate::errors::LanternError;
use crate::state::*;

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct CreConfigParams {
    /// Keystone Forwarder program for the target CRE environment.
    pub forwarder_program: Pubkey,
    /// Forwarder state account; part of the forwarder authority PDA seeds.
    pub forwarder_state: Pubkey,
    /// CRE workflow owner (EVM address) allowed to write reports.
    pub workflow_owner: [u8; 20],
    /// CRE workflow name as encoded in report metadata (10 bytes).
    pub workflow_name: [u8; 10],
}

/// Admin sets (or rotates) which CRE workflow may deliver reports via `on_report`.
/// Kept in its own PDA so issuers created before CRE support need no migration.
#[derive(Accounts)]
pub struct SetCreConfig<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,

    #[account(
        seeds = [ISSUER_SEED, issuer_config.mint.as_ref()],
        bump = issuer_config.bump,
        has_one = admin @ LanternError::Unauthorized,
    )]
    pub issuer_config: Account<'info, IssuerConfig>,

    #[account(
        init_if_needed,
        payer = admin,
        space = 8 + CreConfig::INIT_SPACE,
        seeds = [CRE_CONFIG_SEED, issuer_config.key().as_ref()],
        bump,
    )]
    pub cre_config: Account<'info, CreConfig>,

    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<SetCreConfig>, params: CreConfigParams) -> Result<()> {
    require!(
        params.forwarder_program != Pubkey::default(),
        LanternError::InvalidForwarder
    );
    let cre = &mut ctx.accounts.cre_config;
    cre.issuer = ctx.accounts.issuer_config.key();
    cre.forwarder_program = params.forwarder_program;
    cre.forwarder_state = params.forwarder_state;
    cre.workflow_owner = params.workflow_owner;
    cre.workflow_name = params.workflow_name;
    cre.bump = ctx.bumps.cre_config;
    Ok(())
}
