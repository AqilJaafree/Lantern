// Code generated — DO NOT EDIT.
import {
  getArrayCodec,
  getBooleanCodec,
  getI64Codec,
  getStructCodec,
  getU32Codec,
  getU64Codec,
  getU8Codec,
} from '@solana/codecs'
import { getAddressCodec, type Address } from '@solana/addresses'
import {
  adaptTrigger,
  anchorCPILogTriggerConfig,
  bytesToBase64,
  bytesToHex,
  calculateAccountsHash,
  encodeBorshVecU32,
  encodeForwarderReport,
  prepareSolanaReportRequest,
  prepareSubkeyValue,
  type Runtime,
  type SolanaAccountMeta,
  SolanaClient,
  solanaAccountMetasToJson,
  solanaAddressToBytes,
  type SolanaComputeConfig,
  type SolanaDecodedLog,
  type SolanaFilterLogTriggerRequestJson,
  type SolanaLog,
  type SolanaLogTriggerOptions,
  type SolanaSubkeyConfigJson,
  type SolanaValueComparatorJson,
  type Trigger,
} from '@chainlink/cre-sdk'

export const LANTERN_PROGRAM_ID = 'CMo46d7niK6id7f8vUR25zQjKr77ykvKoukDeUEKCXuh'

export const LANTERN_IDL = {"address":"CMo46d7niK6id7f8vUR25zQjKr77ykvKoukDeUEKCXuh","metadata":{"name":"lantern","version":"0.1.0","spec":"0.1.0","description":"Lantern: mint gate for tokenized stocks, enforced by signed backing attestations"},"instructions":[{"name":"init_issuer","docs":["S1: create the issuer config and an empty (stale) attestation."],"discriminator":[186,77,49,118,203,47,30,79],"accounts":[{"name":"admin","writable":true,"signer":true},{"name":"mint"},{"name":"issuer_config","writable":true,"pda":{"seeds":[{"kind":"const","value":[105,115,115,117,101,114]},{"kind":"account","path":"mint"}]}},{"name":"attestation","writable":true,"pda":{"seeds":[{"kind":"const","value":[97,116,116,101,115,116,97,116,105,111,110]},{"kind":"account","path":"issuer_config"}]}},{"name":"token_program"},{"name":"system_program","address":"11111111111111111111111111111111"}],"args":[{"name":"params","type":{"defined":{"name":"InitIssuerParams"}}}]},{"name":"mint_gated","docs":["S3: mint only within fresh, attested backing."],"discriminator":[80,1,115,69,180,41,118,54],"accounts":[{"name":"minter","signer":true,"relations":["issuer_config"]},{"name":"issuer_config","pda":{"seeds":[{"kind":"const","value":[105,115,115,117,101,114]},{"kind":"account","path":"mint"}]}},{"name":"attestation","pda":{"seeds":[{"kind":"const","value":[97,116,116,101,115,116,97,116,105,111,110]},{"kind":"account","path":"issuer_config"}]}},{"name":"mint","writable":true,"relations":["issuer_config"]},{"name":"destination","writable":true},{"name":"token_program"}],"args":[{"name":"amount","type":"u64"}]},{"name":"on_report","docs":["CRE path: Keystone Forwarder CPI with a DON-signed, Borsh-encoded","`AttestationReport`. Same checks and effects as `submit_attestation`."],"discriminator":[214,173,18,221,173,148,151,208],"accounts":[{"name":"state"},{"name":"forwarder_authority","docs":["PDA [\"forwarder\", state, lantern] under the forwarder program, signed by its CPI."],"signer":true},{"name":"issuer_config","writable":true,"pda":{"seeds":[{"kind":"const","value":[105,115,115,117,101,114]},{"kind":"account","path":"mint"}]}},{"name":"cre_config","pda":{"seeds":[{"kind":"const","value":[99,114,101]},{"kind":"account","path":"issuer_config"}]}},{"name":"attestation","writable":true,"pda":{"seeds":[{"kind":"const","value":[97,116,116,101,115,116,97,116,105,111,110]},{"kind":"account","path":"issuer_config"}]}},{"name":"mint","writable":true,"relations":["issuer_config"]},{"name":"token_program"}],"args":[{"name":"metadata","type":"bytes"},{"name":"report","type":"bytes"}]},{"name":"set_admin_paused","docs":["S6: admin manual pause / unpause."],"discriminator":[90,155,217,121,12,134,221,157],"accounts":[{"name":"admin","signer":true,"relations":["issuer_config"]},{"name":"issuer_config","writable":true,"pda":{"seeds":[{"kind":"const","value":[105,115,115,117,101,114]},{"kind":"account","path":"issuer_config.mint","account":"IssuerConfig"}]}}],"args":[{"name":"paused","type":"bool"}]},{"name":"set_cre_config","docs":["Admin: set which CRE workflow (via the Keystone Forwarder) may call `on_report`."],"discriminator":[162,52,192,185,232,102,178,243],"accounts":[{"name":"admin","writable":true,"signer":true,"relations":["issuer_config"]},{"name":"issuer_config","pda":{"seeds":[{"kind":"const","value":[105,115,115,117,101,114]},{"kind":"account","path":"issuer_config.mint","account":"IssuerConfig"}]}},{"name":"cre_config","writable":true,"pda":{"seeds":[{"kind":"const","value":[99,114,101]},{"kind":"account","path":"issuer_config"}]}},{"name":"system_program","address":"11111111111111111111111111111111"}],"args":[{"name":"params","type":{"defined":{"name":"CreConfigParams"}}}]},{"name":"submit_attestation","docs":["S2 + S5 + S8: verify and store a signed backing report, auto-pause or","resume, and apply split changes to the Scaled UI multiplier."],"discriminator":[238,220,255,105,183,211,40,83],"accounts":[{"name":"issuer_config","writable":true,"pda":{"seeds":[{"kind":"const","value":[105,115,115,117,101,114]},{"kind":"account","path":"mint"}]}},{"name":"attestation","writable":true,"pda":{"seeds":[{"kind":"const","value":[97,116,116,101,115,116,97,116,105,111,110]},{"kind":"account","path":"issuer_config"}]}},{"name":"mint","docs":["Writable so a corporate action can update the Scaled UI multiplier."],"writable":true,"relations":["issuer_config"]},{"name":"instructions","address":"Sysvar1nstructions1111111111111111111111111"},{"name":"token_program"}],"args":[{"name":"report","type":{"defined":{"name":"AttestationReport"}}}]}],"accounts":[{"name":"Attestation","discriminator":[152,125,183,86,36,146,121,73]},{"name":"CreConfig","discriminator":[223,155,135,163,37,82,124,78]},{"name":"IssuerConfig","discriminator":[238,244,71,221,254,169,247,237]}],"events":[{"name":"AttestationSubmitted","discriminator":[177,213,117,225,166,11,54,218]},{"name":"CorporateAction","discriminator":[235,60,136,218,133,97,141,136]},{"name":"Minted","discriminator":[174,131,21,57,88,117,114,121]},{"name":"PauseChanged","discriminator":[238,188,213,78,134,209,178,218]}],"errors":[{"code":6000,"name":"Unauthorized","msg":"Signer is not authorized for this action"},{"code":6001,"name":"InvalidSignature","msg":"Attestation signature is missing or does not match the attestor"},{"code":6002,"name":"StaleAttestation","msg":"Latest attestation is older than the staleness window"},{"code":6003,"name":"ExceedsBacking","msg":"Mint would exceed attested backing"},{"code":6004,"name":"AutoPaused","msg":"Minting is auto-paused: supply exceeds backing"},{"code":6005,"name":"AdminPaused","msg":"Minting is paused by the admin"},{"code":6006,"name":"NonceReplay","msg":"Attestation nonce must increase"},{"code":6007,"name":"TimestampRegression","msg":"Attestation timestamp must increase"},{"code":6008,"name":"FutureTimestamp","msg":"Attestation timestamp is in the future"},{"code":6009,"name":"DomainMismatch","msg":"Attestation is for a different cluster"},{"code":6010,"name":"MaxSupplyMismatch","msg":"Reported max_supply does not match the backing rule"},{"code":6011,"name":"InvalidSplitFactor","msg":"Split factor must have a non-zero numerator and denominator"},{"code":6012,"name":"InvalidMintAuthority","msg":"Program PDA must be the mint authority"},{"code":6013,"name":"InvalidFreezeAuthority","msg":"Freeze authority must be the program PDA or unset"},{"code":6014,"name":"InvalidScaledUiAuthority","msg":"Scaled UI Amount authority must be the program PDA"},{"code":6015,"name":"InvalidMintDecimals","msg":"Token must use 6 decimals"},{"code":6016,"name":"InvalidStaleness","msg":"Staleness window must be greater than zero"},{"code":6017,"name":"Overflow","msg":"Arithmetic overflow"},{"code":6018,"name":"InvalidForwarder","msg":"Forwarder program or state does not match the CRE config"},{"code":6019,"name":"InvalidForwarderAuthority","msg":"forwarder_authority is not the forwarder PDA for this receiver"},{"code":6020,"name":"InvalidMetadata","msg":"Report metadata is too short"},{"code":6021,"name":"UnauthorizedWorkflow","msg":"Report was not produced by the configured CRE workflow"},{"code":6022,"name":"InvalidReportPayload","msg":"Report payload is not a Borsh AttestationReport"}],"types":[{"name":"Attestation","docs":["Single latest attestation for an issuer."],"type":{"kind":"struct","fields":[{"name":"issuer","type":"pubkey"},{"name":"nonce","type":"u64"},{"name":"observed_at","type":"i64"},{"name":"shares_held","type":"u64"},{"name":"split_num","type":"u32"},{"name":"split_den","type":"u32"},{"name":"other_chain_supply","type":"u64"},{"name":"max_supply","type":"u64"},{"name":"submitted_slot","type":"u64"},{"name":"bump","type":"u8"}]}},{"name":"AttestationReport","docs":["Signed payload produced by the CRE workflow.","","Signed bytes (little-endian, fixed layout, `MESSAGE_LEN` bytes):","`REPORT_DOMAIN | program_id | issuer_config | cluster_id | nonce | observed_at |","shares_held | split_num | split_den | other_chain_supply | max_supply`"],"type":{"kind":"struct","fields":[{"name":"cluster_id","type":"u8"},{"name":"nonce","type":"u64"},{"name":"observed_at","type":"i64"},{"name":"shares_held","docs":["Custodian holdings in micro-shares."],"type":"u64"},{"name":"split_num","docs":["Cumulative split factor since token launch (2/1 after a 2-for-1 split)."],"type":"u32"},{"name":"split_den","type":"u32"},{"name":"other_chain_supply","docs":["Supply on all non-Solana chains, normalized to 6 decimals, rounded up."],"type":"u64"},{"name":"max_supply","type":"u64"}]}},{"name":"AttestationSubmitted","type":{"kind":"struct","fields":[{"name":"issuer","type":"pubkey"},{"name":"nonce","type":"u64"},{"name":"observed_at","type":"i64"},{"name":"shares_held","type":"u64"},{"name":"split_num","type":"u32"},{"name":"split_den","type":"u32"},{"name":"other_chain_supply","type":"u64"},{"name":"max_supply","type":"u64"},{"name":"current_supply","type":"u64"}]}},{"name":"CorporateAction","type":{"kind":"struct","fields":[{"name":"issuer","type":"pubkey"},{"name":"old_split_num","type":"u32"},{"name":"old_split_den","type":"u32"},{"name":"new_split_num","type":"u32"},{"name":"new_split_den","type":"u32"},{"name":"ui_multiplier_updated","type":"bool"}]}},{"name":"CreConfig","docs":["Which CRE workflow may deliver reports through the Keystone Forwarder","(`on_report`). Separate PDA so existing issuers need no migration."],"type":{"kind":"struct","fields":[{"name":"issuer","type":"pubkey"},{"name":"forwarder_program","type":"pubkey"},{"name":"forwarder_state","type":"pubkey"},{"name":"workflow_owner","docs":["CRE workflow owner (EVM address), from report metadata bytes 42..62."],"type":{"array":["u8",20]}},{"name":"workflow_name","docs":["CRE workflow name, from report metadata bytes 32..42."],"type":{"array":["u8",10]}},{"name":"bump","type":"u8"}]}},{"name":"CreConfigParams","type":{"kind":"struct","fields":[{"name":"forwarder_program","docs":["Keystone Forwarder program for the target CRE environment."],"type":"pubkey"},{"name":"forwarder_state","docs":["Forwarder state account; part of the forwarder authority PDA seeds."],"type":"pubkey"},{"name":"workflow_owner","docs":["CRE workflow owner (EVM address) allowed to write reports."],"type":{"array":["u8",20]}},{"name":"workflow_name","docs":["CRE workflow name as encoded in report metadata (10 bytes)."],"type":{"array":["u8",10]}}]}},{"name":"InitIssuerParams","type":{"kind":"struct","fields":[{"name":"minter","type":"pubkey"},{"name":"attestor","type":"pubkey"},{"name":"staleness_secs","type":"u32"},{"name":"cluster_id","type":"u8"}]}},{"name":"IssuerConfig","docs":["Issuer configuration. Its PDA is also the token's mint authority,","freeze authority (or none), and Scaled UI multiplier authority."],"type":{"kind":"struct","fields":[{"name":"admin","type":"pubkey"},{"name":"minter","type":"pubkey"},{"name":"attestor","docs":["Ed25519 key whose signature every attestation report must carry."],"type":"pubkey"},{"name":"mint","type":"pubkey"},{"name":"staleness_secs","type":"u32"},{"name":"cluster_id","docs":["Identifies the cluster a report is meant for (domain separation)."],"type":"u8"},{"name":"auto_paused","docs":["Set by attestations: supply exceeded backing. Cleared only by attestations."],"type":"bool"},{"name":"admin_paused","docs":["Set by the admin. Never touched by attestations."],"type":"bool"},{"name":"scaled_ui","docs":["The mint has the Token-2022 Scaled UI Amount extension controlled by this PDA."],"type":"bool"},{"name":"bump","type":"u8"}]}},{"name":"Minted","type":{"kind":"struct","fields":[{"name":"issuer","type":"pubkey"},{"name":"destination","type":"pubkey"},{"name":"amount","type":"u64"},{"name":"new_supply","type":"u64"},{"name":"max_supply","type":"u64"},{"name":"attestation_nonce","type":"u64"}]}},{"name":"PauseChanged","type":{"kind":"struct","fields":[{"name":"issuer","type":"pubkey"},{"name":"auto_paused","type":"bool"},{"name":"admin_paused","type":"bool"}]}}]} as const

