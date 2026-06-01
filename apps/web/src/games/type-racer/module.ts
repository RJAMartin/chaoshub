import type { GameModule, GameContext } from '@chaoshub/game-sdk'
import { TypeRacerGame } from './type-racer.game'

const module: GameModule = {
  id: 'type-racer',
  name: 'Type Racer',
  description: 'Race to type a shared prompt. Fastest fingers win.',
  minPlayers: 1,
  maxPlayers: 8,
  supportsSinglePlayer: true,
  supportsMultiplayer: true,
  tags: ['typing', 'competitive', 'multiplayer'],
  create: (context: GameContext) => new TypeRacerGame(context),
}

export default module
