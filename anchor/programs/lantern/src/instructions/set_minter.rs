use anchor_lang::prelude::*;

use crate::errors::LanternError;
use crate::events::*;
use crate::state::*;

#[derive(Accounts)]
pub struct SetMinter<'info> {
    pub admin: Signer<'info>,

    #[account(
        mut,
        seeds = [ISSUER_SEED, issuer_config.mint.as_ref()],
        bump = issuer_config.bump,
        has_one = admin @ LanternError::Unauthorized,
    )]
    pub issuer_config: Account<'info, IssuerConfig>,
}

/// Rotate the minter, or pass `OPEN_MINTER` (the default pubkey) to let any
/// wallet mint. Backing, freshness and pause checks apply either way.
pub fn handler(ctx: Context<SetMinter>, new_minter: Pubkey) -> Result<()> {
    let config = &mut ctx.accounts.issuer_config;
    let old_minter = config.minter;
    config.minter = new_minter;
    emit!(MinterChanged {
        issuer: config.key(),
        old_minter,
        new_minter,
        open: new_minter == OPEN_MINTER,
    });
    Ok(())
}