// Base64 of the compact IDL JSON, passed to log triggers as contractIdlJson.
const LANTERN_IDL_BASE64 = 'eyJhZGRyZXNzIjoiQ01vNDZkN25pSzZpZDdmOHZVUjI1elFqS3I3N3lrdktvdWtEZVVFS0NYdWgiLCJtZXRhZGF0YSI6eyJuYW1lIjoibGFudGVybiIsInZlcnNpb24iOiIwLjEuMCIsInNwZWMiOiIwLjEuMCIsImRlc2NyaXB0aW9uIjoiTGFudGVybjogbWludCBnYXRlIGZvciB0b2tlbml6ZWQgc3RvY2tzLCBlbmZvcmNlZCBieSBzaWduZWQgYmFja2luZyBhdHRlc3RhdGlvbnMifSwiaW5zdHJ1Y3Rpb25zIjpbeyJuYW1lIjoiaW5pdF9pc3N1ZXIiLCJkb2NzIjpbIlMxOiBjcmVhdGUgdGhlIGlzc3VlciBjb25maWcgYW5kIGFuIGVtcHR5IChzdGFsZSkgYXR0ZXN0YXRpb24uIl0sImRpc2NyaW1pbmF0b3IiOlsxODYsNzcsNDksMTE4LDIwMyw0NywzMCw3OV0sImFjY291bnRzIjpbeyJuYW1lIjoiYWRtaW4iLCJ3cml0YWJsZSI6dHJ1ZSwic2lnbmVyIjp0cnVlfSx7Im5hbWUiOiJtaW50In0seyJuYW1lIjoiaXNzdWVyX2NvbmZpZyIsIndyaXRhYmxlIjp0cnVlLCJwZGEiOnsic2VlZHMiOlt7ImtpbmQiOiJjb25zdCIsInZhbHVlIjpbMTA1LDExNSwxMTUsMTE3LDEwMSwxMTRdfSx7ImtpbmQiOiJhY2NvdW50IiwicGF0aCI6Im1pbnQifV19fSx7Im5hbWUiOiJhdHRlc3RhdGlvbiIsIndyaXRhYmxlIjp0cnVlLCJwZGEiOnsic2VlZHMiOlt7ImtpbmQiOiJjb25zdCIsInZhbHVlIjpbOTcsMTE2LDExNiwxMDEsMTE1LDExNiw5NywxMTYsMTA1LDExMSwxMTBdfSx7ImtpbmQiOiJhY2NvdW50IiwicGF0aCI6Imlzc3Vlcl9jb25maWcifV19fSx7Im5hbWUiOiJ0b2tlbl9wcm9ncmFtIn0seyJuYW1lIjoic3lzdGVtX3Byb2dyYW0iLCJhZGRyZXNzIjoiMTExMTExMTExMTExMTExMTExMTExMTExMTExMTExMTEifV0sImFyZ3MiOlt7Im5hbWUiOiJwYXJhbXMiLCJ0eXBlIjp7ImRlZmluZWQiOnsibmFtZSI6IkluaXRJc3N1ZXJQYXJhbXMifX19XX0seyJuYW1lIjoibWludF9nYXRlZCIsImRvY3MiOlsiUzM6IG1pbnQgb25seSB3aXRoaW4gZnJlc2gsIGF0dGVzdGVkIGJhY2tpbmcuIl0sImRpc2NyaW1pbmF0b3IiOls4MCwxLDExNSw2OSwxODAsNDEsMTE4LDU0XSwiYWNjb3VudHMiOlt7Im5hbWUiOiJtaW50ZXIiLCJzaWduZXIiOnRydWUsInJlbGF0aW9ucyI6WyJpc3N1ZXJfY29uZmlnIl19LHsibmFtZSI6Imlzc3Vlcl9jb25maWciLCJwZGEiOnsic2VlZHMiOlt7ImtpbmQiOiJjb25zdCIsInZhbHVlIjpbMTA1LDExNSwxMTUsMTE3LDEwMSwxMTRdfSx7ImtpbmQiOiJhY2NvdW50IiwicGF0aCI6Im1pbnQifV19fSx7Im5hbWUiOiJhdHRlc3RhdGlvbiIsInBkYSI6eyJzZWVkcyI6W3sia2luZCI6ImNvbnN0IiwidmFsdWUiOls5NywxMTYsMTE2LDEwMSwxMTUsMTE2LDk3LDExNiwxMDUsMTExLDExMF19LHsia2luZCI6ImFjY291bnQiLCJwYXRoIjoiaXNzdWVyX2NvbmZpZyJ9XX19LHsibmFtZSI6Im1pbnQiLCJ3cml0YWJsZSI6dHJ1ZSwicmVsYXRpb25zIjpbImlzc3Vlcl9jb25maWciXX0seyJuYW1lIjoiZGVzdGluYXRpb24iLCJ3cml0YWJsZSI6dHJ1ZX0seyJuYW1lIjoidG9rZW5fcHJvZ3JhbSJ9XSwiYXJncyI6W3sibmFtZSI6ImFtb3VudCIsInR5cGUiOiJ1NjQifV19LHsibmFtZSI6Im9uX3JlcG9ydCIsImRvY3MiOlsiQ1JFIHBhdGg6IEtleXN0b25lIEZvcndhcmRlciBDUEkgd2l0aCBhIERPTi1zaWduZWQsIEJvcnNoLWVuY29kZWQiLCJgQXR0ZXN0YXRpb25SZXBvcnRgLiBTYW1lIGNoZWNrcyBhbmQgZWZmZWN0cyBhcyBgc3VibWl0X2F0dGVzdGF0aW9uYC4iXSwiZGlzY3JpbWluYXRvciI6WzIxNCwxNzMsMTgsMjIxLDE3MywxNDgsMTUxLDIwOF0sImFjY291bnRzIjpbeyJuYW1lIjoic3RhdGUifSx7Im5hbWUiOiJmb3J3YXJkZXJfYXV0aG9yaXR5IiwiZG9jcyI6WyJQREEgW1wiZm9yd2FyZGVyXCIsIHN0YXRlLCBsYW50ZXJuXSB1bmRlciB0aGUgZm9yd2FyZGVyIHByb2dyYW0sIHNpZ25lZCBieSBpdHMgQ1BJLiJdLCJzaWduZXIiOnRydWV9LHsibmFtZSI6Imlzc3Vlcl9jb25maWciLCJ3cml0YWJsZSI6dHJ1ZSwicGRhIjp7InNlZWRzIjpbeyJraW5kIjoiY29uc3QiLCJ2YWx1ZSI6WzEwNSwxMTUsMTE1LDExNywxMDEsMTE0XX0seyJraW5kIjoiYWNjb3VudCIsInBhdGgiOiJtaW50In1dfX0seyJuYW1lIjoiY3JlX2NvbmZpZyIsInBkYSI6eyJzZWVkcyI6W3sia2luZCI6ImNvbnN0IiwidmFsdWUiOls5OSwxMTQsMTAxXX0seyJraW5kIjoiYWNjb3VudCIsInBhdGgiOiJpc3N1ZXJfY29uZmlnIn1dfX0seyJuYW1lIjoiYXR0ZXN0YXRpb24iLCJ3cml0YWJsZSI6dHJ1ZSwicGRhIjp7InNlZWRzIjpbeyJraW5kIjoiY29uc3QiLCJ2YWx1ZSI6Wzk3LDExNiwxMTYsMTAxLDExNSwxMTYsOTcsMTE2LDEwNSwxMTEsMTEwXX0seyJraW5kIjoiYWNjb3VudCIsInBhdGgiOiJpc3N1ZXJfY29uZmlnIn1dfX0seyJuYW1lIjoibWludCIsIndyaXRhYmxlIjp0cnVlLCJyZWxhdGlvbnMiOlsiaXNzdWVyX2NvbmZpZyJdfSx7Im5hbWUiOiJ0b2tlbl9wcm9ncmFtIn1dLCJhcmdzIjpbeyJuYW1lIjoibWV0YWRhdGEiLCJ0eXBlIjoiYnl0ZXMifSx7Im5hbWUiOiJyZXBvcnQiLCJ0eXBlIjoiYnl0ZXMifV19LHsibmFtZSI6InNldF9hZG1pbl9wYXVzZWQiLCJkb2NzIjpbIlM2OiBhZG1pbiBtYW51YWwgcGF1c2UgLyB1bnBhdXNlLiJdLCJkaXNjcmltaW5hdG9yIjpbOTAsMTU1LDIxNywxMjEsMTIsMTM0LDIyMSwxNTddLCJhY2NvdW50cyI6W3sibmFtZSI6ImFkbWluIiwic2lnbmVyIjp0cnVlLCJyZWxhdGlvbnMiOlsiaXNzdWVyX2NvbmZpZyJdfSx7Im5hbWUiOiJpc3N1ZXJfY29uZmlnIiwid3JpdGFibGUiOnRydWUsInBkYSI6eyJzZWVkcyI6W3sia2luZCI6ImNvbnN0IiwidmFsdWUiOlsxMDUsMTE1LDExNSwxMTcsMTAxLDExNF19LHsia2luZCI6ImFjY291bnQiLCJwYXRoIjoiaXNzdWVyX2NvbmZpZy5taW50IiwiYWNjb3VudCI6Iklzc3VlckNvbmZpZyJ9XX19XSwiYXJncyI6W3sibmFtZSI6InBhdXNlZCIsInR5cGUiOiJib29sIn1dfSx7Im5hbWUiOiJzZXRfY3JlX2NvbmZpZyIsImRvY3MiOlsiQWRtaW46IHNldCB3aGljaCBDUkUgd29ya2Zsb3cgKHZpYSB0aGUgS2V5c3RvbmUgRm9yd2FyZGVyKSBtYXkgY2FsbCBgb25fcmVwb3J0YC4iXSwiZGlzY3JpbWluYXRvciI6WzE2Miw1MiwxOTIsMTg1LDIzMiwxMDIsMTc4LDI0M10sImFjY291bnRzIjpbeyJuYW1lIjoiYWRtaW4iLCJ3cml0YWJsZSI6dHJ1ZSwic2lnbmVyIjp0cnVlLCJyZWxhdGlvbnMiOlsiaXNzdWVyX2NvbmZpZyJdfSx7Im5hbWUiOiJpc3N1ZXJfY29uZmlnIiwicGRhIjp7InNlZWRzIjpbeyJraW5kIjoiY29uc3QiLCJ2YWx1ZSI6WzEwNSwxMTUsMTE1LDExNywxMDEsMTE0XX0seyJraW5kIjoiYWNjb3VudCIsInBhdGgiOiJpc3N1ZXJfY29uZmlnLm1pbnQiLCJhY2NvdW50IjoiSXNzdWVyQ29uZmlnIn1dfX0seyJuYW1lIjoiY3JlX2NvbmZpZyIsIndyaXRhYmxlIjp0cnVlLCJwZGEiOnsic2VlZHMiOlt7ImtpbmQiOiJjb25zdCIsInZhbHVlIjpbOTksMTE0LDEwMV19LHsia2luZCI6ImFjY291bnQiLCJwYXRoIjoiaXNzdWVyX2NvbmZpZyJ9XX19LHsibmFtZSI6InN5c3RlbV9wcm9ncmFtIiwiYWRkcmVzcyI6IjExMTExMTExMTExMTExMTExMTExMTExMTExMTExMTExIn1dLCJhcmdzIjpbeyJuYW1lIjoicGFyYW1zIiwidHlwZSI6eyJkZWZpbmVkIjp7Im5hbWUiOiJDcmVDb25maWdQYXJhbXMifX19XX0seyJuYW1lIjoic3VibWl0X2F0dGVzdGF0aW9uIiwiZG9jcyI6WyJTMiArIFM1ICsgUzg6IHZlcmlmeSBhbmQgc3RvcmUgYSBzaWduZWQgYmFja2luZyByZXBvcnQsIGF1dG8tcGF1c2Ugb3IiLCJyZXN1bWUsIGFuZCBhcHBseSBzcGxpdCBjaGFuZ2VzIHRvIHRoZSBTY2FsZWQgVUkgbXVsdGlwbGllci4iXSwiZGlzY3JpbWluYXRvciI6WzIzOCwyMjAsMjU1LDEwNSwxODMsMjExLDQwLDgzXSwiYWNjb3VudHMiOlt7Im5hbWUiOiJpc3N1ZXJfY29uZmlnIiwid3JpdGFibGUiOnRydWUsInBkYSI6eyJzZWVkcyI6W3sia2luZCI6ImNvbnN0IiwidmFsdWUiOlsxMDUsMTE1LDExNSwxMTcsMTAxLDExNF19LHsia2luZCI6ImFjY291bnQiLCJwYXRoIjoibWludCJ9XX19LHsibmFtZSI6ImF0dGVzdGF0aW9uIiwid3JpdGFibGUiOnRydWUsInBkYSI6eyJzZWVkcyI6W3sia2luZCI6ImNvbnN0IiwidmFsdWUiOls5NywxMTYsMTE2LDEwMSwxMTUsMTE2LDk3LDExNiwxMDUsMTExLDExMF19LHsia2luZCI6ImFjY291bnQiLCJwYXRoIjoiaXNzdWVyX2NvbmZpZyJ9XX19LHsibmFtZSI6Im1pbnQiLCJkb2NzIjpbIldyaXRhYmxlIHNvIGEgY29ycG9yYXRlIGFjdGlvbiBjYW4gdXBkYXRlIHRoZSBTY2FsZWQgVUkgbXVsdGlwbGllci4iXSwid3JpdGFibGUiOnRydWUsInJlbGF0aW9ucyI6WyJpc3N1ZXJfY29uZmlnIl19LHsibmFtZSI6Imluc3RydWN0aW9ucyIsImFkZHJlc3MiOiJTeXN2YXIxbnN0cnVjdGlvbnMxMTExMTExMTExMTExMTExMTExMTExMTExIn0seyJuYW1lIjoidG9rZW5fcHJvZ3JhbSJ9XSwiYXJncyI6W3sibmFtZSI6InJlcG9ydCIsInR5cGUiOnsiZGVmaW5lZCI6eyJuYW1lIjoiQXR0ZXN0YXRpb25SZXBvcnQifX19XX1dLCJhY2NvdW50cyI6W3sibmFtZSI6IkF0dGVzdGF0aW9uIiwiZGlzY3JpbWluYXRvciI6WzE1MiwxMjUsMTgzLDg2LDM2LDE0NiwxMjEsNzNdfSx7Im5hbWUiOiJDcmVDb25maWciLCJkaXNjcmltaW5hdG9yIjpbMjIzLDE1NSwxMzUsMTYzLDM3LDgyLDEyNCw3OF19LHsibmFtZSI6Iklzc3VlckNvbmZpZyIsImRpc2NyaW1pbmF0b3IiOlsyMzgsMjQ0LDcxLDIyMSwyNTQsMTY5LDI0NywyMzddfV0sImV2ZW50cyI6W3sibmFtZSI6IkF0dGVzdGF0aW9uU3VibWl0dGVkIiwiZGlzY3JpbWluYXRvciI6WzE3NywyMTMsMTE3LDIyNSwxNjYsMTEsNTQsMjE4XX0seyJuYW1lIjoiQ29ycG9yYXRlQWN0aW9uIiwiZGlzY3JpbWluYXRvciI6WzIzNSw2MCwxMzYsMjE4LDEzMyw5NywxNDEsMTM2XX0seyJuYW1lIjoiTWludGVkIiwiZGlzY3JpbWluYXRvciI6WzE3NCwxMzEsMjEsNTcsODgsMTE3LDExNCwxMjFdfSx7Im5hbWUiOiJQYXVzZUNoYW5nZWQiLCJkaXNjcmltaW5hdG9yIjpbMjM4LDE4OCwyMTMsNzgsMTM0LDIwOSwxNzgsMjE4XX1dLCJlcnJvcnMiOlt7ImNvZGUiOjYwMDAsIm5hbWUiOiJVbmF1dGhvcml6ZWQiLCJtc2ciOiJTaWduZXIgaXMgbm90IGF1dGhvcml6ZWQgZm9yIHRoaXMgYWN0aW9uIn0seyJjb2RlIjo2MDAxLCJuYW1lIjoiSW52YWxpZFNpZ25hdHVyZSIsIm1zZyI6IkF0dGVzdGF0aW9uIHNpZ25hdHVyZSBpcyBtaXNzaW5nIG9yIGRvZXMgbm90IG1hdGNoIHRoZSBhdHRlc3RvciJ9LHsiY29kZSI6NjAwMiwibmFtZSI6IlN0YWxlQXR0ZXN0YXRpb24iLCJtc2ciOiJMYXRlc3QgYXR0ZXN0YXRpb24gaXMgb2xkZXIgdGhhbiB0aGUgc3RhbGVuZXNzIHdpbmRvdyJ9LHsiY29kZSI6NjAwMywibmFtZSI6IkV4Y2VlZHNCYWNraW5nIiwibXNnIjoiTWludCB3b3VsZCBleGNlZWQgYXR0ZXN0ZWQgYmFja2luZyJ9LHsiY29kZSI6NjAwNCwibmFtZSI6IkF1dG9QYXVzZWQiLCJtc2ciOiJNaW50aW5nIGlzIGF1dG8tcGF1c2VkOiBzdXBwbHkgZXhjZWVkcyBiYWNraW5nIn0seyJjb2RlIjo2MDA1LCJuYW1lIjoiQWRtaW5QYXVzZWQiLCJtc2ciOiJNaW50aW5nIGlzIHBhdXNlZCBieSB0aGUgYWRtaW4ifSx7ImNvZGUiOjYwMDYsIm5hbWUiOiJOb25jZVJlcGxheSIsIm1zZyI6IkF0dGVzdGF0aW9uIG5vbmNlIG11c3QgaW5jcmVhc2UifSx7ImNvZGUiOjYwMDcsIm5hbWUiOiJUaW1lc3RhbXBSZWdyZXNzaW9uIiwibXNnIjoiQXR0ZXN0YXRpb24gdGltZXN0YW1wIG11c3QgaW5jcmVhc2UifSx7ImNvZGUiOjYwMDgsIm5hbWUiOiJGdXR1cmVUaW1lc3RhbXAiLCJtc2ciOiJBdHRlc3RhdGlvbiB0aW1lc3RhbXAgaXMgaW4gdGhlIGZ1dHVyZSJ9LHsiY29kZSI6NjAwOSwibmFtZSI6IkRvbWFpbk1pc21hdGNoIiwibXNnIjoiQXR0ZXN0YXRpb24gaXMgZm9yIGEgZGlmZmVyZW50IGNsdXN0ZXIifSx7ImNvZGUiOjYwMTAsIm5hbWUiOiJNYXhTdXBwbHlNaXNtYXRjaCIsIm1zZyI6IlJlcG9ydGVkIG1heF9zdXBwbHkgZG9lcyBub3QgbWF0Y2ggdGhlIGJhY2tpbmcgcnVsZSJ9LHsiY29kZSI6NjAxMSwibmFtZSI6IkludmFsaWRTcGxpdEZhY3RvciIsIm1zZyI6IlNwbGl0IGZhY3RvciBtdXN0IGhhdmUgYSBub24temVybyBudW1lcmF0b3IgYW5kIGRlbm9taW5hdG9yIn0seyJjb2RlIjo2MDEyLCJuYW1lIjoiSW52YWxpZE1pbnRBdXRob3JpdHkiLCJtc2ciOiJQcm9ncmFtIFBEQSBtdXN0IGJlIHRoZSBtaW50IGF1dGhvcml0eSJ9LHsiY29kZSI6NjAxMywibmFtZSI6IkludmFsaWRGcmVlemVBdXRob3JpdHkiLCJtc2ciOiJGcmVlemUgYXV0aG9yaXR5IG11c3QgYmUgdGhlIHByb2dyYW0gUERBIG9yIHVuc2V0In0seyJjb2RlIjo2MDE0LCJuYW1lIjoiSW52YWxpZFNjYWxlZFVpQXV0aG9yaXR5IiwibXNnIjoiU2NhbGVkIFVJIEFtb3VudCBhdXRob3JpdHkgbXVzdCBiZSB0aGUgcHJvZ3JhbSBQREEifSx7ImNvZGUiOjYwMTUsIm5hbWUiOiJJbnZhbGlkTWludERlY2ltYWxzIiwibXNnIjoiVG9rZW4gbXVzdCB1c2UgNiBkZWNpbWFscyJ9LHsiY29kZSI6NjAxNiwibmFtZSI6IkludmFsaWRTdGFsZW5lc3MiLCJtc2ciOiJTdGFsZW5lc3Mgd2luZG93IG11c3QgYmUgZ3JlYXRlciB0aGFuIHplcm8ifSx7ImNvZGUiOjYwMTcsIm5hbWUiOiJPdmVyZmxvdyIsIm1zZyI6IkFyaXRobWV0aWMgb3ZlcmZsb3cifSx7ImNvZGUiOjYwMTgsIm5hbWUiOiJJbnZhbGlkRm9yd2FyZGVyIiwibXNnIjoiRm9yd2FyZGVyIHByb2dyYW0gb3Igc3RhdGUgZG9lcyBub3QgbWF0Y2ggdGhlIENSRSBjb25maWcifSx7ImNvZGUiOjYwMTksIm5hbWUiOiJJbnZhbGlkRm9yd2FyZGVyQXV0aG9yaXR5IiwibXNnIjoiZm9yd2FyZGVyX2F1dGhvcml0eSBpcyBub3QgdGhlIGZvcndhcmRlciBQREEgZm9yIHRoaXMgcmVjZWl2ZXIifSx7ImNvZGUiOjYwMjAsIm5hbWUiOiJJbnZhbGlkTWV0YWRhdGEiLCJtc2ciOiJSZXBvcnQgbWV0YWRhdGEgaXMgdG9vIHNob3J0In0seyJjb2RlIjo2MDIxLCJuYW1lIjoiVW5hdXRob3JpemVkV29ya2Zsb3ciLCJtc2ciOiJSZXBvcnQgd2FzIG5vdCBwcm9kdWNlZCBieSB0aGUgY29uZmlndXJlZCBDUkUgd29ya2Zsb3cifSx7ImNvZGUiOjYwMjIsIm5hbWUiOiJJbnZhbGlkUmVwb3J0UGF5bG9hZCIsIm1zZyI6IlJlcG9ydCBwYXlsb2FkIGlzIG5vdCBhIEJvcnNoIEF0dGVzdGF0aW9uUmVwb3J0In1dLCJ0eXBlcyI6W3sibmFtZSI6IkF0dGVzdGF0aW9uIiwiZG9jcyI6WyJTaW5nbGUgbGF0ZXN0IGF0dGVzdGF0aW9uIGZvciBhbiBpc3N1ZXIuIl0sInR5cGUiOnsia2luZCI6InN0cnVjdCIsImZpZWxkcyI6W3sibmFtZSI6Imlzc3VlciIsInR5cGUiOiJwdWJrZXkifSx7Im5hbWUiOiJub25jZSIsInR5cGUiOiJ1NjQifSx7Im5hbWUiOiJvYnNlcnZlZF9hdCIsInR5cGUiOiJpNjQifSx7Im5hbWUiOiJzaGFyZXNfaGVsZCIsInR5cGUiOiJ1NjQifSx7Im5hbWUiOiJzcGxpdF9udW0iLCJ0eXBlIjoidTMyIn0seyJuYW1lIjoic3BsaXRfZGVuIiwidHlwZSI6InUzMiJ9LHsibmFtZSI6Im90aGVyX2NoYWluX3N1cHBseSIsInR5cGUiOiJ1NjQifSx7Im5hbWUiOiJtYXhfc3VwcGx5IiwidHlwZSI6InU2NCJ9LHsibmFtZSI6InN1Ym1pdHRlZF9zbG90IiwidHlwZSI6InU2NCJ9LHsibmFtZSI6ImJ1bXAiLCJ0eXBlIjoidTgifV19fSx7Im5hbWUiOiJBdHRlc3RhdGlvblJlcG9ydCIsImRvY3MiOlsiU2lnbmVkIHBheWxvYWQgcHJvZHVjZWQgYnkgdGhlIENSRSB3b3JrZmxvdy4iLCIiLCJTaWduZWQgYnl0ZXMgKGxpdHRsZS1lbmRpYW4sIGZpeGVkIGxheW91dCwgYE1FU1NBR0VfTEVOYCBieXRlcyk6IiwiYFJFUE9SVF9ET01BSU4gfCBwcm9ncmFtX2lkIHwgaXNzdWVyX2NvbmZpZyB8IGNsdXN0ZXJfaWQgfCBub25jZSB8IG9ic2VydmVkX2F0IHwiLCJzaGFyZXNfaGVsZCB8IHNwbGl0X251bSB8IHNwbGl0X2RlbiB8IG90aGVyX2NoYWluX3N1cHBseSB8IG1heF9zdXBwbHlgIl0sInR5cGUiOnsia2luZCI6InN0cnVjdCIsImZpZWxkcyI6W3sibmFtZSI6ImNsdXN0ZXJfaWQiLCJ0eXBlIjoidTgifSx7Im5hbWUiOiJub25jZSIsInR5cGUiOiJ1NjQifSx7Im5hbWUiOiJvYnNlcnZlZF9hdCIsInR5cGUiOiJpNjQifSx7Im5hbWUiOiJzaGFyZXNfaGVsZCIsImRvY3MiOlsiQ3VzdG9kaWFuIGhvbGRpbmdzIGluIG1pY3JvLXNoYXJlcy4iXSwidHlwZSI6InU2NCJ9LHsibmFtZSI6InNwbGl0X251bSIsImRvY3MiOlsiQ3VtdWxhdGl2ZSBzcGxpdCBmYWN0b3Igc2luY2UgdG9rZW4gbGF1bmNoICgyLzEgYWZ0ZXIgYSAyLWZvci0xIHNwbGl0KS4iXSwidHlwZSI6InUzMiJ9LHsibmFtZSI6InNwbGl0X2RlbiIsInR5cGUiOiJ1MzIifSx7Im5hbWUiOiJvdGhlcl9jaGFpbl9zdXBwbHkiLCJkb2NzIjpbIlN1cHBseSBvbiBhbGwgbm9uLVNvbGFuYSBjaGFpbnMsIG5vcm1hbGl6ZWQgdG8gNiBkZWNpbWFscywgcm91bmRlZCB1cC4iXSwidHlwZSI6InU2NCJ9LHsibmFtZSI6Im1heF9zdXBwbHkiLCJ0eXBlIjoidTY0In1dfX0seyJuYW1lIjoiQXR0ZXN0YXRpb25TdWJtaXR0ZWQiLCJ0eXBlIjp7ImtpbmQiOiJzdHJ1Y3QiLCJmaWVsZHMiOlt7Im5hbWUiOiJpc3N1ZXIiLCJ0eXBlIjoicHVia2V5In0seyJuYW1lIjoibm9uY2UiLCJ0eXBlIjoidTY0In0seyJuYW1lIjoib2JzZXJ2ZWRfYXQiLCJ0eXBlIjoiaTY0In0seyJuYW1lIjoic2hhcmVzX2hlbGQiLCJ0eXBlIjoidTY0In0seyJuYW1lIjoic3BsaXRfbnVtIiwidHlwZSI6InUzMiJ9LHsibmFtZSI6InNwbGl0X2RlbiIsInR5cGUiOiJ1MzIifSx7Im5hbWUiOiJvdGhlcl9jaGFpbl9zdXBwbHkiLCJ0eXBlIjoidTY0In0seyJuYW1lIjoibWF4X3N1cHBseSIsInR5cGUiOiJ1NjQifSx7Im5hbWUiOiJjdXJyZW50X3N1cHBseSIsInR5cGUiOiJ1NjQifV19fSx7Im5hbWUiOiJDb3Jwb3JhdGVBY3Rpb24iLCJ0eXBlIjp7ImtpbmQiOiJzdHJ1Y3QiLCJmaWVsZHMiOlt7Im5hbWUiOiJpc3N1ZXIiLCJ0eXBlIjoicHVia2V5In0seyJuYW1lIjoib2xkX3NwbGl0X251bSIsInR5cGUiOiJ1MzIifSx7Im5hbWUiOiJvbGRfc3BsaXRfZGVuIiwidHlwZSI6InUzMiJ9LHsibmFtZSI6Im5ld19zcGxpdF9udW0iLCJ0eXBlIjoidTMyIn0seyJuYW1lIjoibmV3X3NwbGl0X2RlbiIsInR5cGUiOiJ1MzIifSx7Im5hbWUiOiJ1aV9tdWx0aXBsaWVyX3VwZGF0ZWQiLCJ0eXBlIjoiYm9vbCJ9XX19LHsibmFtZSI6IkNyZUNvbmZpZyIsImRvY3MiOlsiV2hpY2ggQ1JFIHdvcmtmbG93IG1heSBkZWxpdmVyIHJlcG9ydHMgdGhyb3VnaCB0aGUgS2V5c3RvbmUgRm9yd2FyZGVyIiwiKGBvbl9yZXBvcnRgKS4gU2VwYXJhdGUgUERBIHNvIGV4aXN0aW5nIGlzc3VlcnMgbmVlZCBubyBtaWdyYXRpb24uIl0sInR5cGUiOnsia2luZCI6InN0cnVjdCIsImZpZWxkcyI6W3sibmFtZSI6Imlzc3VlciIsInR5cGUiOiJwdWJrZXkifSx7Im5hbWUiOiJmb3J3YXJkZXJfcHJvZ3JhbSIsInR5cGUiOiJwdWJrZXkifSx7Im5hbWUiOiJmb3J3YXJkZXJfc3RhdGUiLCJ0eXBlIjoicHVia2V5In0seyJuYW1lIjoid29ya2Zsb3dfb3duZXIiLCJkb2NzIjpbIkNSRSB3b3JrZmxvdyBvd25lciAoRVZNIGFkZHJlc3MpLCBmcm9tIHJlcG9ydCBtZXRhZGF0YSBieXRlcyA0Mi4uNjIuIl0sInR5cGUiOnsiYXJyYXkiOlsidTgiLDIwXX19LHsibmFtZSI6IndvcmtmbG93X25hbWUiLCJkb2NzIjpbIkNSRSB3b3JrZmxvdyBuYW1lLCBmcm9tIHJlcG9ydCBtZXRhZGF0YSBieXRlcyAzMi4uNDIuIl0sInR5cGUiOnsiYXJyYXkiOlsidTgiLDEwXX19LHsibmFtZSI6ImJ1bXAiLCJ0eXBlIjoidTgifV19fSx7Im5hbWUiOiJDcmVDb25maWdQYXJhbXMiLCJ0eXBlIjp7ImtpbmQiOiJzdHJ1Y3QiLCJmaWVsZHMiOlt7Im5hbWUiOiJmb3J3YXJkZXJfcHJvZ3JhbSIsImRvY3MiOlsiS2V5c3RvbmUgRm9yd2FyZGVyIHByb2dyYW0gZm9yIHRoZSB0YXJnZXQgQ1JFIGVudmlyb25tZW50LiJdLCJ0eXBlIjoicHVia2V5In0seyJuYW1lIjoiZm9yd2FyZGVyX3N0YXRlIiwiZG9jcyI6WyJGb3J3YXJkZXIgc3RhdGUgYWNjb3VudDsgcGFydCBvZiB0aGUgZm9yd2FyZGVyIGF1dGhvcml0eSBQREEgc2VlZHMuIl0sInR5cGUiOiJwdWJrZXkifSx7Im5hbWUiOiJ3b3JrZmxvd19vd25lciIsImRvY3MiOlsiQ1JFIHdvcmtmbG93IG93bmVyIChFVk0gYWRkcmVzcykgYWxsb3dlZCB0byB3cml0ZSByZXBvcnRzLiJdLCJ0eXBlIjp7ImFycmF5IjpbInU4IiwyMF19fSx7Im5hbWUiOiJ3b3JrZmxvd19uYW1lIiwiZG9jcyI6WyJDUkUgd29ya2Zsb3cgbmFtZSBhcyBlbmNvZGVkIGluIHJlcG9ydCBtZXRhZGF0YSAoMTAgYnl0ZXMpLiJdLCJ0eXBlIjp7ImFycmF5IjpbInU4IiwxMF19fV19fSx7Im5hbWUiOiJJbml0SXNzdWVyUGFyYW1zIiwidHlwZSI6eyJraW5kIjoic3RydWN0IiwiZmllbGRzIjpbeyJuYW1lIjoibWludGVyIiwidHlwZSI6InB1YmtleSJ9LHsibmFtZSI6ImF0dGVzdG9yIiwidHlwZSI6InB1YmtleSJ9LHsibmFtZSI6InN0YWxlbmVzc19zZWNzIiwidHlwZSI6InUzMiJ9LHsibmFtZSI6ImNsdXN0ZXJfaWQiLCJ0eXBlIjoidTgifV19fSx7Im5hbWUiOiJJc3N1ZXJDb25maWciLCJkb2NzIjpbIklzc3VlciBjb25maWd1cmF0aW9uLiBJdHMgUERBIGlzIGFsc28gdGhlIHRva2VuJ3MgbWludCBhdXRob3JpdHksIiwiZnJlZXplIGF1dGhvcml0eSAob3Igbm9uZSksIGFuZCBTY2FsZWQgVUkgbXVsdGlwbGllciBhdXRob3JpdHkuIl0sInR5cGUiOnsia2luZCI6InN0cnVjdCIsImZpZWxkcyI6W3sibmFtZSI6ImFkbWluIiwidHlwZSI6InB1YmtleSJ9LHsibmFtZSI6Im1pbnRlciIsInR5cGUiOiJwdWJrZXkifSx7Im5hbWUiOiJhdHRlc3RvciIsImRvY3MiOlsiRWQyNTUxOSBrZXkgd2hvc2Ugc2lnbmF0dXJlIGV2ZXJ5IGF0dGVzdGF0aW9uIHJlcG9ydCBtdXN0IGNhcnJ5LiJdLCJ0eXBlIjoicHVia2V5In0seyJuYW1lIjoibWludCIsInR5cGUiOiJwdWJrZXkifSx7Im5hbWUiOiJzdGFsZW5lc3Nfc2VjcyIsInR5cGUiOiJ1MzIifSx7Im5hbWUiOiJjbHVzdGVyX2lkIiwiZG9jcyI6WyJJZGVudGlmaWVzIHRoZSBjbHVzdGVyIGEgcmVwb3J0IGlzIG1lYW50IGZvciAoZG9tYWluIHNlcGFyYXRpb24pLiJdLCJ0eXBlIjoidTgifSx7Im5hbWUiOiJhdXRvX3BhdXNlZCIsImRvY3MiOlsiU2V0IGJ5IGF0dGVzdGF0aW9uczogc3VwcGx5IGV4Y2VlZGVkIGJhY2tpbmcuIENsZWFyZWQgb25seSBieSBhdHRlc3RhdGlvbnMuIl0sInR5cGUiOiJib29sIn0seyJuYW1lIjoiYWRtaW5fcGF1c2VkIiwiZG9jcyI6WyJTZXQgYnkgdGhlIGFkbWluLiBOZXZlciB0b3VjaGVkIGJ5IGF0dGVzdGF0aW9ucy4iXSwidHlwZSI6ImJvb2wifSx7Im5hbWUiOiJzY2FsZWRfdWkiLCJkb2NzIjpbIlRoZSBtaW50IGhhcyB0aGUgVG9rZW4tMjAyMiBTY2FsZWQgVUkgQW1vdW50IGV4dGVuc2lvbiBjb250cm9sbGVkIGJ5IHRoaXMgUERBLiJdLCJ0eXBlIjoiYm9vbCJ9LHsibmFtZSI6ImJ1bXAiLCJ0eXBlIjoidTgifV19fSx7Im5hbWUiOiJNaW50ZWQiLCJ0eXBlIjp7ImtpbmQiOiJzdHJ1Y3QiLCJmaWVsZHMiOlt7Im5hbWUiOiJpc3N1ZXIiLCJ0eXBlIjoicHVia2V5In0seyJuYW1lIjoiZGVzdGluYXRpb24iLCJ0eXBlIjoicHVia2V5In0seyJuYW1lIjoiYW1vdW50IiwidHlwZSI6InU2NCJ9LHsibmFtZSI6Im5ld19zdXBwbHkiLCJ0eXBlIjoidTY0In0seyJuYW1lIjoibWF4X3N1cHBseSIsInR5cGUiOiJ1NjQifSx7Im5hbWUiOiJhdHRlc3RhdGlvbl9ub25jZSIsInR5cGUiOiJ1NjQifV19fSx7Im5hbWUiOiJQYXVzZUNoYW5nZWQiLCJ0eXBlIjp7ImtpbmQiOiJzdHJ1Y3QiLCJmaWVsZHMiOlt7Im5hbWUiOiJpc3N1ZXIiLCJ0eXBlIjoicHVia2V5In0seyJuYW1lIjoiYXV0b19wYXVzZWQiLCJ0eXBlIjoiYm9vbCJ9LHsibmFtZSI6ImFkbWluX3BhdXNlZCIsInR5cGUiOiJib29sIn1dfX1dfQ=='

