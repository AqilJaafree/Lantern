// Code generated — DO NOT EDIT.
import { addSolanaContractMock, type SolanaContractMock, type SolanaMock } from '@chainlink/cre-sdk/test'

import { LANTERN_PROGRAM_ID } from './Lantern'

export type LanternMock = SolanaContractMock

/**
 * Registers a Lantern program mock on a SolanaMock instance.
 * The Solana CRE capability is write-only, so the mock routes writeReport
 * calls targeting this program's ID; set the returned mock's writeReport
 * property to define the reply.
 */
export function newLanternMock(
  solanaMock: SolanaMock,
  programId: string | Uint8Array = LANTERN_PROGRAM_ID,
): LanternMock {
  return addSolanaContractMock(solanaMock, { programId })
}
