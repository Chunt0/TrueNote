// Level grammar: hand-authored chunks stitched into a fair, escalating world.
// Each chunk starts and (usually) ends at the running `groundY`, so transitions
// are always reachable; stair chunks shift groundY by a jump-reachable step.
// Gaps/steps are sized against the jump arc so nothing is impossible. The engine
// owns the stitcher (it has the state); this file is the library + picker.

export interface ChunkCtx {
  x0: number
  groundY: number
  H: number
  rng: () => number
  plat: (x: number, y: number, w: number) => void // ground platform (extends to bottom)
  float: (x: number, y: number, w: number) => void // thin floating platform
  wall: (x: number, y: number, w: number, h: number) => void // vertical wall (clingable)
  coin: (x: number, y: number) => void
  enemy: (x: number, y: number, minX: number, maxX: number) => void
}

export interface Chunk {
  id: string
  difficulty: number // 0..6
  minDist: number // meters before this chunk may appear (teaching order)
  skills: string[] // verbs it exercises (for onboarding hints later)
  build: (c: ChunkCtx) => { width: number; exitY: number }
}

// Fair limits derived from the jump arc (single jump ~130px up, ~200px across;
// double-jump gives more, so reward chunks may push a little further).
const STEP = 100 // vertical step a stair takes (≤ single-jump height)

function coinArc(c: ChunkCtx, x: number, y: number, n: number, gap = 30, lift = 34) {
  for (let i = 0; i < n; i++) c.coin(x + i * gap, y - Math.sin((i / Math.max(n - 1, 1)) * Math.PI) * lift)
}

