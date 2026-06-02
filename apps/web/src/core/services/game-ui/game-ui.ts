// ─────────────────────────────────────────────────────────────────────────────
// GameUI — Shared UI primitives for all games
//
// Provides: instructions screen, animated countdown, round banner, win screen.
// All methods draw into the game's Pixi stage and return Promises so games can
// await them cleanly:
//
//   await ui.showInstructions(ctx, { title, lines, controls })
//   await ui.countdown(ctx)
//   await ui.showRoundBanner(ctx, 'Round 2', 'Get ready!')
//   ui.showWinScreen(ctx, winnerId, winnerName, scoreLine)
//
// Every method clears any previously drawn UI container before drawing new UI.
// Games should clear the container themselves when the game starts:
//   ui.clear()
// ─────────────────────────────────────────────────────────────────────────────
import { Container, Graphics, Text, TextStyle, type Application } from 'pixi.js'
import type { GameContext } from '@chaoshub/game-sdk'

const NEON_CYAN   = 0x00f5ff
const NEON_PINK   = 0xff2d78
const NEON_YELLOW = 0xffd60a
const NEON_GREEN  = 0x30d158
const BG_DARK     = 0x0a0a0f
const TEXT_MUTED  = '#6060a0'

export interface InstructionsConfig {
  title: string
  subtitle?: string
  /** Array of instruction lines. Each line may start with an emoji. */
  lines: string[]
  /** Control hint shown at the bottom, e.g. "W/S or ↑/↓ to move" */
  controls?: string
  /** Accent colour for the title (default: NEON_CYAN) */
  accentColor?: number
}

// Network event used to synchronise game start across peers
export const GAME_UI_START = 'gameui:start'

export class GameUI {
  private container: Container | null = null

  // ── Helpers ────────────────────────────────────────────────────────────────

  private getContainer(app: Application): Container {
    if (!this.container || this.container.destroyed) {
      this.container = new Container()
      app.stage.addChild(this.container)
    }
    return this.container
  }

  /** Remove all GameUI overlays from the stage. Call when game play begins. */
  clear(): void {
    if (this.container && !this.container.destroyed) {
      this.container.removeChildren()
    }
  }

  /** Remove container from stage entirely. Call in game.destroy(). */
  destroy(): void {
    if (this.container && !this.container.destroyed) {
      this.container.destroy({ children: true })
    }
    this.container = null
  }

  // ── Instructions ───────────────────────────────────────────────────────────

