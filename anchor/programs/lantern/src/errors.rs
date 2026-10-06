use anchor_lang::prelude::*;

#[error_code]
pub enum LanternError {
    #[msg("Signer is not authorized for this action")]
    Unauthorized,
    #[msg("Attestation signature is missing or does not match the attestor")]
    InvalidSignature,
    #[msg("Latest attestation is older than the staleness window")]
    StaleAttestation,
    #[msg("Mint would exceed attested backing")]
    ExceedsBacking,
    #[msg("Minting is auto-paused: supply exceeds backing")]
    AutoPaused,
    #[msg("Minting is paused by the admin")]
    AdminPaused,
    #[msg("Attestation nonce must increase")]
    NonceReplay,
    #[msg("Attestation timestamp must increase")]
    TimestampRegression,
    #[msg("Attestation timestamp is in the future")]
    FutureTimestamp,
    #[msg("Attestation is for a different cluster")]
    DomainMismatch,
    #[msg("Reported max_supply does not match the backing rule")]
    MaxSupplyMismatch,
    #[msg("Split factor must have a non-zero numerator and denominator")]
    InvalidSplitFactor,
    #[msg("Program PDA must be the mint authority")]
    InvalidMintAuthority,
    #[msg("Freeze authority must be the program PDA or unset")]
    InvalidFreezeAuthority,
    #[msg("Scaled UI Amount authority must be the program PDA")]
    InvalidScaledUiAuthority,
    #[msg("Token must use 6 decimals")]
    InvalidMintDecimals,
    #[msg("Staleness window must be greater than zero")]
    InvalidStaleness,
    #[msg("Arithmetic overflow")]
    Overflow,
    #[msg("Forwarder program or state does not match the CRE config")]
    InvalidForwarder,
    #[msg("forwarder_authority is not the forwarder PDA for this receiver")]
    InvalidForwarderAuthority,
    #[msg("Report metadata is too short")]
    InvalidMetadata,
    #[msg("Report was not produced by the configured CRE workflow")]
    UnauthorizedWorkflow,
    #[msg("Report payload is not a Borsh AttestationReport")]
    InvalidReportPayload,
}
