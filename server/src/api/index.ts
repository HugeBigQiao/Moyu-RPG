/** API 聚合：main 只装配一次，新增板块只改这里。 */
import type { Context } from 'cordis'
import { registerArchive, registerArchiveEdit } from './archive.ts'
import { registerCharacters } from './characters.ts'
import { registerGame } from './game.ts'
import { registerSessions } from './sessions.ts'

export function registerAll(ctx: Context): void {
  registerArchive(ctx)
  registerArchiveEdit(ctx)
  registerCharacters(ctx)
  registerGame(ctx)
  registerSessions(ctx)
}
