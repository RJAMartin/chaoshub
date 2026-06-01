import type { GameModule, GameContext } from '@chaoshub/game-sdk'
import { RhythmTapGame } from './rhythm-tap.game'
const module: GameModule = {
  id: 'rhythm-tap', name: 'Rhythm Tap',
  description: 'Tap on the beat — the more accurate your timing, the higher your score!',
  minPlayers: 1, maxPlayers: 6, supportsSinglePlayer: true, supportsMultiplayer: true,
  tags: ['music', 'reflex', 'rhythm', 'competitive'],
  create: (context: GameContext) => new RhythmTapGame(context),
}
export default module
