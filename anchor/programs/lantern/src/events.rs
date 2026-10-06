use anchor_lang::prelude::*;

#[event]
pub struct AttestationSubmitted {
    pub issuer: Pubkey,
    pub nonce: u64,
    pub observed_at: i64,
    pub shares_held: u64,
    pub split_num: u32,
    pub split_den: u32,
    pub other_chain_supply: u64,
    pub max_supply: u64,
    pub current_supply: u64,
}

#[event]
pub struct Minted {
    pub issuer: Pubkey,
    pub destination: Pubkey,
    pub amount: u64,
    pub new_supply: u64,
    pub max_supply: u64,
    pub attestation_nonce: u64,
}

#[event]
pub struct PauseChanged {
    pub issuer: Pubkey,
    pub auto_paused: bool,
    pub admin_paused: bool,
}

#[event]
pub struct CorporateAction {
    pub issuer: Pubkey,
    pub old_split_num: u32,
    pub old_split_den: u32,
    pub new_split_num: u32,
    pub new_split_den: u32,
    pub ui_multiplier_updated: bool,
}