const DISCRIMINATOR_SIZE = 8

const expectDiscriminator = (label: string, expected: Uint8Array, data: Uint8Array): Uint8Array => {
  if (data.length < DISCRIMINATOR_SIZE) {
    throw new Error(`${label}: data too short for discriminator (${data.length} bytes)`)
  }
  for (let i = 0; i < DISCRIMINATOR_SIZE; i++) {
    if (data[i] !== expected[i]) {
      throw new Error(`${label}: discriminator mismatch`)
    }
  }
  return data.subarray(DISCRIMINATOR_SIZE)
}

export type Attestation = {
  issuer: Address
  nonce: bigint
  observedAt: bigint
  sharesHeld: bigint
  splitNum: number
  splitDen: number
  otherChainSupply: bigint
  maxSupply: bigint
  submittedSlot: bigint
  bump: number
}

export const attestationCodec = getStructCodec([
  ['issuer', getAddressCodec()],
  ['nonce', getU64Codec()],
  ['observedAt', getI64Codec()],
  ['sharesHeld', getU64Codec()],
  ['splitNum', getU32Codec()],
  ['splitDen', getU32Codec()],
  ['otherChainSupply', getU64Codec()],
  ['maxSupply', getU64Codec()],
  ['submittedSlot', getU64Codec()],
  ['bump', getU8Codec()],
])

