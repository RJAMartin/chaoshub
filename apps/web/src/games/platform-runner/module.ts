import type { GameModule, GameContext } from '@chaoshub/game-sdk'
import { PlatformRunnerGame } from './platform-runner.game'
const module: GameModule = {
  id: 'platform-runner', name: 'Platform Runner',
  description: 'Tap or press Space to jump over obstacles — survive the longest to win!',
  minPlayers: 1, maxPlayers: 6, supportsSinglePlayer: true, supportsMultiplayer: true,
  tags: ['reflex', 'arcade', 'competitive', 'multiplayer'],
  create: (context: GameContext) => new PlatformRunnerGame(context),
}
export default module
