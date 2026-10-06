//! Test-only stand-in for the CRE Keystone Forwarder. It skips DON signature
//! checks and just reproduces the CPI shape Lantern's `on_report` sees:
//! accounts `[state, forwarder_authority (PDA signer), ...receiver accounts]`
//! and data `discriminator("global:on_report") | borsh(metadata) | borsh(report)`.
//! Used by tests/lantern.ts on a local validator; never deployed.
use anchor_lang::prelude::*;
use anchor_lang::solana_program::{
    instruction::{AccountMeta, Instruction},
    program::invoke_signed,
};

/// sha256("global:on_report")[..8], the Anchor discriminator of `on_report`.
const ON_REPORT_DISCRIMINATOR: [u8; 8] = [214, 173, 18, 221, 173, 148, 151, 208];

declare_id!("5VL6FGTXNPkuw94tSdtEMKsgH5k8T1ubwLQmnp9ja29X");

#[program]
pub mod test_forwarder {
    use super::*;

    /// Create a forwarder state account owned by this program.
    pub fn init_state(_ctx: Context<InitState>) -> Result<()> {
        Ok(())
    }

    /// CPI `on_report(metadata, report)` into `receiver`, signing as
    /// PDA ["forwarder", state, receiver] like the real forwarder.
    pub fn forward<'info>(
        ctx: Context<'_, '_, '_, 'info, Forward<'info>>,
        metadata: Vec<u8>,
        report: Vec<u8>,
    ) -> Result<()> {
        let state = ctx.accounts.state.key();
        let receiver = ctx.accounts.receiver.key();
        let (authority, bump) =
            Pubkey::find_program_address(&[b"forwarder", state.as_ref(), receiver.as_ref()], &crate::ID);
        require_keys_eq!(authority, ctx.accounts.forwarder_authority.key());

        let mut data = ON_REPORT_DISCRIMINATOR.to_vec();
        metadata.serialize(&mut data)?;
        report.serialize(&mut data)?;

        let mut metas = vec![
            AccountMeta::new_readonly(state, false),
            AccountMeta::new_readonly(authority, true),
        ];
        metas.extend(ctx.remaining_accounts.iter().map(|a| AccountMeta {
            pubkey: *a.key,
            is_signer: false,
            is_writable: a.is_writable,
        }));

        let mut infos = vec![
            ctx.accounts.state.to_account_info(),
            ctx.accounts.forwarder_authority.to_account_info(),
        ];
        infos.extend(ctx.remaining_accounts.iter().cloned());

        invoke_signed(
            &Instruction { program_id: receiver, accounts: metas, data },
            &infos,
            &[&[b"forwarder", state.as_ref(), receiver.as_ref(), &[bump]]],
        )?;
        Ok(())
    }
}

#[account]
pub struct ForwarderState {}

#[derive(Accounts)]
pub struct InitState<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(init, payer = payer, space = 8)]
    pub state: Account<'info, ForwarderState>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct Forward<'info> {
    pub state: Account<'info, ForwarderState>,
    /// CHECK: PDA re-derived in the handler.
    pub forwarder_authority: UncheckedAccount<'info>,
    /// CHECK: receiver program to CPI into.
    pub receiver: UncheckedAccount<'info>,
}