export type AttestationReport = {
  clusterId: number
  nonce: bigint
  observedAt: bigint
  sharesHeld: bigint
  splitNum: number
  splitDen: number
  otherChainSupply: bigint
  maxSupply: bigint
}

export const attestationReportCodec = getStructCodec([
  ['clusterId', getU8Codec()],
  ['nonce', getU64Codec()],
  ['observedAt', getI64Codec()],
  ['sharesHeld', getU64Codec()],
  ['splitNum', getU32Codec()],
  ['splitDen', getU32Codec()],
  ['otherChainSupply', getU64Codec()],
  ['maxSupply', getU64Codec()],
])

export type AttestationSubmitted = {
  issuer: Address
  nonce: bigint
  observedAt: bigint
  sharesHeld: bigint
  splitNum: number
  splitDen: number
  otherChainSupply: bigint
  maxSupply: bigint
  currentSupply: bigint
}

export const attestationSubmittedCodec = getStructCodec([
  ['issuer', getAddressCodec()],
  ['nonce', getU64Codec()],
  ['observedAt', getI64Codec()],
  ['sharesHeld', getU64Codec()],
  ['splitNum', getU32Codec()],
  ['splitDen', getU32Codec()],
  ['otherChainSupply', getU64Codec()],
  ['maxSupply', getU64Codec()],
  ['currentSupply', getU64Codec()],
])

