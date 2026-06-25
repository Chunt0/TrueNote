// PuttyRunner engine: game state + a fixed-tunable movement state machine.
// Pure logic (no canvas/DOM); the React wrapper drives step(dt, input) and a
// renderer reads the returned state. P1 uses random generation (genTo); P2 swaps
// in the chunk-based level grammar.
import { type ChunkCtx, CHUNKS, pickChunk } from './chunks'
import { BEST_KEY, PHYS } from './constants'
import type { Anchor, GameState, Input, Player, Rect } from './types'

const { PW, PH } = PHYS
const rand = (a: number, b: number) => a + Math.random() * (b - a)
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))
const overlap = (a: Rect, b: Rect) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y

export interface Game {
  state: GameState
  reset(): void
  step(dt: number, input: Input): void
}

export function createGame(accent: string, accentLight: string): Game {
  const state: GameState = {
    W: 800, H: 400, time: 0,
    platforms: [], coins: [], enemies: [], anchors: [], particles: [], popups: [], bubbles: [],
    player: blankPlayer(),
    cam: { x: 0, shake: 0 },
    furthestX: 0, lastTop: 0, segCount: 0,
    lastChunkId: '', chunksSinceBreather: 0, threatX: -300,
    score: 0, distance: 0, combo: 0, over: false,
    best: Number(localStorage.getItem(BEST_KEY) || 0),
    coyote: 0, wallCoyote: 0, buffer: 0,
    accent, accentLight,
  }
  let prevJump = false, prevDive = false, prevGrapple = false

  function blankPlayer(): Player {
    return { x: 0, y: 0, vx: 0, vy: 0, onGround: false, wall: 0, clinging: false, diving: false, grappling: false, anchorRef: null, airJumps: 1, jumping: false, face: 1, squash: 0, blink: 2, prevBottom: 0 }
  }

  function spawn(x: number, y: number, n: number, color: string, o: { spread?: number; up?: number; grav?: number; size?: number } = {}) {
    const { spread = 120, up = 120, grav = 900, size = 4 } = o
    for (let i = 0; i < n; i++) state.particles.push({ x, y, vx: rand(-spread, spread), vy: rand(-up, up * 0.2), life: rand(0.3, 0.7), max: 0.7, size: rand(size * 0.6, size), color, grav })
    if (state.particles.length > 360) state.particles.splice(0, state.particles.length - 360)
  }

  function initBubbles() {
    state.bubbles = []
    const n = Math.max(16, Math.floor(state.W / 36))
    for (let i = 0; i < n; i++) {
      const near = Math.random() < 0.45
      state.bubbles.push({ x: rand(0, state.W), y: rand(0, state.H), r: near ? rand(5, 13) : rand(2, 6), vy: rand(12, 34), sway: rand(8, 24), phase: rand(0, 6.28), near })
    }
  }

  // Stitch fair, escalating chunks (chunks.ts) up to targetX. Each chunk starts
  // at the running groundY (state.lastTop) and returns its width + new exitY.
  function genChunks(targetX: number) {
    const H = state.H
    while (state.furthestX < targetX) {
      const chunk = state.chunksSinceBreather >= 4
        ? CHUNKS.find((k) => k.id === 'breather')!
        : pickChunk(state.distance, Math.random, state.lastChunkId)
      const x0 = state.furthestX
      const ctx: ChunkCtx = {
        x0, groundY: state.lastTop, H, rng: Math.random,
        plat: (x, y, w) => state.platforms.push({ x, y, w, h: H - y + 260, ground: true }),
        float: (x, y, w) => state.platforms.push({ x, y, w, h: 16, ground: false }),
        wall: (x, y, w, h) => state.platforms.push({ x, y, w, h, ground: false }),
        coin: (x, y) => state.coins.push({ x, y, taken: false, phase: Math.random() * 6 }),
        enemy: (x, y, minX, maxX) => state.enemies.push({ x, y, w: 32, h: 30, vx: rand(52, 92) * (Math.random() < 0.5 ? -1 : 1), minX, maxX, dead: false, blink: rand(1, 4), wob: Math.random() * 6 }),
        anchor: (x, y) => state.anchors.push({ x, y }),
      }
      const { width, exitY } = chunk.build(ctx)
      state.furthestX = x0 + width
      state.lastTop = clamp(exitY, H * 0.4, H * 0.82)
      state.lastChunkId = chunk.id
      state.chunksSinceBreather = chunk.id === 'breather' ? 0 : state.chunksSinceBreather + 1
      state.segCount++
    }
  }

  function reset() {
    const H = state.H
    state.platforms = []; state.coins = []; state.enemies = []; state.anchors = []; state.particles = []; state.popups = []
    state.furthestX = 0; state.segCount = 0; state.lastTop = H * 0.7; state.cam.x = 0; state.cam.shake = 0
    state.lastChunkId = ''; state.chunksSinceBreather = 0; state.threatX = -320
    state.score = 0; state.distance = 0; state.combo = 0; state.over = false
    state.coyote = 0; state.wallCoyote = 0; state.buffer = 0
    // A long, safe, enemy-free start so the player gets their footing.
    state.platforms.push({ x: 0, y: state.lastTop, w: 540, h: H - state.lastTop + 260, ground: true })
    state.furthestX = 540
    genChunks(state.W * 1.6)
    const p = blankPlayer()
    p.x = 96; p.y = state.lastTop - PH; p.onGround = true; p.prevBottom = state.lastTop; p.blink = rand(2, 5)
    state.player = p
    initBubbles()
  }

  function endGame() {
    if (state.over) return
    state.over = true
    state.cam.shake = Math.max(state.cam.shake, 10)
    spawn(state.player.x + PW / 2, state.player.y + PH / 2, 18, state.accent, { spread: 220, up: 240, size: 6 })
    const total = state.score * 10 + state.distance
    if (total > state.best) { state.best = total; localStorage.setItem(BEST_KEY, String(state.best)) }
  }

  function sideWall(side: number): boolean {
    const p = state.player
    const probe: Rect = { x: side < 0 ? p.x - PHYS.WALL_STICK : p.x + PW, y: p.y + 5, w: PHYS.WALL_STICK, h: PH - 10 }
    return state.platforms.some((pl) => overlap(probe, pl))
  }

  function step(dt: number, input: Input) {
    const s = state, p = s.player, H = s.H, W = s.W
    s.time += dt
    const jumpPressed = input.jump && !prevJump
    const divePressed = input.dive && !prevDive
    const grapplePressed = input.grapple && !prevGrapple

    // Ambient + effects always animate.
    for (const b of s.bubbles) { b.y -= b.vy * dt; b.x += Math.sin(s.time + b.phase) * b.sway * dt; if (b.y < -20) { b.y = H + 20; b.x = rand(0, W) } }
    for (const pa of s.particles) { pa.vy += pa.grav * dt; pa.x += pa.vx * dt; pa.y += pa.vy * dt; pa.life -= dt }
    s.particles = s.particles.filter((pa) => pa.life > 0)
    for (const u of s.popups) { u.y -= 38 * dt; u.life -= dt }
    s.popups = s.popups.filter((u) => u.life > 0)
    s.cam.shake *= Math.pow(0.0006, dt)

    if (s.over) {
      if (jumpPressed || input.restart) reset()
      input.restart = false
      prevJump = input.jump; prevDive = input.dive; prevGrapple = input.grapple
      return
    }

    // ── Horizontal: accelerate toward target, friction when idle. ──
    const dir = (input.right ? 1 : 0) - (input.left ? 1 : 0)
    if (dir !== 0) {
      const accel = (p.onGround ? PHYS.ACCEL_GROUND : PHYS.ACCEL_AIR) * dt
      p.vx = clamp(p.vx + dir * accel, -PHYS.MOVE_SPEED, PHYS.MOVE_SPEED)
      p.face = dir
    } else if (p.onGround) {
      const f = PHYS.FRICTION * dt
      p.vx = Math.abs(p.vx) <= f ? 0 : p.vx - Math.sign(p.vx) * f
    }

    // ── Jump buffer / coyote bookkeeping. ──
    s.buffer = jumpPressed ? PHYS.BUFFER : Math.max(0, s.buffer - dt)
    s.coyote = p.onGround ? PHYS.COYOTE : s.coyote - dt
    s.wallCoyote = p.clinging ? PHYS.WALL_COYOTE : s.wallCoyote - dt

    // ── Resolve a jump (ground → wall → double). ──
    if (s.buffer > 0 && !p.grappling) {
      if (s.coyote > 0) {
        p.vy = -PHYS.JUMP_V; p.jumping = true; p.onGround = false; s.buffer = 0; s.coyote = 0; p.diving = false
        spawn(p.x + PW / 2, p.y + PH, 6, '#caa2ff', { spread: 70, up: 40, grav: 500 })
      } else if (p.wall !== 0 && (p.clinging || s.wallCoyote > 0)) {
        p.vx = -p.wall * PHYS.WALL_JUMP_VX; p.vy = -PHYS.WALL_JUMP_VY; p.face = -p.wall
        p.jumping = true; p.clinging = false; p.airJumps = 1; s.buffer = 0; s.wallCoyote = 0; p.diving = false
        spawn(p.x + (p.wall < 0 ? 0 : PW), p.y + PH / 2, 7, '#caa2ff', { spread: 90, up: 80, grav: 500 })
      } else if (p.airJumps > 0) {
        p.vy = -PHYS.DOUBLE_JUMP_V; p.airJumps--; p.jumping = true; s.buffer = 0; p.diving = false; p.squash = -0.3
        spawn(p.x + PW / 2, p.y + PH / 2, 10, accentLight, { spread: 130, up: 60, grav: 300, size: 3 })
      }
    }
    // Variable height: cut a rising jump on release.
    if (!input.jump && p.jumping && p.vy < 0) { p.vy *= PHYS.JUMP_CUT; p.jumping = false }
    if (p.vy >= 0) p.jumping = false

    // ── Dive-stomp. ──
    if (divePressed && !p.onGround && !p.diving && !p.grappling) { p.diving = true; p.vy = PHYS.DIVE_VY; p.jumping = false }

    // ── Grapple: grab the nearest anchor in range, get yanked toward it. ──
    if (grapplePressed && !p.grappling) {
      let best: Anchor | null = null, bestD = PHYS.GRAPPLE_RANGE * PHYS.GRAPPLE_RANGE
      for (const a of s.anchors) { const dx = a.x - (p.x + PW / 2), dy = a.y - (p.y + PH / 2), d = dx * dx + dy * dy; if (d < bestD) { bestD = d; best = a } }
      if (best) { p.grappling = true; p.anchorRef = best; p.diving = false; p.jumping = false }
    }

    const pr = (): Rect => ({ x: p.x, y: p.y, w: PW, h: PH })
    p.prevBottom = p.y + PH

    if (p.grappling) {
      const a = p.anchorRef
      if (!a || !input.grapple) { p.grappling = false; p.anchorRef = null }
      else {
        const cx = p.x + PW / 2, cy = p.y + PH / 2, dx = a.x - cx, dy = a.y - cy, d = Math.hypot(dx, dy) || 1
        if (d < PHYS.GRAPPLE_REACH || jumpPressed) {
          p.grappling = false; p.anchorRef = null; p.vy = -PHYS.JUMP_V * (jumpPressed ? 0.72 : 0.5); p.airJumps = 1; if (jumpPressed) p.jumping = true
          spawn(cx, cy, 8, accentLight, { spread: 120, up: 60, grav: 400 })
        } else {
          const gdir = (input.right ? 1 : 0) - (input.left ? 1 : 0)
          p.vx = (dx / d) * PHYS.GRAPPLE_PULL + gdir * 70
          p.vy = (dy / d) * PHYS.GRAPPLE_PULL
          if (gdir !== 0) p.face = gdir
        }
      }
    }

    if (p.grappling) {
      // Yanked through the air (no terrain collision while reeling — fast + clean).
      p.x += p.vx * dt; p.y += p.vy * dt; p.onGround = false; p.clinging = false
      if (p.x < 0) p.x = 0
      if (Math.random() < dt * 30) spawn(p.x + PW / 2, p.y + PH / 2, 1, accentLight, { spread: 30, up: 30, grav: 200, size: 2 })
    } else {
      // ── Gravity. ──
      p.vy += PHYS.GRAVITY * dt

      // ── Move + resolve X. ──
      p.x += p.vx * dt
      for (const pl of s.platforms) { if (!overlap(pr(), pl)) continue; if (p.vx > 0) p.x = pl.x - PW; else if (p.vx < 0) p.x = pl.x + pl.w; p.vx = 0 }
      if (p.x < 0) { p.x = 0; p.vx = 0 }

      // ── Wall detection + cling (before Y so slide caps fall speed). ──
      const leftW = sideWall(-1), rightW = sideWall(1)
      const pressInto = input.left && leftW ? -1 : input.right && rightW ? 1 : 0
      p.wall = pressInto !== 0 ? pressInto : leftW ? -1 : rightW ? 1 : 0
      p.clinging = !p.onGround && p.vy > -20 && pressInto !== 0 && !p.diving
      if (p.clinging) { p.vy = Math.min(p.vy, PHYS.WALL_SLIDE_MAX); p.airJumps = 1; p.face = -p.wall; if (Math.random() < dt * 18) spawn(p.x + (p.wall < 0 ? 0 : PW), p.y + rand(6, PH - 6), 1, '#caa2ff', { spread: 20, up: 20, grav: 300, size: 2 }) }

      // ── Move + resolve Y. ──
      const wasGround = p.onGround
      p.onGround = false
      p.y += p.vy * dt
      for (const pl of s.platforms) {
        if (!overlap(pr(), pl)) continue
        if (p.vy > 0) {
          const landVy = p.vy
          p.y = pl.y - PH; p.vy = 0; p.onGround = true
          if (p.diving) { p.diving = false; s.cam.shake = Math.max(s.cam.shake, 5); spawn(p.x + PW / 2, pl.y, 14, '#caa2ff', { spread: 180, up: 40, grav: 600 }) }
          else if (!wasGround && landVy > 360) { p.squash = 0.4; s.cam.shake = Math.max(s.cam.shake, clamp(landVy / 240, 1.2, 5)); spawn(p.x + PW / 2, pl.y, Math.min(9, (landVy / 130) | 0), '#caa2ff', { spread: 100, up: 25, grav: 600 }) }
        } else if (p.vy < 0) { p.y = pl.y + pl.h; p.vy = 0; p.jumping = false }
      }
    }
    if (p.onGround) { p.airJumps = 1; s.combo = 0 }
    p.squash += (0 - p.squash) * Math.min(1, dt * 12)
    if (p.onGround && Math.abs(p.vx) > 190 && Math.random() < dt * 22) spawn(p.x + PW / 2 - p.face * 10, p.y + PH, 1, '#caa2ff', { spread: 30, up: 30, grav: 500, size: 3 })
    p.blink -= dt; if (p.blink < 0) p.blink = rand(2.5, 6)

    // ── Camera + world streaming. ──
    s.distance = Math.max(s.distance, Math.floor(p.x / 48))
    const targetCam = clamp(p.x - W * 0.34 + p.face * 56, 0, Infinity)
    s.cam.x += (targetCam - s.cam.x) * Math.min(1, dt * 6)
    genChunks(s.cam.x + W + 460)

    // The Devourer creeps forward (faster with distance); caught = game over.
    const tSpeed = 60 + Math.min(s.distance * 0.16, 150)
    s.threatX += tSpeed * dt
    s.threatX = Math.max(s.threatX, s.cam.x - W * 1.3) // never lurk more than ~1.3 screens back
    if (p.x + PW < s.threatX) { spawn(p.x + PW / 2, p.y + PH / 2, 10, '#c34de6', { spread: 160, up: 160 }); endGame() }
    const cut = s.cam.x - 220
    s.platforms = s.platforms.filter((pl) => pl.x + pl.w > cut)
    s.coins = s.coins.filter((c) => c.x > cut && !c.taken)
    s.enemies = s.enemies.filter((e) => e.x + e.w > cut && !e.dead)
    s.anchors = s.anchors.filter((a) => a.x > cut)

    // ── Orbs. ──
    for (const c of s.coins) {
      if (c.taken) continue
      const dx = p.x + PW / 2 - c.x, dy = p.y + PH / 2 - (c.y + Math.sin(s.time * 3 + c.phase) * 4)
      if (dx * dx + dy * dy < 28 * 28) {
        c.taken = true
        // Air orbs feed the combo and pay the multiplier; ground orbs are +1.
        let pts = 1
        if (!p.onGround) { s.combo++; pts = s.combo }
        s.score += pts
        spawn(c.x, c.y, 10, '#83f1ff', { spread: 90, up: 120, grav: 300 })
        s.popups.push({ x: c.x, y: c.y - 8, text: pts > 1 ? `+${pts} x${s.combo}` : '+1', life: 0.8 })
      }
    }

    // ── Enemies. ──
    for (const e of s.enemies) {
      if (e.dead) continue
      e.x += e.vx * dt; e.blink -= dt; if (e.blink < 0) e.blink = rand(1.5, 4); e.wob += dt
      if (e.x < e.minX) { e.x = e.minX; e.vx = Math.abs(e.vx) }
      if (e.x + e.w > e.maxX) { e.x = e.maxX - e.w; e.vx = -Math.abs(e.vx) }
      if (!p.grappling && overlap(pr(), e)) {
        if (p.prevBottom <= e.y + 8 && p.vy >= 0) {
          e.dead = true; p.vy = -(p.diving ? PHYS.DIVE_BOUNCE : PHYS.JUMP_V * 0.7); p.diving = false; p.airJumps = 1
          s.combo++; const pts = 2 * Math.max(1, s.combo); s.score += pts
          s.cam.shake = Math.max(s.cam.shake, 4)
          spawn(e.x + e.w / 2, e.y + e.h / 2, 16, '#86e36a', { spread: 160, up: 160, grav: 800, size: 5 })
          s.popups.push({ x: e.x + e.w / 2, y: e.y, text: s.combo > 1 ? `+${pts} x${s.combo}` : `+${pts}`, life: 0.9 })
        } else endGame()
      }
    }

    if (p.y > H + 160) endGame()
    prevJump = input.jump; prevDive = input.dive; prevGrapple = input.grapple
  }

  return { state, reset, step }
}