  /**
   * Show a full-screen instructions panel.
   *
   * Host: sees a "Start Game" button. Pressing it broadcasts GAME_UI_START and
   *       resolves the promise.
   * Clients: see "Waiting for host…" and resolve when they receive GAME_UI_START.
   *
   * Returns a cleanup function — call it before the next phase if you need to
   * manually dismiss (normally the Promise resolves and you'd call ui.clear()).
   */
  showInstructions(ctx: GameContext, cfg: InstructionsConfig): Promise<void> {
    const app = ctx.pixiApp as Application
    const { width: W, height: H } = app.screen
    const ctr = this.getContainer(app)
    ctr.removeChildren()

    const accent = cfg.accentColor ?? NEON_CYAN

    // Backdrop
    const bg = new Graphics()
    bg.rect(0, 0, W, H).fill({ color: BG_DARK, alpha: 0.96 })
    ctr.addChild(bg)

    // Card
    const cardW = Math.min(W * 0.9, 540)
    const cardX = (W - cardW) / 2
    let cardH = 220 + cfg.lines.length * 32 + (cfg.controls ? 36 : 0) + (cfg.subtitle ? 28 : 0)
    cardH = Math.min(cardH, H * 0.88)
    const cardY = (H - cardH) / 2

    const card = new Graphics()
    card.roundRect(cardX, cardY, cardW, cardH, 16)
      .fill({ color: 0x12121f, alpha: 1 })
      .stroke({ color: accent, width: 1.5, alpha: 0.6 })
    ctr.addChild(card)

    // Glow line at top of card
    const glow = new Graphics()
    glow.roundRect(cardX + 2, cardY + 2, cardW - 4, 3, 2).fill({ color: accent, alpha: 0.7 })
    ctr.addChild(glow)

    let y = cardY + 32

    // Title
    const titleText = new Text({
      text: cfg.title,
      style: new TextStyle({
        fontFamily: '"Space Grotesk", Inter, sans-serif',
        fontSize: Math.min(cardW * 0.09, 42),
        fontWeight: '900',
        fill: `#${accent.toString(16).padStart(6, '0')}`,
        align: 'center',
      }),
    })
    titleText.anchor.set(0.5, 0)
    titleText.position.set(W / 2, y)
    ctr.addChild(titleText)
    y += titleText.height + 8

    // Subtitle
    if (cfg.subtitle) {
      const sub = new Text({
        text: cfg.subtitle,
        style: new TextStyle({
          fontFamily: '"Space Grotesk", Inter, sans-serif',
          fontSize: 14,
          fill: TEXT_MUTED,
          align: 'center',
        }),
      })
      sub.anchor.set(0.5, 0)
      sub.position.set(W / 2, y)
      ctr.addChild(sub)
      y += sub.height + 14
    }

    // Divider
    const div = new Graphics()
    div.rect(cardX + 24, y, cardW - 48, 1).fill({ color: accent, alpha: 0.2 })
    ctr.addChild(div)
    y += 16

    // Instruction lines
    for (const line of cfg.lines) {
      const t = new Text({
        text: line,
        style: new TextStyle({
          fontFamily: '"Space Grotesk", Inter, sans-serif',
          fontSize: 14,
          fill: '#c0c0e0',
          align: 'left',
          wordWrap: true,
          wordWrapWidth: cardW - 48,
        }),
      })
      t.position.set(cardX + 24, y)
      ctr.addChild(t)
      y += t.height + 8
    }

    // Controls hint
    if (cfg.controls) {
      y += 4
      const ctrl = new Text({
        text: `🎮  ${cfg.controls}`,
        style: new TextStyle({
          fontFamily: '"Space Grotesk", Inter, sans-serif',
          fontSize: 12,
          fill: TEXT_MUTED,
          align: 'center',
        }),
      })
      ctrl.anchor.set(0.5, 0)
      ctrl.position.set(W / 2, y)
      ctr.addChild(ctrl)
      y += ctrl.height + 10
    }

    // Button area
    y = cardY + cardH - 64

    return new Promise<void>((resolve) => {
      if (ctx.network.isHost()) {
        // Start button
        const btnW = 180
        const btnH = 42
        const btnX = W / 2 - btnW / 2
        const btnY = y

        const btn = new Graphics()
        btn.roundRect(btnX, btnY, btnW, btnH, 10).fill({ color: accent, alpha: 0.9 })
        btn.eventMode = 'static'
        btn.cursor = 'pointer'
        ctr.addChild(btn)

        const btnLabel = new Text({
          text: '▶  Start Game',
          style: new TextStyle({
            fontFamily: '"Space Grotesk", Inter, sans-serif',
            fontSize: 16,
            fontWeight: '700',
            fill: '#000000',
          }),
        })
        btnLabel.anchor.set(0.5)
        btnLabel.position.set(W / 2, btnY + btnH / 2)
        ctr.addChild(btnLabel)

        btn.on('pointerdown', () => {
          ctx.sound.beep(660, 0.08)
          ctx.network.broadcast(GAME_UI_START, {})
          resolve()
        })
      } else {
        // Waiting label
        const wait = new Text({
          text: '⏳  Waiting for host to start…',
          style: new TextStyle({
            fontFamily: '"Space Grotesk", Inter, sans-serif',
            fontSize: 14,
            fill: TEXT_MUTED,
            align: 'center',
          }),
        })
        wait.anchor.set(0.5, 0)
        wait.position.set(W / 2, y + 8)
        ctr.addChild(wait)

        const listener = () => { resolve() }
        ctx.network.on(GAME_UI_START, listener as never)
      }
    })
  }