export type CorporateAction = {
  issuer: Address
  oldSplitNum: number
  oldSplitDen: number
  newSplitNum: number
  newSplitDen: number
  uiMultiplierUpdated: boolean
}

export const corporateActionCodec = getStructCodec([
  ['issuer', getAddressCodec()],
  ['oldSplitNum', getU32Codec()],
  ['oldSplitDen', getU32Codec()],
  ['newSplitNum', getU32Codec()],
  ['newSplitDen', getU32Codec()],
  ['uiMultiplierUpdated', getBooleanCodec()],
])

export type CreConfig = {
  issuer: Address
  forwarderProgram: Address
  forwarderState: Address
  workflowOwner: number[]
  workflowName: number[]
  bump: number
}

export const creConfigCodec = getStructCodec([
  ['issuer', getAddressCodec()],
  ['forwarderProgram', getAddressCodec()],
  ['forwarderState', getAddressCodec()],
  ['workflowOwner', getArrayCodec(getU8Codec(), { size: 20 })],
  ['workflowName', getArrayCodec(getU8Codec(), { size: 10 })],
  ['bump', getU8Codec()],
])

export type CreConfigParams = {
  forwarderProgram: Address
  forwarderState: Address
  workflowOwner: number[]
  workflowName: number[]
}

export const creConfigParamsCodec = getStructCodec([
  ['forwarderProgram', getAddressCodec()],
  ['forwarderState', getAddressCodec()],
  ['workflowOwner', getArrayCodec(getU8Codec(), { size: 20 })],
  ['workflowName', getArrayCodec(getU8Codec(), { size: 10 })],
])

export type InitIssuerParams = {
  minter: Address
  attestor: Address
  stalenessSecs: number
  clusterId: number
}

export const initIssuerParamsCodec = getStructCodec([
  ['minter', getAddressCodec()],
  ['attestor', getAddressCodec()],
  ['stalenessSecs', getU32Codec()],
  ['clusterId', getU8Codec()],
])

