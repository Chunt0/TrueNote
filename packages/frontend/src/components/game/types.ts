import type { Palette } from './biomes'

export interface Rect { x: number; y: number; w: number; h: number }
export interface Platform extends Rect { ground: boolean; spring?: boolean; crumble?: boolean; ct: number /* crumble countdown, <0 = stable */ }
export interface Coin { x: number; y: number; taken: boolean; phase: number }
export type EnemyKind = 'gloop' | 'hopper' | 'floater' | 'spiker'
export interface Enemy { x: number; y: number; w: number; h: number; vx: number; vy: number; minX: number; maxX: number; baseY: number; dead: boolean; blink: number; wob: number; t: number; kind: EnemyKind }
export interface Hazard extends Rect { kind: 'spikes' }
export type PowerKind = 'shield' | 'magnet' | 'slowmo' | 'x2'
export interface PowerUp { x: number; y: number; kind: PowerKind; taken: boolean; phase: number }
export interface Particle { x: number; y: number; vx: number; vy: number; life: number; max: number; size: number; color: string; grav: number }
export interface Popup { x: number; y: number; text: string; life: number }
export interface Bubble { x: number; y: number; r: number; vy: number; sway: number; phase: number; near: boolean }
export interface Anchor { x: number; y: number }

export interface Player {
  x: number; y: number; vx: number; vy: number
  onGround: boolean
  wall: number // -1 = wall on left, 1 = wall on right, 0 = none
  clinging: boolean
  diving: boolean
  grappling: boolean
  anchorRef: Anchor | null
  airJumps: number // remaining mid-air jumps
  jumping: boolean // in a jump arc (for variable-height cut)
  face: number // 1 / -1
  squash: number
  blink: number
  prevBottom: number
}

// Held-button state the React wrapper feeds the engine each frame.
export interface Input { left: boolean; right: boolean; jump: boolean; dive: boolean; grapple: boolean; restart: boolean }

export interface GameState {
  W: number; H: number; time: number
  platforms: Platform[]; coins: Coin[]; enemies: Enemy[]; anchors: Anchor[]; hazards: Hazard[]; powers: PowerUp[]
  effects: { shield: boolean; magnet: number; slowmo: number; x2: number }
  particles: Particle[]; popups: Popup[]; bubbles: Bubble[]
  player: Player
  cam: { x: number; shake: number }
  furthestX: number; lastTop: number; segCount: number
  lastChunkId: string; chunksSinceBreather: number
  threatX: number // the advancing "Devourer" world-x; caught if player falls behind it
  palette: Palette; biome: number; biomeName: string; bannerT: number
  rng: () => number // generation RNG (Math.random for endless; seeded for daily)
  sfx: string[] // sound events for this frame; the wrapper drains + plays them
  reduceMotion: boolean // honor prefers-reduced-motion (cuts shake/flash)
  mode: 'endless' | 'daily' // selects which best-score slot to load/save
  score: number; distance: number; combo: number; maxCombo: number; over: boolean; best: number
  coyote: number; wallCoyote: number; buffer: number
  accent: string; accentLight: string
}
