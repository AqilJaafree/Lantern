use anchor_lang::prelude::*;

pub mod errors;
pub mod events;
pub mod instructions;
pub mod report;
pub mod state;

use instructions::*;
use report::AttestationReport;

declare_id!("CMo46d7niK6id7f8vUR25zQjKr77ykvKoukDeUEKCXuh");

#[program]
pub mod lantern {
    use super::*;

    /// S1: create the issuer config and an empty (stale) attestation.
    pub fn init_issuer(ctx: Context<InitIssuer>, params: InitIssuerParams) -> Result<()> {
        instructions::init_issuer::handler(ctx, params)
    }

    /// S2 + S5 + S8: verify and store a signed backing report, auto-pause or
    /// resume, and apply split changes to the Scaled UI multiplier.
    pub fn submit_attestation(
        ctx: Context<SubmitAttestation>,
        report: AttestationReport,
    ) -> Result<()> {
        instructions::submit_attestation::handler(ctx, report)
    }

    /// S3: mint only within fresh, attested backing.
    pub fn mint_gated(ctx: Context<MintGated>, amount: u64) -> Result<()> {
        instructions::mint_gated::handler(ctx, amount)
    }

    /// S6: admin manual pause / unpause.
    pub fn set_admin_paused(ctx: Context<SetAdminPaused>, paused: bool) -> Result<()> {
        instructions::set_admin_paused::handler(ctx, paused)
    }
}