export type IssuerConfig = {
  admin: Address
  minter: Address
  attestor: Address
  mint: Address
  stalenessSecs: number
  clusterId: number
  autoPaused: boolean
  adminPaused: boolean
  scaledUi: boolean
  bump: number
}

export const issuerConfigCodec = getStructCodec([
  ['admin', getAddressCodec()],
  ['minter', getAddressCodec()],
  ['attestor', getAddressCodec()],
  ['mint', getAddressCodec()],
  ['stalenessSecs', getU32Codec()],
  ['clusterId', getU8Codec()],
  ['autoPaused', getBooleanCodec()],
  ['adminPaused', getBooleanCodec()],
  ['scaledUi', getBooleanCodec()],
  ['bump', getU8Codec()],
])

export type Minted = {
  issuer: Address
  destination: Address
  amount: bigint
  newSupply: bigint
  maxSupply: bigint
  attestationNonce: bigint
}

export const mintedCodec = getStructCodec([
  ['issuer', getAddressCodec()],
  ['destination', getAddressCodec()],
  ['amount', getU64Codec()],
  ['newSupply', getU64Codec()],
  ['maxSupply', getU64Codec()],
  ['attestationNonce', getU64Codec()],
])

export type PauseChanged = {
  issuer: Address
  autoPaused: boolean
  adminPaused: boolean
}

export const pauseChangedCodec = getStructCodec([
  ['issuer', getAddressCodec()],
  ['autoPaused', getBooleanCodec()],
  ['adminPaused', getBooleanCodec()],
])

export const ACCOUNT_ATTESTATION_DISCRIMINATOR = new Uint8Array([152, 125, 183, 86, 36, 146, 121, 73])

/**
 * Decodes raw Attestation account data (with its 8-byte discriminator) into Attestation.
 * Pure helper — there is no read capability; obtain the account bytes elsewhere.
 */
export const decodeAttestationAccount = (data: Uint8Array): Attestation =>
  attestationCodec.decode(expectDiscriminator('account Attestation', ACCOUNT_ATTESTATION_DISCRIMINATOR, data)) as Attestation

export const ACCOUNT_CRE_CONFIG_DISCRIMINATOR = new Uint8Array([223, 155, 135, 163, 37, 82, 124, 78])

/**
 * Decodes raw CreConfig account data (with its 8-byte discriminator) into CreConfig.
 * Pure helper — there is no read capability; obtain the account bytes elsewhere.
 */
export const decodeCreConfigAccount = (data: Uint8Array): CreConfig =>
  creConfigCodec.decode(expectDiscriminator('account CreConfig', ACCOUNT_CRE_CONFIG_DISCRIMINATOR, data)) as CreConfig

export const ACCOUNT_ISSUER_CONFIG_DISCRIMINATOR = new Uint8Array([238, 244, 71, 221, 254, 169, 247, 237])

/**
 * Decodes raw IssuerConfig account data (with its 8-byte discriminator) into IssuerConfig.
 * Pure helper — there is no read capability; obtain the account bytes elsewhere.
 */
export const decodeIssuerConfigAccount = (data: Uint8Array): IssuerConfig =>
  issuerConfigCodec.decode(expectDiscriminator('account IssuerConfig', ACCOUNT_ISSUER_CONFIG_DISCRIMINATOR, data)) as IssuerConfig

export const EVENT_ATTESTATION_SUBMITTED_DISCRIMINATOR = new Uint8Array([177, 213, 117, 225, 166, 11, 54, 218])

/**
 * Decodes raw AttestationSubmitted event data (with its 8-byte discriminator) into AttestationSubmitted.
 */
export const decodeAttestationSubmittedEvent = (data: Uint8Array): AttestationSubmitted =>
  attestationSubmittedCodec.decode(expectDiscriminator('event AttestationSubmitted', EVENT_ATTESTATION_SUBMITTED_DISCRIMINATOR, data)) as AttestationSubmitted

export const EVENT_CORPORATE_ACTION_DISCRIMINATOR = new Uint8Array([235, 60, 136, 218, 133, 97, 141, 136])

/**
 * Decodes raw CorporateAction event data (with its 8-byte discriminator) into CorporateAction.
 */
export const decodeCorporateActionEvent = (data: Uint8Array): CorporateAction =>
  corporateActionCodec.decode(expectDiscriminator('event CorporateAction', EVENT_CORPORATE_ACTION_DISCRIMINATOR, data)) as CorporateAction

export const EVENT_MINTED_DISCRIMINATOR = new Uint8Array([174, 131, 21, 57, 88, 117, 114, 121])

/**
 * Decodes raw Minted event data (with its 8-byte discriminator) into Minted.
 */
export const decodeMintedEvent = (data: Uint8Array): Minted =>
  mintedCodec.decode(expectDiscriminator('event Minted', EVENT_MINTED_DISCRIMINATOR, data)) as Minted

export const EVENT_PAUSE_CHANGED_DISCRIMINATOR = new Uint8Array([238, 188, 213, 78, 134, 209, 178, 218])

/**
 * Decodes raw PauseChanged event data (with its 8-byte discriminator) into PauseChanged.
 */
export const decodePauseChangedEvent = (data: Uint8Array): PauseChanged =>
  pauseChangedCodec.decode(expectDiscriminator('event PauseChanged', EVENT_PAUSE_CHANGED_DISCRIMINATOR, data)) as PauseChanged

export const parseAnyAccount = (data: Uint8Array): Attestation | CreConfig | IssuerConfig => {
  const disc = data.subarray(0, DISCRIMINATOR_SIZE)
  const matches = (expected: Uint8Array) => expected.every((b, i) => disc[i] === b)
  if (matches(ACCOUNT_ATTESTATION_DISCRIMINATOR)) return decodeAttestationAccount(data)
  if (matches(ACCOUNT_CRE_CONFIG_DISCRIMINATOR)) return decodeCreConfigAccount(data)
  if (matches(ACCOUNT_ISSUER_CONFIG_DISCRIMINATOR)) return decodeIssuerConfigAccount(data)
  throw new Error(`unknown account discriminator: [${Array.from(disc).join(', ')}]`)
}

export const parseAnyEvent = (data: Uint8Array): AttestationSubmitted | CorporateAction | Minted | PauseChanged => {
  const disc = data.subarray(0, DISCRIMINATOR_SIZE)
  const matches = (expected: Uint8Array) => expected.every((b, i) => disc[i] === b)
  if (matches(EVENT_ATTESTATION_SUBMITTED_DISCRIMINATOR)) return decodeAttestationSubmittedEvent(data)
  if (matches(EVENT_CORPORATE_ACTION_DISCRIMINATOR)) return decodeCorporateActionEvent(data)
  if (matches(EVENT_MINTED_DISCRIMINATOR)) return decodeMintedEvent(data)
  if (matches(EVENT_PAUSE_CHANGED_DISCRIMINATOR)) return decodePauseChangedEvent(data)
  throw new Error(`unknown event discriminator: [${Array.from(disc).join(', ')}]`)
}

/**
 * Optional filter values for AttestationSubmitted log triggers. Set fields in one row to
 * AND those predicates. Multiple rows are OR alternatives, but current trigger
 * configuration supports only a single row. Leave unset for wildcard. Only top-level
 * scalar fields with supported subkey encodings are auto-filterable — nested
 * structs, vecs, arrays, bool, u128, and i128 need a manual SubkeyConfig.
 */
export type AttestationSubmittedFilters = {
  issuer?: Address | null
  nonce?: bigint | null
  observedAt?: bigint | null
  sharesHeld?: bigint | null
  splitNum?: number | null
  splitDen?: number | null
  otherChainSupply?: bigint | null
  maxSupply?: bigint | null
  currentSupply?: bigint | null
}

export const encodeAttestationSubmittedSubkeys = (filters: AttestationSubmittedFilters[]): SolanaSubkeyConfigJson[] => {
  if (filters.length > 1) {
    throw new Error('multiple filter rows are not supported for AttestationSubmitted; provide a single filter row')
  }
  const issuerComparers: SolanaValueComparatorJson[] = []
  const nonceComparers: SolanaValueComparatorJson[] = []
  const observedAtComparers: SolanaValueComparatorJson[] = []
  const sharesHeldComparers: SolanaValueComparatorJson[] = []
  const splitNumComparers: SolanaValueComparatorJson[] = []
  const splitDenComparers: SolanaValueComparatorJson[] = []
  const otherChainSupplyComparers: SolanaValueComparatorJson[] = []
  const maxSupplyComparers: SolanaValueComparatorJson[] = []
  const currentSupplyComparers: SolanaValueComparatorJson[] = []
  for (const f of filters) {
    if (f.issuer != null) {
      issuerComparers.push({
        operator: 'COMPARISON_OPERATOR_EQ',
        value: bytesToBase64(solanaAddressToBytes(f.issuer)),
      })
    }
    if (f.nonce != null) {
      nonceComparers.push({
        operator: 'COMPARISON_OPERATOR_EQ',
        value: bytesToBase64(prepareSubkeyValue(f.nonce)),
      })
    }
    if (f.observedAt != null) {
      observedAtComparers.push({
        operator: 'COMPARISON_OPERATOR_EQ',
        value: bytesToBase64(prepareSubkeyValue(f.observedAt)),
      })
    }
    if (f.sharesHeld != null) {
      sharesHeldComparers.push({
        operator: 'COMPARISON_OPERATOR_EQ',
        value: bytesToBase64(prepareSubkeyValue(f.sharesHeld)),
      })
    }
    if (f.splitNum != null) {
      splitNumComparers.push({
        operator: 'COMPARISON_OPERATOR_EQ',
        value: bytesToBase64(prepareSubkeyValue(f.splitNum)),
      })
    }
    if (f.splitDen != null) {
      splitDenComparers.push({
        operator: 'COMPARISON_OPERATOR_EQ',
        value: bytesToBase64(prepareSubkeyValue(f.splitDen)),
      })
    }
    if (f.otherChainSupply != null) {
      otherChainSupplyComparers.push({
        operator: 'COMPARISON_OPERATOR_EQ',
        value: bytesToBase64(prepareSubkeyValue(f.otherChainSupply)),
      })
    }
    if (f.maxSupply != null) {
      maxSupplyComparers.push({
        operator: 'COMPARISON_OPERATOR_EQ',
        value: bytesToBase64(prepareSubkeyValue(f.maxSupply)),
      })
    }
    if (f.currentSupply != null) {
      currentSupplyComparers.push({
        operator: 'COMPARISON_OPERATOR_EQ',
        value: bytesToBase64(prepareSubkeyValue(f.currentSupply)),
      })
    }
  }
  const subkeys: SolanaSubkeyConfigJson[] = []
  if (issuerComparers.length > 0) {
    subkeys.push({ path: ['Issuer'], comparers: issuerComparers })
  }
  if (nonceComparers.length > 0) {
    subkeys.push({ path: ['Nonce'], comparers: nonceComparers })
  }
  if (observedAtComparers.length > 0) {
    subkeys.push({ path: ['ObservedAt'], comparers: observedAtComparers })
  }
  if (sharesHeldComparers.length > 0) {
    subkeys.push({ path: ['SharesHeld'], comparers: sharesHeldComparers })
  }
  if (splitNumComparers.length > 0) {
    subkeys.push({ path: ['SplitNum'], comparers: splitNumComparers })
  }
  if (splitDenComparers.length > 0) {
    subkeys.push({ path: ['SplitDen'], comparers: splitDenComparers })
  }
  if (otherChainSupplyComparers.length > 0) {
    subkeys.push({ path: ['OtherChainSupply'], comparers: otherChainSupplyComparers })
  }
  if (maxSupplyComparers.length > 0) {
    subkeys.push({ path: ['MaxSupply'], comparers: maxSupplyComparers })
  }
  if (currentSupplyComparers.length > 0) {
    subkeys.push({ path: ['CurrentSupply'], comparers: currentSupplyComparers })
  }
  return subkeys
}

