// ─────────────────────────────────────────────────────────────────────────────
// Reaction Test — Game Module registration
// ─────────────────────────────────────────────────────────────────────────────
import type { GameModule, GameContext } from '@chaoshub/game-sdk'
import { ReactionTestGame } from './reaction-test.game'

const module: GameModule = {
  id: 'reaction-test',
  name: 'Reaction Test',
  description: 'Wait for the signal. Click as fast as you can. Fastest wins.',
  minPlayers: 1,
  maxPlayers: 8,
  supportsSinglePlayer: true,
  supportsMultiplayer: true,
  tags: ['reflex', 'multiplayer', 'competitive'],
  create: (context: GameContext) => new ReactionTestGame(context),
}

export default module
