import type { GameModule, GameContext } from '@chaoshub/game-sdk'
import { ColorFloodGame } from './color-flood.game'

const module: GameModule = {
  id: 'color-flood',
  name: 'Color Flood',
  description: 'Flood-fill the board from your corner. Most territory wins.',
  minPlayers: 2,
  maxPlayers: 4,
  supportsSinglePlayer: false,
  supportsMultiplayer: true,
  tags: ['strategy', 'puzzle', 'multiplayer', 'turn-based'],
  create: (context: GameContext) => new ColorFloodGame(context),
}

export default module
