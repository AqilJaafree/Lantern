use anchor_lang::prelude::*;
use anchor_spl::token_interface::{Mint, TokenInterface};

use crate::errors::LanternError;
use crate::instructions::apply_report::apply_report;
use crate::report::AttestationReport;
use crate::state::*;

/// Forwarder metadata: workflow_cid[32] | workflow_name[10] | workflow_owner[20] | report_id[2].
const WORKFLOW_NAME: core::ops::Range<usize> = 32..42;
const WORKFLOW_OWNER: core::ops::Range<usize> = 42..62;

/// CRE path. The Keystone Forwarder verifies the DON signatures, then CPIs
/// here signing as `forwarder_authority`. The first two accounts are fixed
/// by the forwarder; the rest are the receiver accounts the workflow passes
/// (and the forwarder hashes into the signed report).
#[derive(Accounts)]
pub struct OnReport<'info> {
    /// CHECK: forwarder state; owner and address checked against `cre_config`.
    pub state: UncheckedAccount<'info>,

    /// PDA ["forwarder", state, lantern] under the forwarder program, signed by its CPI.
    pub forwarder_authority: Signer<'info>,

    #[account(
        mut,
        seeds = [ISSUER_SEED, mint.key().as_ref()],
        bump = issuer_config.bump,
        has_one = mint,
    )]
    pub issuer_config: Account<'info, IssuerConfig>,

    #[account(
        seeds = [CRE_CONFIG_SEED, issuer_config.key().as_ref()],
        bump = cre_config.bump,
    )]
    pub cre_config: Account<'info, CreConfig>,

    #[account(
        mut,
        seeds = [ATTESTATION_SEED, issuer_config.key().as_ref()],
        bump = attestation.bump,
    )]
    pub attestation: Account<'info, Attestation>,

    #[account(mut, mint::token_program = token_program)]
    pub mint: InterfaceAccount<'info, Mint>,

    pub token_program: Interface<'info, TokenInterface>,
}

pub fn handler(ctx: Context<OnReport>, metadata: Vec<u8>, report: Vec<u8>) -> Result<()> {
    let cre = &ctx.accounts.cre_config;
    let state = &ctx.accounts.state;

    // 1. The call came through the configured forwarder.
    require_keys_eq!(state.key(), cre.forwarder_state, LanternError::InvalidForwarder);
    require_keys_eq!(
        *state.to_account_info().owner,
        cre.forwarder_program,
        LanternError::InvalidForwarder
    );
    let (expected_authority, _) = Pubkey::find_program_address(
        &[b"forwarder", state.key().as_ref(), crate::ID.as_ref()],
        &cre.forwarder_program,
    );
    require_keys_eq!(
        ctx.accounts.forwarder_authority.key(),
        expected_authority,
        LanternError::InvalidForwarderAuthority
    );

    // 2. The report came from our workflow, not any workflow using the forwarder.
    let name = metadata.get(WORKFLOW_NAME).ok_or(LanternError::InvalidMetadata)?;
    let owner = metadata.get(WORKFLOW_OWNER).ok_or(LanternError::InvalidMetadata)?;
    require!(
        name == cre.workflow_name && owner == cre.workflow_owner,
        LanternError::UnauthorizedWorkflow
    );

    // 3. Same checks and effects as the relayer path.
    let report = AttestationReport::try_from_slice(&report)
        .map_err(|_| error!(LanternError::InvalidReportPayload))?;
    let a = ctx.accounts;
    apply_report(
        &mut a.issuer_config,
        &mut a.attestation,
        &a.mint,
        &a.token_program,
        &report,
    )
}