  // ── Countdown ──────────────────────────────────────────────────────────────

  /**
   * Show an animated 3 → 2 → 1 → GO! countdown.
   * Host drives the timing; broadcasts each tick so clients stay in sync.
   * Returns a Promise that resolves after "GO!" fades out.
   */
  countdown(ctx: GameContext, seconds = 3): Promise<void> {
    const app = ctx.pixiApp as Application
    const { width: W, height: H } = app.screen
    const ctr = this.getContainer(app)
    ctr.removeChildren()

    return new Promise<void>((resolve) => {
      const COUNTDOWN_EVENT = 'gameui:countdown-tick'
      let n = seconds

      const drawNumber = (val: string, color: number) => {
        ctr.removeChildren()
        const bg = new Graphics()
        bg.rect(0, 0, W, H).fill({ color: BG_DARK, alpha: 0.7 })
        ctr.addChild(bg)

        const t = new Text({
          text: val,
          style: new TextStyle({
            fontFamily: '"Space Grotesk", Inter, sans-serif',
            fontSize: val === 'GO!' ? Math.min(W * 0.16, 120) : Math.min(W * 0.28, 200),
            fontWeight: '900',
            fill: `#${color.toString(16).padStart(6, '0')}`,
            align: 'center',
          }),
        })
        t.anchor.set(0.5)
        t.position.set(W / 2, H / 2)
        t.scale.set(1.4)
        ctr.addChild(t)

        // Tween scale down
        let elapsed = 0
        const animate = () => {
          elapsed += 16
          const progress = Math.min(elapsed / 400, 1)
          const scale = 1.4 - 0.4 * progress
          t.scale.set(scale)
          if (progress < 1) requestAnimationFrame(animate)
        }
        requestAnimationFrame(animate)
      }

      if (ctx.network.isHost()) {
        const tick = () => {
          if (n > 0) {
            ctx.network.broadcast(COUNTDOWN_EVENT, { n })
            drawNumber(String(n), n === 1 ? NEON_PINK : n === 2 ? NEON_YELLOW : NEON_CYAN)
            ctx.sound.beep(n === 1 ? 660 : 440, 0.08, 0.2)
            n--
            setTimeout(tick, 1000)
          } else {
            ctx.network.broadcast(COUNTDOWN_EVENT, { n: 0 })
            drawNumber('GO!', NEON_GREEN)
            ctx.sound.beep(880, 0.12, 0.25)
            setTimeout(() => {
              ctr.removeChildren()
              resolve()
            }, 700)
          }
        }
        setTimeout(tick, 300)
      } else {
        const listener = (msg: { payload: unknown }) => {
          const { n: val } = msg.payload as { n: number }
          if (val > 0) {
            drawNumber(String(val), val === 1 ? NEON_PINK : val === 2 ? NEON_YELLOW : NEON_CYAN)
            ctx.sound.beep(val === 1 ? 660 : 440, 0.08, 0.2)
          } else {
            drawNumber('GO!', NEON_GREEN)
            ctx.sound.beep(880, 0.12, 0.25)
            setTimeout(() => {
              ctx.network.off(COUNTDOWN_EVENT, listener as never)
              ctr.removeChildren()
              resolve()
            }, 700)
          }
        }
        ctx.network.on(COUNTDOWN_EVENT, listener as never)
      }
    })
  }

  // ── Round banner ───────────────────────────────────────────────────────────

