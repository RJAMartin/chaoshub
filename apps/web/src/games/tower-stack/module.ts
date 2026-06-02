import type { GameModule, GameContext } from '@chaoshub/game-sdk'
import { TowerStackGame } from './tower-stack.game'

const module: GameModule = {
  id: 'tower-stack',
  name: 'Tower Stack',
  description: 'Drop falling blocks to build the tallest tower. Perfect timing = perfect stack.',
  minPlayers: 1,
  maxPlayers: 6,
  supportsSinglePlayer: true,
  supportsMultiplayer: true,
  tags: ['skill', 'reflex', 'competitive'],
  create: (context: GameContext) => new TowerStackGame(context),
}

export default module
