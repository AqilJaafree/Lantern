use anchor_lang::prelude::*;

use crate::errors::LanternError;
use crate::events::*;
use crate::state::*;

#[derive(Accounts)]
pub struct SetAdminPaused<'info> {
    pub admin: Signer<'info>,

    #[account(
        mut,
        seeds = [ISSUER_SEED, issuer_config.mint.as_ref()],
        bump = issuer_config.bump,
        has_one = admin @ LanternError::Unauthorized,
    )]
    pub issuer_config: Account<'info, IssuerConfig>,
}

/// S6: manual override. Only touches `admin_paused`, so it can't clear an
/// auto-pause and an attestation can't clear it.
pub fn handler(ctx: Context<SetAdminPaused>, paused: bool) -> Result<()> {
    let config = &mut ctx.accounts.issuer_config;
    if config.admin_paused != paused {
        config.admin_paused = paused;
        emit!(PauseChanged {
            issuer: config.key(),
            auto_paused: config.auto_paused,
            admin_paused: paused,
        });
    }
    Ok(())
}
