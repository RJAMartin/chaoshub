import type { GameModule, GameContext } from '@chaoshub/game-sdk'
import { FlappyRaceGame } from './flappy-race.game'

const module: GameModule = {
  id: 'flappy-race',
  name: 'Flappy Race',
  description: 'Everyone flaps their own bird through the same pipes. First to clear 10 wins.',
  minPlayers: 1,
  maxPlayers: 6,
  supportsSinglePlayer: true,
  supportsMultiplayer: true,
  tags: ['reflex', 'multiplayer', 'competitive'],
  create: (context: GameContext) => new FlappyRaceGame(context),
}

export default module