export const CHUNKS: Chunk[] = [
  {
    id: 'flat', difficulty: 0, minDist: 0, skills: [],
    build: (c) => { const w = 240 + c.rng() * 120; c.plat(c.x0, c.groundY, w); coinArc(c, c.x0 + 40, c.groundY - 44, 3 + ((c.rng() * 3) | 0)); return { width: w, exitY: c.groundY } },
  },
  {
    id: 'breather', difficulty: 0, minDist: 0, skills: [],
    build: (c) => { const w = 200; c.plat(c.x0, c.groundY, w); c.coin(c.x0 + w / 2, c.groundY - 46); return { width: w, exitY: c.groundY } },
  },
  {
    id: 'gap-single', difficulty: 1, minDist: 0, skills: ['jump'],
    build: (c) => { const a = 150, gap = 150 + c.rng() * 50, b = 170; c.plat(c.x0, c.groundY, a); c.plat(c.x0 + a + gap, c.groundY, b); coinArc(c, c.x0 + a + 20, c.groundY - 52, 4, gap / 4); return { width: a + gap + b, exitY: c.groundY } },
  },
  {
    id: 'stairs-up', difficulty: 1, minDist: 0, skills: ['jump'],
    build: (c) => { let x = c.x0, y = c.groundY; for (let i = 0; i < 3; i++) { c.plat(x, y, 120); c.coin(x + 60, y - 44); x += 120 + 30; y -= STEP } y += STEP; return { width: x - c.x0, exitY: y } },
  },
  {
    id: 'stairs-down', difficulty: 1, minDist: 0, skills: ['jump'],
    build: (c) => { let x = c.x0, y = c.groundY; for (let i = 0; i < 3; i++) { c.plat(x, y, 130); c.coin(x + 65, y - 44); x += 130 + 24; y += STEP } y -= STEP; return { width: x - c.x0, exitY: y } },
  },
  {
    id: 'gap-double', difficulty: 2, minDist: 120, skills: ['jump'],
    build: (c) => { const g = 165; let x = c.x0; c.plat(x, c.groundY, 130); x += 130 + g; c.float(x, c.groundY - 10, 90); coinArc(c, x + 10, c.groundY - 54, 3, 26); x += 90 + g; c.plat(x, c.groundY, 150); return { width: x + 150 - c.x0, exitY: c.groundY } },
  },
  {
    id: 'floaters', difficulty: 2, minDist: 120, skills: ['jump', 'double'],
    build: (c) => { const w = 360; c.plat(c.x0, c.groundY, w); for (let i = 0; i < 3; i++) { const fx = c.x0 + 70 + i * 100, fy = c.groundY - 110 - (i % 2) * 50; c.float(fx, fy, 76); coinArc(c, fx + 14, fy - 30, 3, 24) } return { width: w, exitY: c.groundY } },
  },
  {
    id: 'enemy-line', difficulty: 2, minDist: 120, skills: ['dive'],
    build: (c) => { const w = 340; c.plat(c.x0, c.groundY, w); const n = 2 + ((c.rng() * 2) | 0); for (let i = 0; i < n; i++) { const ex = c.x0 + 70 + i * 90; c.enemy(ex, c.groundY - 30, c.x0 + 20, c.x0 + w - 20) } coinArc(c, c.x0 + 80, c.groundY - 96, 5, 44, 50); return { width: w, exitY: c.groundY } },
  },
  {
    id: 'high-low', difficulty: 2, minDist: 150, skills: ['double'],
    build: (c) => { const w = 320; c.plat(c.x0, c.groundY, w); c.float(c.x0 + 60, c.groundY - 140, 200); coinArc(c, c.x0 + 80, c.groundY - 184, 6, 28, 16); return { width: w, exitY: c.groundY } },
  },
  {
    id: 'pillars', difficulty: 3, minDist: 280, skills: ['jump', 'double'],
    build: (c) => { let x = c.x0; c.plat(x, c.groundY, 110); x += 110; const g = 140; for (let i = 0; i < 3; i++) { x += g; c.float(x, c.groundY - 6, 56); c.coin(x + 28, c.groundY - 50) } x += g; c.plat(x, c.groundY, 150); return { width: x + 150 - c.x0, exitY: c.groundY } },
  },
  {
    id: 'enemy-gap', difficulty: 3, minDist: 280, skills: ['jump', 'dive'],
    build: (c) => { const a = 140, gap = 175, b = 200; c.plat(c.x0, c.groundY, a); c.plat(c.x0 + a + gap, c.groundY, b); c.enemy(c.x0 + a + gap + 70, c.groundY - 30, c.x0 + a + gap + 16, c.x0 + a + gap + b - 16); coinArc(c, c.x0 + a + 18, c.groundY - 56, 4, gap / 4); return { width: a + gap + b, exitY: c.groundY } },
  },
  {
    id: 'wall-climb', difficulty: 3, minDist: 200, skills: ['wall'],
    build: (c) => { const a = 140, gap = 150; c.plat(c.x0, c.groundY, a); const wx = c.x0 + a + gap; const topY = c.groundY - 190; c.wall(wx, topY, 26, c.groundY - topY + 40); c.plat(wx + 26, topY, 170); coinArc(c, wx - 30, c.groundY - 70, 3, 18, 40); return { width: a + gap + 26 + 170, exitY: topY } },
  },
]

// Difficulty budget grows with distance; pick a teachable chunk within it.
export function pickChunk(distance: number, rng: () => number, lastId: string): Chunk {
  const budget = Math.min(1 + distance / 220, 6)
  const pool = CHUNKS.filter((k) => k.minDist <= distance && k.difficulty <= budget && k.id !== lastId)
  const list = pool.length ? pool : CHUNKS.filter((k) => k.minDist <= distance)
  // Weight toward the harder end of what's unlocked, for escalation.
  let total = 0
  const weights = list.map((k) => { const w = 1 + k.difficulty * (budget >= 3 ? 1.2 : 0.4); total += w; return w })
  let r = rng() * total
  for (let i = 0; i < list.length; i++) { r -= weights[i]; if (r <= 0) return list[i] }
  return list[list.length - 1]
}
