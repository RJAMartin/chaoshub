// ─────────────────────────────────────────────────────────────────────────────
// Pixel War — Game Module registration
// ─────────────────────────────────────────────────────────────────────────────
import type { GameModule, GameContext } from '@chaoshub/game-sdk'
import { PixelWarGame } from './pixel-war.game'

const module: GameModule = {
  id: 'pixel-war',
  name: 'Pixel War',
  description: 'Paint the canvas your color. 60 seconds. Most pixels wins.',
  minPlayers: 1,
  maxPlayers: 8,
  supportsSinglePlayer: true,
  supportsMultiplayer: true,
  tags: ['realtime', 'strategy', 'painting', 'multiplayer'],
  create: (context: GameContext) => new PixelWarGame(context),
}

export default module
