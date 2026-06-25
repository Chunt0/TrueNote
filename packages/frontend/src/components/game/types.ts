export interface Rect { x: number; y: number; w: number; h: number }
export interface Platform extends Rect { ground: boolean }
export interface Coin { x: number; y: number; taken: boolean; phase: number }
export interface Enemy { x: number; y: number; w: number; h: number; vx: number; minX: number; maxX: number; dead: boolean; blink: number; wob: number }
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
  platforms: Platform[]; coins: Coin[]; enemies: Enemy[]; anchors: Anchor[]
  particles: Particle[]; popups: Popup[]; bubbles: Bubble[]
  player: Player
  cam: { x: number; shake: number }
  furthestX: number; lastTop: number; segCount: number
  lastChunkId: string; chunksSinceBreather: number
  threatX: number // the advancing "Devourer" world-x; caught if player falls behind it
  score: number; distance: number; combo: number; over: boolean; best: number
  coyote: number; wallCoyote: number; buffer: number
  accent: string; accentLight: string
}
