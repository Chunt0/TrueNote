import { useEffect, useRef } from 'react'

// PuttyRunner — a procedurally-generated alien-world side-scroller for the wiki
// landing. The putty-ai blob runs (A/D), jumps (Space), collects energy orbs, and
// stomps gloop enemies. R / tap restarts. Self-contained canvas: one rAF loop,
// all state in a closure; no assets, no deps. Earthworm-Jim-ish weird-alien look.

interface Rect { x: number; y: number; w: number; h: number }
interface Coin { x: number; y: number; taken: boolean; phase: number }
interface Enemy { x: number; y: number; w: number; h: number; vx: number; minX: number; maxX: number; dead: boolean; blink: number; wob: number }
interface Platform extends Rect { ground: boolean }
interface Particle { x: number; y: number; vx: number; vy: number; life: number; max: number; size: number; color: string; grav: number }
interface Popup { x: number; y: number; text: string; life: number }
interface Bubble { x: number; y: number; r: number; vy: number; sway: number; phase: number; near: boolean }

const rand = (a: number, b: number) => a + Math.random() * (b - a)
const randint = (a: number, b: number) => Math.floor(rand(a, b + 1))
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))
const lerp = (a: number, b: number, t: number) => a + (b - a) * t
// Deterministic pseudo-random for stable background elements by index.
const hash = (n: number) => { const x = Math.sin(n * 127.1 + 11.7) * 43758.5453; return x - Math.floor(x) }

// Physics (CSS px / second).
const GRAVITY = 2300
const MOVE_SPEED = 290
const ACCEL = 2400
const JUMP_V = 780
const COYOTE = 0.09
const BUFFER = 0.12
const PW = 38
const PH = 42

// Alien palette.
const C = {
  skyTop: '#1b0a31', skyMid: '#4a1550', skyLow: '#0f3d49',
  planet: '#d9b6ff', moon: '#bfe9e0',
  mtn: '#2a1146', spire: '#371a55', stalk: '#15082a',
  rock: '#3a1d57', rockDark: '#26113f', biolume: '#7be0ff',
  slime: '#7be36a', slimeDark: '#3f9b39',
  orb: '#83f1ff', orbEdge: '#27b4d8',
  gloo: '#a0ea6e', glooDark: '#5aa83a', goo: '#86e36a',
  dust: '#caa2ff',
}
const BEST_KEY = 'putty-runner-best'

