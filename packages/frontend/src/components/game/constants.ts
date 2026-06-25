// All gameplay tunables in one place so movement "feel" is easy to iterate.
// Units: CSS pixels and seconds.

export const PHYS = {
  GRAVITY: 2300,
  MOVE_SPEED: 300, // top horizontal speed
  ACCEL_GROUND: 3200,
  ACCEL_AIR: 2000,
  FRICTION: 2800, // ground decel when no input
  JUMP_V: 770, // initial jump velocity
  JUMP_CUT: 0.42, // multiply rising vy by this on early release (variable height)
  DOUBLE_JUMP_V: 690,
  COYOTE: 0.09, // grace after leaving ground
  WALL_COYOTE: 0.1, // grace after leaving a wall
  BUFFER: 0.12, // jump press buffered before landing
  WALL_SLIDE_MAX: 150, // max downward speed while clinging
  WALL_JUMP_VX: 340,
  WALL_JUMP_VY: 720,
  WALL_STICK: 6, // probe distance to detect a wall
  DIVE_VY: 1450, // fast-fall speed when diving
  DIVE_BOUNCE: 700, // upward bounce after stomping an enemy
  PW: 36,
  PH: 42,
} as const

// Alien "bioluminescent caverns" palette (biome 0). Later phases add more.
export const C = {
  skyTop: '#1b0a31', skyMid: '#4a1550', skyLow: '#0f3d49',
  planet: '#d9b6ff', moon: '#bfe9e0',
  mtn: '#2a1146', spire: '#371a55', stalk: '#15082a', stalkTip: '#2a8f6e',
  rock: '#3a1d57', rockDark: '#26113f', biolume: '#7be0ff',
  slime: '#7be36a', slimeDark: '#3f9b39',
  orb: '#83f1ff', orbEdge: '#27b4d8',
  gloo: '#a0ea6e', glooDark: '#5aa83a', goo: '#86e36a',
  dust: '#caa2ff',
} as const

export const BEST_KEY = 'putty-runner-best'
