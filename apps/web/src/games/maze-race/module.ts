import type { GameModule, GameContext } from '@chaoshub/game-sdk'
import { MazeRaceGame } from './maze-race.game'

const module: GameModule = {
  id: 'maze-race',
  name: 'Maze Race',
  description: 'Navigate a procedural maze to the exit. First to escape wins.',
  minPlayers: 1,
  maxPlayers: 6,
  supportsSinglePlayer: true,
  supportsMultiplayer: true,
  tags: ['puzzle', 'racing', 'maze', 'multiplayer'],
  create: (context: GameContext) => new MazeRaceGame(context),
}

export default module