export function PuttyRunner() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const input = useRef({ left: false, right: false, jump: false, restart: false })

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx: CanvasRenderingContext2D = canvas.getContext('2d')!

    const cssAccent = getComputedStyle(document.documentElement)
    const accent = (cssAccent.getPropertyValue('--accent-solid') || cssAccent.getPropertyValue('--accent') || '#ff7a5c').trim() || '#ff7a5c'
    const accentLight = '#ffd9cf'

    let W = canvas.clientWidth || 800
    let H = canvas.clientHeight || 400

    let platforms: Platform[] = []
    let coins: Coin[] = []
    let enemies: Enemy[] = []
    let particles: Particle[] = []
    let popups: Popup[] = []
    let bubbles: Bubble[] = []
    let player = { x: 0, y: 0, vx: 0, vy: 0, onGround: false, prevBottom: 0, face: 1, squash: 0, blink: 0, wasAir: 0 }
    const cam = { x: 0, shake: 0 }
    let furthestX = 0, lastTop = 0, segCount = 0
    let score = 0, distance = 0
    let over = false
    let best = Number(localStorage.getItem(BEST_KEY) || 0)
    let time = 0, coyote = 0, buffer = 0

    function spawn(x: number, y: number, n: number, color: string, opts: { spread?: number; up?: number; grav?: number; size?: number } = {}) {
      const { spread = 120, up = 120, grav = 900, size = 4 } = opts
      for (let i = 0; i < n; i++) {
        particles.push({ x, y, vx: rand(-spread, spread), vy: rand(-up, up * 0.2), life: rand(0.3, 0.7), max: 0.7, size: rand(size * 0.6, size), color, grav })
      }
      if (particles.length > 320) particles.splice(0, particles.length - 320)
    }

    function initBubbles() {
      bubbles = []
      const n = Math.max(16, Math.floor(W / 36))
      for (let i = 0; i < n; i++) {
        const near = Math.random() < 0.45
        bubbles.push({ x: rand(0, W), y: rand(0, H), r: near ? rand(5, 13) : rand(2, 6), vy: rand(12, 34), sway: rand(8, 24), phase: rand(0, 6.28), near })
      }
    }

    function genTo(targetX: number) {
      while (furthestX < targetX) {
        if (segCount > 2 && Math.random() < 0.16) furthestX += rand(70, 150)
        const w = rand(170, 360)
        const step = [0, 0, 50, 90][randint(0, 3)] * (Math.random() < 0.5 ? -1 : 1)
        lastTop = clamp(lastTop + step, H * 0.42, H * 0.82)
        const top = lastTop
        const x = furthestX
        platforms.push({ x, y: top, w, h: H - top + 260, ground: true })
        const n = randint(0, 4)
        for (let i = 0; i < n; i++) coins.push({ x: x + 36 + i * 34, y: top - 48 - Math.sin((i / Math.max(n - 1, 1)) * Math.PI) * 40, taken: false, phase: Math.random() * 6 })
        if (Math.random() < 0.3 && w > 200) {
          const fx = x + rand(20, w - 120), fy = top - rand(95, 155)
          platforms.push({ x: fx, y: fy, w: rand(70, 120), h: 18, ground: false })
          for (let i = 0; i < 3; i++) coins.push({ x: fx + 18 + i * 26, y: fy - 30, taken: false, phase: Math.random() * 6 })
        }
        if (segCount > 2 && Math.random() < 0.5 && w > 170) {
          enemies.push({ x: x + w / 2, y: top - 30, w: 32, h: 30, vx: rand(50, 92) * (Math.random() < 0.5 ? -1 : 1), minX: x + 8, maxX: x + w - 8, dead: false, blink: rand(1, 4), wob: Math.random() * 6 })
        }
        furthestX = x + w
        segCount++
      }
    }

    function reset() {
      platforms = []; coins = []; enemies = []; particles = []; popups = []
      furthestX = 0; segCount = 0; lastTop = H * 0.7; cam.x = 0; cam.shake = 0
      score = 0; distance = 0; over = false; coyote = 0; buffer = 0
      platforms.push({ x: 0, y: lastTop, w: 440, h: H - lastTop + 260, ground: true })
      furthestX = 440; segCount = 3
      genTo(W * 1.6)
      player = { x: 96, y: lastTop - PH, vx: 0, vy: 0, onGround: true, prevBottom: lastTop, face: 1, squash: 0, blink: rand(2, 5), wasAir: 0 }
      initBubbles()
    }

    const overlap = (a: Rect, b: Rect) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y

    function endGame() {
      if (over) return
      over = true
      cam.shake = Math.max(cam.shake, 10)
      spawn(player.x + PW / 2, player.y + PH / 2, 18, accent, { spread: 220, up: 240, size: 6 })
      const total = score * 10 + distance
      if (total > best) { best = total; localStorage.setItem(BEST_KEY, String(best)) }
    }

    function update(dt: number) {
      time += dt
      // Ambient bubbles + particles + popups always animate.
      for (const b of bubbles) {
        b.y -= b.vy * dt; b.x += Math.sin(time + b.phase) * b.sway * dt
        if (b.y < -20) { b.y = H + 20; b.x = rand(0, W) }
      }
      for (const p of particles) { p.vy += p.grav * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.life -= dt }
      particles = particles.filter((p) => p.life > 0)
      for (const u of popups) { u.y -= 38 * dt; u.life -= dt }
      popups = popups.filter((u) => u.life > 0)
      cam.shake *= Math.pow(0.0006, dt)

      if (over) {
        if (input.current.jump || input.current.restart) reset()
        input.current.restart = false
        return
      }

      const dir = (input.current.right ? 1 : 0) - (input.current.left ? 1 : 0)
      const targetV = dir * MOVE_SPEED
      player.vx += clamp(targetV - player.vx, -ACCEL * dt, ACCEL * dt)
      if (dir !== 0) player.face = dir

      coyote = player.onGround ? COYOTE : coyote - dt
      buffer = input.current.jump ? BUFFER : buffer - dt
      if (buffer > 0 && coyote > 0) {
        player.vy = -JUMP_V; player.onGround = false; coyote = 0; buffer = 0; player.squash = -0.28
        spawn(player.x + PW / 2, player.y + PH, 6, C.dust, { spread: 70, up: 40, grav: 500, size: 4 })
      }
      player.vy += GRAVITY * dt
      player.prevBottom = player.y + PH
      player.wasAir = player.onGround ? 0 : player.wasAir + dt

      player.x += player.vx * dt
      const pr = (): Rect => ({ x: player.x, y: player.y, w: PW, h: PH })
      for (const p of platforms) { if (!overlap(pr(), p)) continue; if (player.vx > 0) player.x = p.x - PW; else if (player.vx < 0) player.x = p.x + p.w; player.vx = 0 }
      if (player.x < 0) { player.x = 0; player.vx = 0 }

      const wasGround = player.onGround
      player.onGround = false
      player.y += player.vy * dt
      for (const p of platforms) {
        if (!overlap(pr(), p)) continue
        if (player.vy > 0) {
          const landVy = player.vy
          player.y = p.y - PH; player.vy = 0; player.onGround = true
          if (!wasGround && landVy > 350) { player.squash = 0.4; cam.shake = Math.max(cam.shake, clamp(landVy / 200, 1.5, 6)); spawn(player.x + PW / 2, p.y, Math.min(10, (landVy / 120) | 0), C.dust, { spread: 110, up: 30, grav: 600 }) }
        } else if (player.vy < 0) { player.y = p.y + p.h; player.vy = 0 }
      }
      player.squash += (0 - player.squash) * Math.min(1, dt * 12)
      // Running dust.
      if (player.onGround && Math.abs(player.vx) > 180 && Math.random() < dt * 22) spawn(player.x + PW / 2 - player.face * 10, player.y + PH, 1, C.dust, { spread: 30, up: 30, grav: 500, size: 3 })

      player.blink -= dt; if (player.blink < 0) player.blink = rand(2.5, 6)

      distance = Math.max(distance, Math.floor(player.x / 48))
      const targetCam = clamp(player.x - W * 0.34 + player.face * 60, 0, Infinity)
      cam.x = lerp(cam.x, targetCam, Math.min(1, dt * 6))

      genTo(cam.x + W + 460)
      const cut = cam.x - 220
      platforms = platforms.filter((p) => p.x + p.w > cut)
      coins = coins.filter((c) => c.x > cut && !c.taken)
      enemies = enemies.filter((e) => e.x + e.w > cut && !e.dead)

      for (const c of coins) {
        if (c.taken) continue
        const dx = player.x + PW / 2 - c.x, dy = player.y + PH / 2 - (c.y + Math.sin(time * 3 + c.phase) * 4)
        if (dx * dx + dy * dy < 28 * 28) {
          c.taken = true; score++
          spawn(c.x, c.y, 10, C.orb, { spread: 90, up: 120, grav: 300, size: 4 })
          popups.push({ x: c.x, y: c.y - 8, text: '+1', life: 0.8 })
        }
      }

      for (const e of enemies) {
        if (e.dead) continue
        e.x += e.vx * dt; e.blink -= dt; if (e.blink < 0) e.blink = rand(1.5, 4); e.wob += dt
        if (e.x < e.minX) { e.x = e.minX; e.vx = Math.abs(e.vx) }
        if (e.x + e.w > e.maxX) { e.x = e.maxX - e.w; e.vx = -Math.abs(e.vx) }
        if (overlap(pr(), e)) {
          if (player.prevBottom <= e.y + 7 && player.vy >= 0) {
            e.dead = true; player.vy = -JUMP_V * 0.7; player.squash = -0.32; score += 2
            cam.shake = Math.max(cam.shake, 4)
            spawn(e.x + e.w / 2, e.y + e.h / 2, 16, C.goo, { spread: 160, up: 160, grav: 800, size: 5 })
            popups.push({ x: e.x + e.w / 2, y: e.y, text: '+2', life: 0.9 })
          } else endGame()
        }
      }

      if (player.y > H + 160) endGame()
    }

    // ── Drawing ───────────────────────────────────────────────────────────
    function rr(x: number, y: number, w: number, h: number, r: number) {
      r = Math.min(r, w / 2, h / 2)
      ctx.beginPath()
      ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r)
      ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath()
    }

    function drawSky() {
      const g = ctx.createLinearGradient(0, 0, 0, H)
      g.addColorStop(0, C.skyTop); g.addColorStop(0.55, C.skyMid); g.addColorStop(1, C.skyLow)
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H)
      // Stars (very slow parallax).
      const so = cam.x * 0.05
      ctx.fillStyle = 'rgba(255,255,255,0.7)'
      for (let i = 0; i < 60; i++) {
        const sx = (hash(i) * 2400 - so) % 2400; const x = sx < 0 ? sx + 2400 : sx
        if (x > W) continue
        const y = hash(i + 99) * H * 0.6
        const tw = 0.4 + 0.6 * Math.abs(Math.sin(time * 1.5 + i))
        ctx.globalAlpha = tw * 0.8; ctx.fillRect(x, y, hash(i + 7) > 0.7 ? 2 : 1, hash(i + 7) > 0.7 ? 2 : 1)
      }
      ctx.globalAlpha = 1
      // Big alien planet + ring + a small moon (slow parallax).
      const px = W * 0.74 - cam.x * 0.06, py = H * 0.26
      ctx.save(); ctx.globalAlpha = 0.9
      const pg = ctx.createRadialGradient(px - 18, py - 18, 6, px, py, 60)
      pg.addColorStop(0, '#efd9ff'); pg.addColorStop(1, C.planet)
      ctx.fillStyle = pg; ctx.beginPath(); ctx.arc(px, py, 54, 0, 7); ctx.fill()
      ctx.strokeStyle = 'rgba(180,150,230,0.55)'; ctx.lineWidth = 5
      ctx.beginPath(); ctx.ellipse(px, py, 92, 24, -0.45, 0, 7); ctx.stroke()
      ctx.fillStyle = C.moon; ctx.globalAlpha = 0.85
      ctx.beginPath(); ctx.arc(W * 0.3 - cam.x * 0.04, H * 0.18, 16, 0, 7); ctx.fill()
      ctx.restore()
      // Far jagged mountains.
      drawRidge(0.25, H * 0.66, 70, C.mtn, 210, 0)
      drawRidge(0.4, H * 0.74, 90, C.spire, 260, 50)
    }

    function drawRidge(speed: number, baseY: number, amp: number, color: string, span: number, seed: number) {
      const off = cam.x * speed
      ctx.fillStyle = color
      ctx.beginPath(); ctx.moveTo(0, H)
      const start = Math.floor(off / span) - 1
      for (let i = start; i < start + W / span + 3; i++) {
        const x = i * span - off
        const peak = baseY - (0.4 + hash(i + seed) * 0.8) * amp
        ctx.lineTo(x, baseY); ctx.lineTo(x + span / 2, peak); ctx.lineTo(x + span, baseY)
      }
      ctx.lineTo(W, H); ctx.closePath(); ctx.fill()
    }

    function drawStalks() {
      const speed = 0.72, span = 120, off = cam.x * speed
      const start = Math.floor(off / span) - 1
      for (let i = start; i < start + W / span + 3; i++) {
        const x = i * span - off + hash(i) * 60
        const h = 90 + hash(i + 3) * 120
        const sway = Math.sin(time * 0.8 + i) * 10
        ctx.strokeStyle = C.stalk; ctx.lineWidth = 7; ctx.lineCap = 'round'
        ctx.beginPath(); ctx.moveTo(x, H); ctx.quadraticCurveTo(x + sway, H - h * 0.6, x + sway * 1.6, H - h); ctx.stroke()
        ctx.fillStyle = '#2a8f6e'; ctx.globalAlpha = 0.9
        ctx.beginPath(); ctx.arc(x + sway * 1.6, H - h, 9, 0, 7); ctx.fill(); ctx.globalAlpha = 1
      }
    }

    function drawBubbles(near: boolean) {
      for (const b of bubbles) {
        if (b.near !== near) continue
        ctx.fillStyle = near ? 'rgba(150,240,255,0.18)' : 'rgba(150,240,255,0.10)'
        ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, 7); ctx.fill()
        ctx.strokeStyle = 'rgba(190,250,255,0.35)'; ctx.lineWidth = 1
        ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, 7); ctx.stroke()
        ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.beginPath(); ctx.arc(b.x - b.r * 0.3, b.y - b.r * 0.3, b.r * 0.25, 0, 7); ctx.fill()
      }
    }

    function drawPlatform(p: Platform) {
      if (p.x + p.w < cam.x - 4 || p.x > cam.x + W + 4) return
      // Soft shadow.
      ctx.fillStyle = 'rgba(0,0,0,0.25)'; rr(p.x + 4, p.y + 8, p.w, Math.min(p.h, 40), 14); ctx.fill()
      if (p.ground) {
        const bg = ctx.createLinearGradient(0, p.y, 0, p.y + 80)
        bg.addColorStop(0, C.rock); bg.addColorStop(1, C.rockDark)
        ctx.fillStyle = bg; rr(p.x, p.y, p.w, p.h, 12); ctx.fill()
        // Bioluminescent specks.
        for (let i = 0; i < p.w / 26; i++) {
          const gx = p.x + 12 + i * 26 + hash(p.x + i) * 8, gy = p.y + 24 + hash(p.x + i + 5) * Math.min(p.h - 30, 90)
          ctx.fillStyle = C.biolume; ctx.globalAlpha = 0.5 + 0.5 * Math.sin(time * 2 + i)
          ctx.beginPath(); ctx.arc(gx, gy, 2, 0, 7); ctx.fill()
        }
        ctx.globalAlpha = 1
        // Slime top.
        const sg = ctx.createLinearGradient(0, p.y - 4, 0, p.y + 16)
        sg.addColorStop(0, C.slime); sg.addColorStop(1, C.slimeDark)
        ctx.fillStyle = sg; rr(p.x, p.y - 2, p.w, 16, 8); ctx.fill()
        ctx.fillStyle = 'rgba(255,255,255,0.25)'; rr(p.x + 4, p.y, p.w - 8, 3, 2); ctx.fill()
        // Drips.
        ctx.fillStyle = C.slimeDark
        for (let i = 0; i < p.w / 60; i++) {
          const dx = p.x + 24 + i * 60 + hash(p.x + i + 2) * 24, dl = 6 + hash(p.x + i + 9) * 12
          ctx.beginPath(); ctx.moveTo(dx - 4, p.y + 12); ctx.quadraticCurveTo(dx, p.y + 12 + dl, dx + 4, p.y + 12); ctx.fill()
          ctx.beginPath(); ctx.arc(dx, p.y + 12 + dl, 3, 0, 7); ctx.fill()
        }
      } else {
        const bg = ctx.createLinearGradient(0, p.y, 0, p.y + p.h)
        bg.addColorStop(0, C.slime); bg.addColorStop(1, C.rock)
        ctx.fillStyle = bg; rr(p.x, p.y, p.w, p.h, 9); ctx.fill()
        ctx.fillStyle = C.biolume; ctx.globalAlpha = 0.4 + 0.4 * Math.sin(time * 3 + p.x)
        ctx.beginPath(); ctx.arc(p.x + p.w / 2, p.y + p.h / 2, 2.5, 0, 7); ctx.fill(); ctx.globalAlpha = 1
      }
    }

    function drawCoin(c: Coin) {
      if (c.x < cam.x - 30 || c.x > cam.x + W + 30) return
      const y = c.y + Math.sin(time * 3 + c.phase) * 4
      const sx = Math.abs(Math.cos(time * 4 + c.phase)) * 0.9 + 0.1
      // Glow halo.
      const halo = ctx.createRadialGradient(c.x, y, 1, c.x, y, 22)
      halo.addColorStop(0, 'rgba(120,240,255,0.45)'); halo.addColorStop(1, 'rgba(120,240,255,0)')
      ctx.fillStyle = halo; ctx.beginPath(); ctx.arc(c.x, y, 22, 0, 7); ctx.fill()
      // Orb.
      const og = ctx.createRadialGradient(c.x - 3, y - 4, 1, c.x, y, 11)
      og.addColorStop(0, '#e8ffff'); og.addColorStop(0.5, C.orb); og.addColorStop(1, C.orbEdge)
      ctx.fillStyle = og; ctx.beginPath(); ctx.ellipse(c.x, y, 9 * sx + 2, 11, 0, 0, 7); ctx.fill()
      ctx.fillStyle = 'rgba(255,255,255,0.8)'; ctx.beginPath(); ctx.ellipse(c.x - 2 * sx, y - 4, 2 * sx + 0.5, 3, 0, 0, 7); ctx.fill()
    }

    function drawEnemy(e: Enemy) {
      if (e.x + e.w < cam.x || e.x > cam.x + W) return
      const wob = Math.sin(e.wob * 6) * 2
      const cx = e.x + e.w / 2, by = e.y + e.h
      ctx.fillStyle = 'rgba(0,0,0,0.22)'; ctx.beginPath(); ctx.ellipse(cx, by + 2, e.w * 0.5, 4, 0, 0, 7); ctx.fill()
      // Body.
      const g = ctx.createLinearGradient(0, e.y, 0, by)
      g.addColorStop(0, C.gloo); g.addColorStop(1, C.glooDark)
      ctx.fillStyle = g; rr(e.x - wob / 2, e.y + Math.abs(wob), e.w + wob, e.h - Math.abs(wob), 12); ctx.fill()
      // Feet.
      ctx.fillStyle = C.glooDark
      ctx.beginPath(); ctx.arc(cx - 8, by, 4, 0, 7); ctx.arc(cx + 8, by, 4, 0, 7); ctx.fill()
      // Antennae.
      ctx.strokeStyle = C.glooDark; ctx.lineWidth = 2
      for (const s of [-1, 1]) { ctx.beginPath(); ctx.moveTo(cx + s * 5, e.y + 2); ctx.lineTo(cx + s * 9, e.y - 8); ctx.stroke(); ctx.fillStyle = accent; ctx.beginPath(); ctx.arc(cx + s * 9, e.y - 9, 2.5, 0, 7); ctx.fill() }
      // Eyes (track player), blink.
      const look = clamp((player.x - e.x) / 120, -1.5, 1.5)
      const blinking = e.blink < 0.12
      ctx.fillStyle = '#fff'
      ctx.beginPath(); ctx.arc(cx - 7, e.y + 12, 6, 0, 7); ctx.arc(cx + 7, e.y + 12, 6, 0, 7); ctx.fill()
      if (blinking) { ctx.strokeStyle = '#1a1a1a'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(cx - 12, e.y + 12); ctx.lineTo(cx - 2, e.y + 12); ctx.moveTo(cx + 2, e.y + 12); ctx.lineTo(cx + 12, e.y + 12); ctx.stroke() }
      else { ctx.fillStyle = '#1a1a1a'; ctx.beginPath(); ctx.arc(cx - 7 + look * 2, e.y + 13, 2.6, 0, 7); ctx.arc(cx + 7 + look * 2, e.y + 13, 2.6, 0, 7); ctx.fill() }
    }

    function drawBlob() {
      const cx = player.x + PW / 2, cy = player.y + PH / 2
      // Ground shadow (shrinks with height).
      let groundY = player.y + PH
      for (const p of platforms) { if (player.x + PW > p.x && player.x < p.x + p.w && p.y >= player.y + PH - 2) { groundY = p.y; break } }
      const airT = clamp((groundY - (player.y + PH)) / 220, 0, 1)
      ctx.fillStyle = `rgba(0,0,0,${0.28 * (1 - airT)})`
      ctx.beginPath(); ctx.ellipse(cx, groundY + 3, (PW / 2) * (1 - airT * 0.5), 5 * (1 - airT * 0.5), 0, 0, 7); ctx.fill()
      // Motion trail.
      if (Math.abs(player.vx) > 220) { ctx.fillStyle = accent; ctx.globalAlpha = 0.18; ctx.beginPath(); ctx.ellipse(cx - player.face * 12, cy, PW / 2, PH / 2, 0, 0, 7); ctx.fill(); ctx.globalAlpha = 1 }

      const stretch = clamp(1 - player.vy * 0.00018 + player.squash, 0.78, 1.32)
      ctx.save(); ctx.translate(cx, cy); ctx.scale(1 / stretch, stretch)
      // Body (radial gradient + outline).
      const bg = ctx.createRadialGradient(-6, -8, 3, 0, 0, PW / 2 + 4)
      bg.addColorStop(0, accentLight); bg.addColorStop(1, accent)
      ctx.fillStyle = bg; ctx.beginPath(); ctx.ellipse(0, 0, PW / 2 + 2, PH / 2 + 2, 0, 0, 7); ctx.fill()
      ctx.fillStyle = 'rgba(255,255,255,0.28)'; ctx.beginPath(); ctx.ellipse(-7, -9, 6, 4, -0.5, 0, 7); ctx.fill()
      // Eyes track velocity/facing; blink.
      const ex = player.face * 4, lookY = clamp(player.vy * 0.004, -2, 3)
      const blinking = player.blink < 0.12 && player.onGround
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(-7 + ex, -4, 6.5, 0, 7); ctx.arc(8 + ex, -4, 6.5, 0, 7); ctx.fill()
      if (blinking) { ctx.strokeStyle = '#1a1a1a'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(-13 + ex, -4); ctx.lineTo(-1 + ex, -4); ctx.moveTo(2 + ex, -4); ctx.lineTo(14 + ex, -4); ctx.stroke() }
      else { ctx.fillStyle = '#1a1a1a'; ctx.beginPath(); ctx.arc(-6 + ex + player.face * 1.5, -3 + lookY, 3, 0, 7); ctx.arc(9 + ex + player.face * 1.5, -3 + lookY, 3, 0, 7); ctx.fill() }
      // Mouth: smile on ground, "o" in air.
      ctx.strokeStyle = 'rgba(0,0,0,0.55)'; ctx.lineWidth = 2; ctx.beginPath()
      if (player.onGround) ctx.arc(ex + 1, 6, 5, 0.12 * Math.PI, 0.88 * Math.PI)
      else { ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.ellipse(ex + 1, 7, 3, 4, 0, 0, 7); ctx.fill(); ctx.beginPath() }
      ctx.stroke()
      ctx.restore()
    }

    function render() {
      const shx = (Math.random() - 0.5) * cam.shake, shy = (Math.random() - 0.5) * cam.shake
      drawSky()
      drawBubbles(false)
      ctx.save(); ctx.translate(-cam.x + shx, shy)
      drawStalks()
      for (const p of platforms) drawPlatform(p)
      for (const c of coins) if (!c.taken) drawCoin(c)
      for (const e of enemies) if (!e.dead) drawEnemy(e)
      drawBlob()
      // Particles.
      for (const p of particles) { ctx.globalAlpha = clamp(p.life / p.max, 0, 1); ctx.fillStyle = p.color; ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, 7); ctx.fill() }
      ctx.globalAlpha = 1
      // Popups.
      ctx.font = '700 15px ui-sans-serif, system-ui, sans-serif'; ctx.textAlign = 'center'
      for (const u of popups) { ctx.globalAlpha = clamp(u.life / 0.8, 0, 1); ctx.fillStyle = C.orb; ctx.fillText(u.text, u.x, u.y) }
      ctx.globalAlpha = 1
      ctx.restore()
      drawBubbles(true)

      // Vignette.
      const vg = ctx.createRadialGradient(W / 2, H / 2, H * 0.4, W / 2, H / 2, H * 0.95)
      vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(5,2,12,0.55)')
      ctx.fillStyle = vg; ctx.fillRect(0, 0, W, H)

      // HUD.
      ctx.textAlign = 'left'
      // orb icon
      const ig = ctx.createRadialGradient(20, 21, 1, 22, 22, 8); ig.addColorStop(0, '#e8ffff'); ig.addColorStop(1, C.orbEdge)
      ctx.fillStyle = ig; ctx.beginPath(); ctx.arc(22, 22, 7, 0, 7); ctx.fill()
      ctx.fillStyle = 'rgba(255,255,255,0.95)'; ctx.font = '600 16px ui-sans-serif, system-ui, sans-serif'
      ctx.fillText(`${score}`, 36, 27); ctx.fillStyle = 'rgba(255,255,255,0.65)'; ctx.fillText(`${distance}m`, 72, 27)
      ctx.textAlign = 'right'; ctx.fillStyle = 'rgba(255,255,255,0.6)'; ctx.fillText(`best ${best}`, W - 16, 27)
      ctx.textAlign = 'center'; ctx.fillStyle = 'rgba(255,255,255,0.45)'; ctx.font = '13px ui-sans-serif, system-ui, sans-serif'
      ctx.fillText('A / D  move     Space  jump', W / 2, H - 14)

      if (over) {
        ctx.fillStyle = 'rgba(8,4,18,0.66)'; ctx.fillRect(0, 0, W, H)
        ctx.textAlign = 'center'; ctx.fillStyle = '#fff'; ctx.font = '700 38px ui-sans-serif, system-ui, sans-serif'
        ctx.fillText('Game Over', W / 2, H / 2 - 24)
        ctx.font = '16px ui-sans-serif, system-ui, sans-serif'; ctx.fillStyle = 'rgba(255,255,255,0.85)'
        ctx.fillText(`${score} orbs · ${distance}m   (best ${best})`, W / 2, H / 2 + 6)
        ctx.fillStyle = accent; ctx.font = '600 16px ui-sans-serif, system-ui, sans-serif'
        ctx.fillText('Press Space or tap to play again', W / 2, H / 2 + 38)
      }
    }

    function fit() {
      const dpr = window.devicePixelRatio || 1
      const cw = canvas!.clientWidth, ch = canvas!.clientHeight
      if (cw === 0 || ch === 0) return
      if (canvas!.width !== Math.round(cw * dpr) || canvas!.height !== Math.round(ch * dpr)) { canvas!.width = Math.round(cw * dpr); canvas!.height = Math.round(ch * dpr) }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      W = cw; H = ch
    }

    let started = false, raf = 0, last = performance.now(), running = true
    function frame(now: number) {
      if (!running) return
      fit()
      if (!started) { if (canvas!.clientWidth < 4 || canvas!.clientHeight < 4) { raf = requestAnimationFrame(frame); return } reset(); started = true; last = now }
      let dt = (now - last) / 1000; last = now; dt = Math.min(dt, 1 / 30)
      update(dt); render()
      raf = requestAnimationFrame(frame)
    }
    raf = requestAnimationFrame(frame)

    const typing = (t: EventTarget | null) => t instanceof HTMLElement && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)
    const onKey = (down: boolean) => (e: KeyboardEvent) => {
      if (typing(e.target)) return
      const k = e.key.toLowerCase()
      if (k === 'a' || k === 'arrowleft') { input.current.left = down; e.preventDefault() }
      else if (k === 'd' || k === 'arrowright') { input.current.right = down; e.preventDefault() }
      else if (k === ' ' || k === 'spacebar' || k === 'arrowup' || k === 'w') { input.current.jump = down; e.preventDefault() }
      else if (k === 'r' && down) input.current.restart = true
    }
    const kd = onKey(true), ku = onKey(false)
    window.addEventListener('keydown', kd); window.addEventListener('keyup', ku)
    const onVis = () => { if (document.hidden) { input.current.left = input.current.right = input.current.jump = false } last = performance.now() }
    document.addEventListener('visibilitychange', onVis)

    return () => { running = false; cancelAnimationFrame(raf); window.removeEventListener('keydown', kd); window.removeEventListener('keyup', ku); document.removeEventListener('visibilitychange', onVis) }
  }, [])

  const hold = (key: 'left' | 'right' | 'jump') => ({
    onPointerDown: (e: React.PointerEvent) => { e.preventDefault(); input.current[key] = true },
    onPointerUp: (e: React.PointerEvent) => { e.preventDefault(); input.current[key] = false },
    onPointerLeave: () => { input.current[key] = false },
    onPointerCancel: () => { input.current[key] = false },
  })

  return (
    <div className="relative h-full w-full overflow-hidden bg-[#1b0a31]">
      <canvas ref={canvasRef} className="block h-full w-full touch-none" onPointerDown={() => { input.current.restart = true }} />
      <div className="pointer-events-none absolute inset-x-0 bottom-3 flex select-none items-end justify-between px-4 md:hidden">
        <div className="flex gap-2">
          <GameButton label="◄" {...hold('left')} />
          <GameButton label="►" {...hold('right')} />
        </div>
        <GameButton label="▲" {...hold('jump')} />
      </div>
    </div>
  )
}

function GameButton({ label, ...handlers }: { label: string } & React.HTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      aria-label={label}
      className="pointer-events-auto flex size-14 items-center justify-center rounded-full border border-white/20 bg-white/10 text-xl text-white/90 backdrop-blur active:bg-white/25"
      {...handlers}
    >
      {label}
    </button>
  )
}