  /**
   * Show a brief centred banner (e.g. "Round 2 / 3" + standings).
   * Automatically dismisses after `durationMs` (default 2500ms).
   */
  showRoundBanner(
    ctx: GameContext,
    header: string,
    lines: string[] = [],
    durationMs = 2500,
  ): Promise<void> {
    const app = ctx.pixiApp as Application
    const { width: W, height: H } = app.screen
    const ctr = this.getContainer(app)
    ctr.removeChildren()

    const bg = new Graphics()
    bg.rect(0, 0, W, H).fill({ color: BG_DARK, alpha: 0.75 })
    ctr.addChild(bg)

    const cardW = Math.min(W * 0.8, 420)
    const cardH = 100 + lines.length * 28
    const cardX = (W - cardW) / 2
    const cardY = (H - cardH) / 2

    const card = new Graphics()
    card.roundRect(cardX, cardY, cardW, cardH, 14)
      .fill({ color: 0x14142a, alpha: 1 })
      .stroke({ color: NEON_CYAN, width: 1.5, alpha: 0.5 })
    ctr.addChild(card)

    const hdr = new Text({
      text: header,
      style: new TextStyle({
        fontFamily: '"Space Grotesk", Inter, sans-serif',
        fontSize: Math.min(cardW * 0.09, 36),
        fontWeight: '900',
        fill: '#00f5ff',
        align: 'center',
      }),
    })
    hdr.anchor.set(0.5, 0)
    hdr.position.set(W / 2, cardY + 18)
    ctr.addChild(hdr)

    let y = cardY + hdr.height + 28
    for (const line of lines) {
      const t = new Text({
        text: line,
        style: new TextStyle({
          fontFamily: '"Space Grotesk", Inter, sans-serif',
          fontSize: 15,
          fill: '#c0c0e0',
          align: 'center',
        }),
      })
      t.anchor.set(0.5, 0)
      t.position.set(W / 2, y)
      ctr.addChild(t)
      y += 28
    }

    return new Promise((resolve) => {
      setTimeout(() => {
        ctr.removeChildren()
        resolve()
      }, durationMs)
    })
  }

  // ── Win screen ─────────────────────────────────────────────────────────────

  /**
   * Show a winner screen. Does NOT auto-dismiss — the platform scoreboard takes over.
   */
  showWinScreen(
    ctx: GameContext,
    winnerId: string,
    winnerName: string,
    scoreLine = '',
    accentColor = NEON_YELLOW,
  ): void {
    const app = ctx.pixiApp as Application
    const { width: W, height: H } = app.screen
    const ctr = this.getContainer(app)
    ctr.removeChildren()

    const isLocalWinner = winnerId === ctx.players.getLocalPlayer().id

    const bg = new Graphics()
    bg.rect(0, 0, W, H).fill({ color: 0x070710, alpha: 1 })
    ctr.addChild(bg)

    // Trophy
    const trophy = new Text({
      text: isLocalWinner ? '🏆' : '🎮',
      style: new TextStyle({ fontSize: Math.min(W * 0.15, 96) }),
    })
    trophy.anchor.set(0.5)
    trophy.position.set(W / 2, H / 2 - 80)
    ctr.addChild(trophy)

    const headline = new Text({
      text: isLocalWinner ? 'YOU WIN!' : `${winnerName} wins!`,
      style: new TextStyle({
        fontFamily: '"Space Grotesk", Inter, sans-serif',
        fontSize: Math.min(W * 0.1, 64),
        fontWeight: '900',
        fill: `#${accentColor.toString(16).padStart(6, '0')}`,
        align: 'center',
      }),
    })
    headline.anchor.set(0.5)
    headline.position.set(W / 2, H / 2 + 10)
    ctr.addChild(headline)

    if (scoreLine) {
      const score = new Text({
        text: scoreLine,
        style: new TextStyle({
          fontFamily: '"Space Grotesk", Inter, sans-serif',
          fontSize: Math.min(W * 0.035, 20),
          fill: '#8080b0',
          align: 'center',
        }),
      })
      score.anchor.set(0.5)
      score.position.set(W / 2, H / 2 + 70)
      ctr.addChild(score)
    }

    ctx.sound.success()
  }
}

// Export factory so games can create their own isolated instance
export function createGameUI(): GameUI {
  return new GameUI()
}
