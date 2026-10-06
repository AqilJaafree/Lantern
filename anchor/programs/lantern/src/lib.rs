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

    /// Admin: set which CRE workflow (via the Keystone Forwarder) may call `on_report`.
    pub fn set_cre_config(ctx: Context<SetCreConfig>, params: CreConfigParams) -> Result<()> {
        instructions::set_cre_config::handler(ctx, params)
    }

    /// CRE path: Keystone Forwarder CPI with a DON-signed, Borsh-encoded
    /// `AttestationReport`. Same checks and effects as `submit_attestation`.
    pub fn on_report(ctx: Context<OnReport>, metadata: Vec<u8>, report: Vec<u8>) -> Result<()> {
        instructions::on_report::handler(ctx, metadata, report)
    }

    /// S6: admin manual pause / unpause.
    pub fn set_admin_paused(ctx: Context<SetAdminPaused>, paused: bool) -> Result<()> {
        instructions::set_admin_paused::handler(ctx, paused)
    }
}