/**
 * Optional filter values for CorporateAction log triggers. Set fields in one row to
 * AND those predicates. Multiple rows are OR alternatives, but current trigger
 * configuration supports only a single row. Leave unset for wildcard. Only top-level
 * scalar fields with supported subkey encodings are auto-filterable — nested
 * structs, vecs, arrays, bool, u128, and i128 need a manual SubkeyConfig.
 */
export type CorporateActionFilters = {
  issuer?: Address | null
  oldSplitNum?: number | null
  oldSplitDen?: number | null
  newSplitNum?: number | null
  newSplitDen?: number | null
}

export const encodeCorporateActionSubkeys = (filters: CorporateActionFilters[]): SolanaSubkeyConfigJson[] => {
  if (filters.length > 1) {
    throw new Error('multiple filter rows are not supported for CorporateAction; provide a single filter row')
  }
  const issuerComparers: SolanaValueComparatorJson[] = []
  const oldSplitNumComparers: SolanaValueComparatorJson[] = []
  const oldSplitDenComparers: SolanaValueComparatorJson[] = []
  const newSplitNumComparers: SolanaValueComparatorJson[] = []
  const newSplitDenComparers: SolanaValueComparatorJson[] = []
  for (const f of filters) {
    if (f.issuer != null) {
      issuerComparers.push({
        operator: 'COMPARISON_OPERATOR_EQ',
        value: bytesToBase64(solanaAddressToBytes(f.issuer)),
      })
    }
    if (f.oldSplitNum != null) {
      oldSplitNumComparers.push({
        operator: 'COMPARISON_OPERATOR_EQ',
        value: bytesToBase64(prepareSubkeyValue(f.oldSplitNum)),
      })
    }
    if (f.oldSplitDen != null) {
      oldSplitDenComparers.push({
        operator: 'COMPARISON_OPERATOR_EQ',
        value: bytesToBase64(prepareSubkeyValue(f.oldSplitDen)),
      })
    }
    if (f.newSplitNum != null) {
      newSplitNumComparers.push({
        operator: 'COMPARISON_OPERATOR_EQ',
        value: bytesToBase64(prepareSubkeyValue(f.newSplitNum)),
      })
    }
    if (f.newSplitDen != null) {
      newSplitDenComparers.push({
        operator: 'COMPARISON_OPERATOR_EQ',
        value: bytesToBase64(prepareSubkeyValue(f.newSplitDen)),
      })
    }
  }
  const subkeys: SolanaSubkeyConfigJson[] = []
  if (issuerComparers.length > 0) {
    subkeys.push({ path: ['Issuer'], comparers: issuerComparers })
  }
  if (oldSplitNumComparers.length > 0) {
    subkeys.push({ path: ['OldSplitNum'], comparers: oldSplitNumComparers })
  }
  if (oldSplitDenComparers.length > 0) {
    subkeys.push({ path: ['OldSplitDen'], comparers: oldSplitDenComparers })
  }
  if (newSplitNumComparers.length > 0) {
    subkeys.push({ path: ['NewSplitNum'], comparers: newSplitNumComparers })
  }
  if (newSplitDenComparers.length > 0) {
    subkeys.push({ path: ['NewSplitDen'], comparers: newSplitDenComparers })
  }
  return subkeys
}

/**
 * Optional filter values for Minted log triggers. Set fields in one row to
 * AND those predicates. Multiple rows are OR alternatives, but current trigger
 * configuration supports only a single row. Leave unset for wildcard. Only top-level
 * scalar fields with supported subkey encodings are auto-filterable — nested
 * structs, vecs, arrays, bool, u128, and i128 need a manual SubkeyConfig.
 */
export type MintedFilters = {
  issuer?: Address | null
  destination?: Address | null
  amount?: bigint | null
  newSupply?: bigint | null
  maxSupply?: bigint | null
  attestationNonce?: bigint | null
}

export const encodeMintedSubkeys = (filters: MintedFilters[]): SolanaSubkeyConfigJson[] => {
  if (filters.length > 1) {
    throw new Error('multiple filter rows are not supported for Minted; provide a single filter row')
  }
  const issuerComparers: SolanaValueComparatorJson[] = []
  const destinationComparers: SolanaValueComparatorJson[] = []
  const amountComparers: SolanaValueComparatorJson[] = []
  const newSupplyComparers: SolanaValueComparatorJson[] = []
  const maxSupplyComparers: SolanaValueComparatorJson[] = []
  const attestationNonceComparers: SolanaValueComparatorJson[] = []
  for (const f of filters) {
    if (f.issuer != null) {
      issuerComparers.push({
        operator: 'COMPARISON_OPERATOR_EQ',
        value: bytesToBase64(solanaAddressToBytes(f.issuer)),
      })
    }
    if (f.destination != null) {
      destinationComparers.push({
        operator: 'COMPARISON_OPERATOR_EQ',
        value: bytesToBase64(solanaAddressToBytes(f.destination)),
      })
    }
    if (f.amount != null) {
      amountComparers.push({
        operator: 'COMPARISON_OPERATOR_EQ',
        value: bytesToBase64(prepareSubkeyValue(f.amount)),
      })
    }
    if (f.newSupply != null) {
      newSupplyComparers.push({
        operator: 'COMPARISON_OPERATOR_EQ',
        value: bytesToBase64(prepareSubkeyValue(f.newSupply)),
      })
    }
    if (f.maxSupply != null) {
      maxSupplyComparers.push({
        operator: 'COMPARISON_OPERATOR_EQ',
        value: bytesToBase64(prepareSubkeyValue(f.maxSupply)),
      })
    }
    if (f.attestationNonce != null) {
      attestationNonceComparers.push({
        operator: 'COMPARISON_OPERATOR_EQ',
        value: bytesToBase64(prepareSubkeyValue(f.attestationNonce)),
      })
    }
  }
  const subkeys: SolanaSubkeyConfigJson[] = []
  if (issuerComparers.length > 0) {
    subkeys.push({ path: ['Issuer'], comparers: issuerComparers })
  }
  if (destinationComparers.length > 0) {
    subkeys.push({ path: ['Destination'], comparers: destinationComparers })
  }
  if (amountComparers.length > 0) {
    subkeys.push({ path: ['Amount'], comparers: amountComparers })
  }
  if (newSupplyComparers.length > 0) {
    subkeys.push({ path: ['NewSupply'], comparers: newSupplyComparers })
  }
  if (maxSupplyComparers.length > 0) {
    subkeys.push({ path: ['MaxSupply'], comparers: maxSupplyComparers })
  }
  if (attestationNonceComparers.length > 0) {
    subkeys.push({ path: ['AttestationNonce'], comparers: attestationNonceComparers })
  }
  return subkeys
}

/**
 * Optional filter values for PauseChanged log triggers. Set fields in one row to
 * AND those predicates. Multiple rows are OR alternatives, but current trigger
 * configuration supports only a single row. Leave unset for wildcard. Only top-level
 * scalar fields with supported subkey encodings are auto-filterable — nested
 * structs, vecs, arrays, bool, u128, and i128 need a manual SubkeyConfig.
 */
export type PauseChangedFilters = {
  issuer?: Address | null
}

export const encodePauseChangedSubkeys = (filters: PauseChangedFilters[]): SolanaSubkeyConfigJson[] => {
  if (filters.length > 1) {
    throw new Error('multiple filter rows are not supported for PauseChanged; provide a single filter row')
  }
  const issuerComparers: SolanaValueComparatorJson[] = []
  for (const f of filters) {
    if (f.issuer != null) {
      issuerComparers.push({
        operator: 'COMPARISON_OPERATOR_EQ',
        value: bytesToBase64(solanaAddressToBytes(f.issuer)),
      })
    }
  }
  const subkeys: SolanaSubkeyConfigJson[] = []
  if (issuerComparers.length > 0) {
    subkeys.push({ path: ['Issuer'], comparers: issuerComparers })
  }
  return subkeys
}

export class Lantern {
  readonly programId: Uint8Array

  // The program ID is baked into the IDL, so it defaults to the generated
  // const — unlike EVM bindings where the address is a runtime value.
  constructor(
    private readonly client: SolanaClient,
    programId: string | Uint8Array = LANTERN_PROGRAM_ID,
  ) {
    this.programId = typeof programId === 'string' ? solanaAddressToBytes(programId) : programId
  }

  /**
   * Publishes a pre-encoded Borsh payload through the CRE signer to this
   * program's on_report entrypoint via the keystone-forwarder.
   *
   * remainingAccounts must follow the keystone-forwarder account layout:
   *   - Index 0: forwarderState – the forwarder program's state account.
   *   - Index 1: forwarderAuthority – PDA derived from seeds
   *     ["forwarder", forwarderState, receiverProgram] under the forwarder program ID.
   *   - Index 2+: receiver-specific accounts required by the target program.
   *
   * The full account list is hashed (via calculateAccountsHash) into the report.
   * The on-chain forwarder strips indices 0 and 1 before CPI-ing into the
   * receiver, so they must be present and correctly ordered.
   */
  writeReport(
    runtime: Runtime<unknown>,
    payload: Uint8Array,
    remainingAccounts: SolanaAccountMeta[],
    computeConfig?: SolanaComputeConfig,
  ) {
    const report = runtime
      .report(
        prepareSolanaReportRequest(
          encodeForwarderReport({
            accountHash: calculateAccountsHash(remainingAccounts),
            payload,
          }),
        ),
      )
      .result()

    return this.client
      .writeReport(runtime, {
        remainingAccounts: solanaAccountMetasToJson(remainingAccounts),
        receiver: bytesToHex(this.programId),
        computeConfig,
        report,
      })
      .result()
  }

  /**
   * Publishes a Borsh Vec of pre-encoded element payloads (mirrors Go's
   * WriteReportFromBorshEncodedVec). Each element must already be fully
   * serialized for one Vec item on the wire.
   */
  writeReportFromBorshEncodedVec(
    runtime: Runtime<unknown>,
    elementPayloads: Uint8Array[],
    remainingAccounts: SolanaAccountMeta[],
    computeConfig?: SolanaComputeConfig,
  ) {
    return this.writeReport(runtime, encodeBorshVecU32(elementPayloads), remainingAccounts, computeConfig)
  }

  writeReportFromAttestation(
    runtime: Runtime<unknown>,
    input: Attestation,
    remainingAccounts: SolanaAccountMeta[],
    computeConfig?: SolanaComputeConfig,
  ) {
    return this.writeReport(runtime, new Uint8Array(attestationCodec.encode(input)), remainingAccounts, computeConfig)
  }

  writeReportFromAttestations(
    runtime: Runtime<unknown>,
    inputs: Attestation[],
    remainingAccounts: SolanaAccountMeta[],
    computeConfig?: SolanaComputeConfig,
  ) {
    return this.writeReportFromBorshEncodedVec(
      runtime,
      inputs.map((input) => new Uint8Array(attestationCodec.encode(input))),
      remainingAccounts,
      computeConfig,
    )
  }

  writeReportFromAttestationReport(
    runtime: Runtime<unknown>,
    input: AttestationReport,
    remainingAccounts: SolanaAccountMeta[],
    computeConfig?: SolanaComputeConfig,
  ) {
    return this.writeReport(runtime, new Uint8Array(attestationReportCodec.encode(input)), remainingAccounts, computeConfig)
  }

  writeReportFromAttestationReports(
    runtime: Runtime<unknown>,
    inputs: AttestationReport[],
    remainingAccounts: SolanaAccountMeta[],
    computeConfig?: SolanaComputeConfig,
  ) {
    return this.writeReportFromBorshEncodedVec(
      runtime,
      inputs.map((input) => new Uint8Array(attestationReportCodec.encode(input))),
      remainingAccounts,
      computeConfig,
    )
  }

  writeReportFromAttestationSubmitted(
    runtime: Runtime<unknown>,
    input: AttestationSubmitted,
    remainingAccounts: SolanaAccountMeta[],
    computeConfig?: SolanaComputeConfig,
  ) {
    return this.writeReport(runtime, new Uint8Array(attestationSubmittedCodec.encode(input)), remainingAccounts, computeConfig)
  }

  writeReportFromAttestationSubmitteds(
    runtime: Runtime<unknown>,
    inputs: AttestationSubmitted[],
    remainingAccounts: SolanaAccountMeta[],
    computeConfig?: SolanaComputeConfig,
  ) {
    return this.writeReportFromBorshEncodedVec(
      runtime,
      inputs.map((input) => new Uint8Array(attestationSubmittedCodec.encode(input))),
      remainingAccounts,
      computeConfig,
    )
  }

  writeReportFromCorporateAction(
    runtime: Runtime<unknown>,
    input: CorporateAction,
    remainingAccounts: SolanaAccountMeta[],
    computeConfig?: SolanaComputeConfig,
  ) {
    return this.writeReport(runtime, new Uint8Array(corporateActionCodec.encode(input)), remainingAccounts, computeConfig)
  }

  writeReportFromCorporateActions(
    runtime: Runtime<unknown>,
    inputs: CorporateAction[],
    remainingAccounts: SolanaAccountMeta[],
    computeConfig?: SolanaComputeConfig,
  ) {
    return this.writeReportFromBorshEncodedVec(
      runtime,
      inputs.map((input) => new Uint8Array(corporateActionCodec.encode(input))),
      remainingAccounts,
      computeConfig,
    )
  }

  writeReportFromCreConfig(
    runtime: Runtime<unknown>,
    input: CreConfig,
    remainingAccounts: SolanaAccountMeta[],
    computeConfig?: SolanaComputeConfig,
  ) {
    return this.writeReport(runtime, new Uint8Array(creConfigCodec.encode(input)), remainingAccounts, computeConfig)
  }

  writeReportFromCreConfigs(
    runtime: Runtime<unknown>,
    inputs: CreConfig[],
    remainingAccounts: SolanaAccountMeta[],
    computeConfig?: SolanaComputeConfig,
  ) {
    return this.writeReportFromBorshEncodedVec(
      runtime,
      inputs.map((input) => new Uint8Array(creConfigCodec.encode(input))),
      remainingAccounts,
      computeConfig,
    )
  }

  writeReportFromCreConfigParams(
    runtime: Runtime<unknown>,
    input: CreConfigParams,
    remainingAccounts: SolanaAccountMeta[],
    computeConfig?: SolanaComputeConfig,
  ) {
    return this.writeReport(runtime, new Uint8Array(creConfigParamsCodec.encode(input)), remainingAccounts, computeConfig)
  }

  writeReportFromCreConfigParamss(
    runtime: Runtime<unknown>,
    inputs: CreConfigParams[],
    remainingAccounts: SolanaAccountMeta[],
    computeConfig?: SolanaComputeConfig,
  ) {
    return this.writeReportFromBorshEncodedVec(
      runtime,
      inputs.map((input) => new Uint8Array(creConfigParamsCodec.encode(input))),
      remainingAccounts,
      computeConfig,
    )
  }

  writeReportFromInitIssuerParams(
    runtime: Runtime<unknown>,
    input: InitIssuerParams,
    remainingAccounts: SolanaAccountMeta[],
    computeConfig?: SolanaComputeConfig,
  ) {
    return this.writeReport(runtime, new Uint8Array(initIssuerParamsCodec.encode(input)), remainingAccounts, computeConfig)
  }

  writeReportFromInitIssuerParamss(
    runtime: Runtime<unknown>,
    inputs: InitIssuerParams[],
    remainingAccounts: SolanaAccountMeta[],
    computeConfig?: SolanaComputeConfig,
  ) {
    return this.writeReportFromBorshEncodedVec(
      runtime,
      inputs.map((input) => new Uint8Array(initIssuerParamsCodec.encode(input))),
      remainingAccounts,
      computeConfig,
    )
  }

  writeReportFromIssuerConfig(
    runtime: Runtime<unknown>,
    input: IssuerConfig,
    remainingAccounts: SolanaAccountMeta[],
    computeConfig?: SolanaComputeConfig,
  ) {
    return this.writeReport(runtime, new Uint8Array(issuerConfigCodec.encode(input)), remainingAccounts, computeConfig)
  }

  writeReportFromIssuerConfigs(
    runtime: Runtime<unknown>,
    inputs: IssuerConfig[],
    remainingAccounts: SolanaAccountMeta[],
    computeConfig?: SolanaComputeConfig,
  ) {
    return this.writeReportFromBorshEncodedVec(
      runtime,
      inputs.map((input) => new Uint8Array(issuerConfigCodec.encode(input))),
      remainingAccounts,
      computeConfig,
    )
  }

  writeReportFromMinted(
    runtime: Runtime<unknown>,
    input: Minted,
    remainingAccounts: SolanaAccountMeta[],
    computeConfig?: SolanaComputeConfig,
  ) {
    return this.writeReport(runtime, new Uint8Array(mintedCodec.encode(input)), remainingAccounts, computeConfig)
  }

  writeReportFromMinteds(
    runtime: Runtime<unknown>,
    inputs: Minted[],
    remainingAccounts: SolanaAccountMeta[],
    computeConfig?: SolanaComputeConfig,
  ) {
    return this.writeReportFromBorshEncodedVec(
      runtime,
      inputs.map((input) => new Uint8Array(mintedCodec.encode(input))),
      remainingAccounts,
      computeConfig,
    )
  }

  writeReportFromPauseChanged(
    runtime: Runtime<unknown>,
    input: PauseChanged,
    remainingAccounts: SolanaAccountMeta[],
    computeConfig?: SolanaComputeConfig,
  ) {
    return this.writeReport(runtime, new Uint8Array(pauseChangedCodec.encode(input)), remainingAccounts, computeConfig)
  }

  writeReportFromPauseChangeds(
    runtime: Runtime<unknown>,
    inputs: PauseChanged[],
    remainingAccounts: SolanaAccountMeta[],
    computeConfig?: SolanaComputeConfig,
  ) {
    return this.writeReportFromBorshEncodedVec(
      runtime,
      inputs.map((input) => new Uint8Array(pauseChangedCodec.encode(input))),
      remainingAccounts,
      computeConfig,
    )
  }

  /**
   * Registers a typed log trigger for AttestationSubmitted events. The trigger
   * output is adapted to the decoded AttestationSubmitted data alongside the raw log.
   * Pass opts.cpi for events emitted via Anchor's emit_cpi!.
   */
  logTriggerAttestationSubmittedLog(
    filterName: string,
    filters: AttestationSubmittedFilters[] = [],
    opts?: SolanaLogTriggerOptions,
  ): Trigger<SolanaLog, SolanaDecodedLog<AttestationSubmitted>> {
    const config: SolanaFilterLogTriggerRequestJson = {
      name: filterName,
      address: bytesToBase64(this.programId),
      eventName: 'AttestationSubmitted',
      contractIdlJson: LANTERN_IDL_BASE64,
      subkeys: encodeAttestationSubmittedSubkeys(filters),
    }
    if (opts?.cpi) {
      config.cpiFilterConfig = anchorCPILogTriggerConfig(this.programId)
    }
    return adaptTrigger(this.client.logTrigger(config), (log) => ({
      log,
      data: decodeAttestationSubmittedEvent(log.data),
    }))
  }

  /**
   * Registers a typed log trigger for CorporateAction events. The trigger
   * output is adapted to the decoded CorporateAction data alongside the raw log.
   * Pass opts.cpi for events emitted via Anchor's emit_cpi!.
   */
  logTriggerCorporateActionLog(
    filterName: string,
    filters: CorporateActionFilters[] = [],
    opts?: SolanaLogTriggerOptions,
  ): Trigger<SolanaLog, SolanaDecodedLog<CorporateAction>> {
    const config: SolanaFilterLogTriggerRequestJson = {
      name: filterName,
      address: bytesToBase64(this.programId),
      eventName: 'CorporateAction',
      contractIdlJson: LANTERN_IDL_BASE64,
      subkeys: encodeCorporateActionSubkeys(filters),
    }
    if (opts?.cpi) {
      config.cpiFilterConfig = anchorCPILogTriggerConfig(this.programId)
    }
    return adaptTrigger(this.client.logTrigger(config), (log) => ({
      log,
      data: decodeCorporateActionEvent(log.data),
    }))
  }

  /**
   * Registers a typed log trigger for Minted events. The trigger
   * output is adapted to the decoded Minted data alongside the raw log.
   * Pass opts.cpi for events emitted via Anchor's emit_cpi!.
   */
  logTriggerMintedLog(
    filterName: string,
    filters: MintedFilters[] = [],
    opts?: SolanaLogTriggerOptions,
  ): Trigger<SolanaLog, SolanaDecodedLog<Minted>> {
    const config: SolanaFilterLogTriggerRequestJson = {
      name: filterName,
      address: bytesToBase64(this.programId),
      eventName: 'Minted',
      contractIdlJson: LANTERN_IDL_BASE64,
      subkeys: encodeMintedSubkeys(filters),
    }
    if (opts?.cpi) {
      config.cpiFilterConfig = anchorCPILogTriggerConfig(this.programId)
    }
    return adaptTrigger(this.client.logTrigger(config), (log) => ({
      log,
      data: decodeMintedEvent(log.data),
    }))
  }

  /**
   * Registers a typed log trigger for PauseChanged events. The trigger
   * output is adapted to the decoded PauseChanged data alongside the raw log.
   * Pass opts.cpi for events emitted via Anchor's emit_cpi!.
   */
  logTriggerPauseChangedLog(
    filterName: string,
    filters: PauseChangedFilters[] = [],
    opts?: SolanaLogTriggerOptions,
  ): Trigger<SolanaLog, SolanaDecodedLog<PauseChanged>> {
    const config: SolanaFilterLogTriggerRequestJson = {
      name: filterName,
      address: bytesToBase64(this.programId),
      eventName: 'PauseChanged',
      contractIdlJson: LANTERN_IDL_BASE64,
      subkeys: encodePauseChangedSubkeys(filters),
    }
    if (opts?.cpi) {
      config.cpiFilterConfig = anchorCPILogTriggerConfig(this.programId)
    }
    return adaptTrigger(this.client.logTrigger(config), (log) => ({
      log,
      data: decodePauseChangedEvent(log.data),
    }))
  }
}
