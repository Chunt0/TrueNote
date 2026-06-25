import { useEffect, useRef } from 'react'

// A tiny procedurally-generated side-scroller for the wiki landing: the putty-ai
// blob runs through an endless world, collects coins, and stomps enemies.
// Controls: A/D move, Space jump (R restart) — plus on-screen buttons for touch.
// Self-contained: one canvas, one rAF loop, all game state in refs. No deps.

interface Rect { x: number; y: number; w: number; h: number }
interface Coin { x: number; y: number; taken: boolean; phase: number }
interface Enemy { x: number; y: number; w: number; h: number; vx: number; minX: number; maxX: number; dead: boolean }
interface Platform extends Rect { ground: boolean }

const rand = (a: number, b: number) => a + Math.random() * (b - a)
const randint = (a: number, b: number) => Math.floor(rand(a, b + 1))
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))

// Player physics (CSS px / second).
const GRAVITY = 2300
const MOVE_SPEED = 290
const ACCEL = 2400
const JUMP_V = 780
const COYOTE = 0.09
const BUFFER = 0.12
const PW = 36
const PH = 40

const BEST_KEY = 'putty-runner-best'

export function PuttyRunner() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const input = useRef({ left: false, right: false, jump: false, restart: false })

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    // Non-null type (not just flow-narrowed) so the nested closures keep it.
    const ctx: CanvasRenderingContext2D = canvas.getContext('2d')!

    // Theme accent for the blob (falls back to coral).
    const css = getComputedStyle(document.documentElement)
    const accent = (css.getPropertyValue('--accent-solid') || css.getPropertyValue('--accent') || '#ff7a5c').trim() || '#ff7a5c'

    let W = canvas.clientWidth || 800
    let H = canvas.clientHeight || 400

    // ── Game state ────────────────────────────────────────────────────────
    let platforms: Platform[] = []
    let coins: Coin[] = []
    let enemies: Enemy[] = []
    let player = { x: 0, y: 0, vx: 0, vy: 0, onGround: false, prevBottom: 0, face: 1, squash: 0 }
    let cameraX = 0
    let furthestX = 0
    let lastTop = 0
    let segCount = 0
    let score = 0
    let distance = 0
    let over = false
    let best = Number(localStorage.getItem(BEST_KEY) || 0)
    let time = 0
    let coyote = 0
    let buffer = 0

    function genTo(targetX: number) {
      while (furthestX < targetX) {
        // Occasional pit to jump over (never in the first few segments).
        if (segCount > 2 && Math.random() < 0.16) furthestX += rand(70, 150)
        const w = rand(170, 360)
        const step = [0, 0, 50, 90][randint(0, 3)] * (Math.random() < 0.5 ? -1 : 1)
        lastTop = clamp(lastTop + step, H * 0.42, H * 0.82)
        const top = lastTop
        const x = furthestX
        platforms.push({ x, y: top, w, h: H - top + 240, ground: true })

        // Coins in a little arc along the platform.
        const n = randint(0, 4)
        for (let i = 0; i < n; i++) {
          coins.push({ x: x + 36 + i * 34, y: top - 46 - Math.sin((i / Math.max(n - 1, 1)) * Math.PI) * 40, taken: false, phase: Math.random() * 6 })
        }
        // Sometimes a floating platform with a coin reward above.
        if (Math.random() < 0.3 && w > 200) {
          const fx = x + rand(20, w - 120)
          const fy = top - rand(90, 150)
          platforms.push({ x: fx, y: fy, w: rand(70, 120), h: 16, ground: false })
          for (let i = 0; i < 3; i++) coins.push({ x: fx + 18 + i * 26, y: fy - 30, taken: false, phase: Math.random() * 6 })
        }
        // Sometimes an enemy patrolling this platform.
        if (segCount > 2 && Math.random() < 0.5 && w > 170) {
          const ew = 30
          enemies.push({ x: x + w / 2, y: top - 30, w: ew, h: 30, vx: rand(50, 90) * (Math.random() < 0.5 ? -1 : 1), minX: x + 8, maxX: x + w - 8, dead: false })
        }
        furthestX = x + w
        segCount++
      }
    }

    function reset() {
      platforms = []; coins = []; enemies = []
      furthestX = 0; segCount = 0; lastTop = H * 0.7; cameraX = 0
      score = 0; distance = 0; over = false; coyote = 0; buffer = 0
      // A safe flat starting platform.
      platforms.push({ x: 0, y: lastTop, w: 420, h: H - lastTop + 240, ground: true })
      furthestX = 420; segCount = 3
      genTo(W * 1.6)
      player = { x: 90, y: lastTop - PH, vx: 0, vy: 0, onGround: true, prevBottom: lastTop, face: 1, squash: 0 }
    }

    function overlap(a: Rect, b: Rect) {
      return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y
    }

    function update(dt: number) {
      time += dt
      if (over) {
        if ((input.current.jump || input.current.restart) ) reset()
        input.current.restart = false
        return
      }

      // Horizontal: accelerate toward target speed.
      const dir = (input.current.right ? 1 : 0) - (input.current.left ? 1 : 0)
      const target = dir * MOVE_SPEED
      if (player.vx < target) player.vx = Math.min(target, player.vx + ACCEL * dt)
      else if (player.vx > target) player.vx = Math.max(target, player.vx - ACCEL * dt)
      if (dir !== 0) player.face = dir

      // Jump with coyote time + input buffer for a forgiving feel.
      coyote = player.onGround ? COYOTE : coyote - dt
      buffer = input.current.jump ? BUFFER : buffer - dt
      if (buffer > 0 && coyote > 0) {
        player.vy = -JUMP_V
        player.onGround = false
        coyote = 0; buffer = 0
        player.squash = -0.25
      }
      player.vy += GRAVITY * dt

      player.prevBottom = player.y + PH

      // Move + resolve X.
      player.x += player.vx * dt
      const pr = (): Rect => ({ x: player.x, y: player.y, w: PW, h: PH })
      for (const p of platforms) {
        if (!overlap(pr(), p)) continue
        if (player.vx > 0) player.x = p.x - PW
        else if (player.vx < 0) player.x = p.x + p.w
        player.vx = 0
      }
      if (player.x < 0) { player.x = 0; player.vx = 0 }

      // Move + resolve Y.
      player.onGround = false
      player.y += player.vy * dt
      for (const p of platforms) {
        if (!overlap(pr(), p)) continue
        if (player.vy > 0) { player.y = p.y - PH; player.vy = 0; player.onGround = true; if (player.squash < 0.0001 && player.squash > -0.0001) player.squash = 0.3 }
        else if (player.vy < 0) { player.y = p.y + p.h; player.vy = 0 }
      }
      player.squash += (0 - player.squash) * Math.min(1, dt * 12)

      distance = Math.max(distance, Math.floor(player.x / 48))

      // Camera follows the player (kept ~1/3 from the left).
      cameraX = Math.max(0, player.x - W * 0.33)

      genTo(cameraX + W + 420)
      // Cull behind.
      const cutoff = cameraX - 200
      platforms = platforms.filter((p) => p.x + p.w > cutoff)
      coins = coins.filter((c) => c.x > cutoff && !c.taken)
      enemies = enemies.filter((e) => e.x + e.w > cutoff && !e.dead)

      // Coins.
      for (const c of coins) {
        if (c.taken) continue
        const dx = player.x + PW / 2 - c.x
        const dy = player.y + PH / 2 - c.y
        if (dx * dx + dy * dy < 26 * 26) { c.taken = true; score++ }
      }

      // Enemies.
      for (const e of enemies) {
        if (e.dead) continue
        e.x += e.vx * dt
        if (e.x < e.minX) { e.x = e.minX; e.vx = Math.abs(e.vx) }
        if (e.x + e.w > e.maxX) { e.x = e.maxX - e.w; e.vx = -Math.abs(e.vx) }
        if (overlap(pr(), e)) {
          // Stomp if the player was above the enemy's top and is moving down.
          if (player.prevBottom <= e.y + 6 && player.vy >= 0) {
            e.dead = true
            player.vy = -JUMP_V * 0.7
            player.squash = -0.3
            score += 2
          } else {
            endGame()
          }
        }
      }

      // Fell into a pit.
      if (player.y > H + 140) endGame()
    }

    function endGame() {
      over = true
      const total = score * 10 + distance
      if (total > best) { best = total; localStorage.setItem(BEST_KEY, String(best)) }
    }

    // ── Rendering ───────────────────────────────────────────────────────────
    function roundRect(x: number, y: number, w: number, h: number, r: number) {
      ctx.beginPath()
      ctx.moveTo(x + r, y)
      ctx.arcTo(x + w, y, x + w, y + h, r)
      ctx.arcTo(x + w, y + h, x, y + h, r)
      ctx.arcTo(x, y + h, x, y, r)
      ctx.arcTo(x, y, x + w, y, r)
      ctx.closePath()
    }

    function drawBackground() {
      const g = ctx.createLinearGradient(0, 0, 0, H)
      g.addColorStop(0, '#10162b')
      g.addColorStop(0.6, '#1b2746')
      g.addColorStop(1, '#243463')
      ctx.fillStyle = g
      ctx.fillRect(0, 0, W, H)
      // Parallax hills.
      for (let layer = 0; layer < 2; layer++) {
        const speed = 0.2 + layer * 0.25
        const baseY = H * (0.7 + layer * 0.12)
        ctx.fillStyle = layer === 0 ? 'rgba(60,80,140,0.35)' : 'rgba(40,56,104,0.5)'
        const off = (cameraX * speed) % 320
        for (let i = -1; i < W / 320 + 2; i++) {
          const hx = i * 320 - off
          ctx.beginPath()
          ctx.ellipse(hx + 160, baseY, 220, 150, 0, Math.PI, 2 * Math.PI)
          ctx.fill()
        }
      }
    }

    function drawBlob() {
      const cx = player.x + PW / 2
      const cy = player.y + PH / 2
      const stretch = clamp(1 - player.vy * 0.00018 + player.squash, 0.8, 1.3)
      const sy = stretch
      const sx = 1 / stretch
      ctx.save()
      ctx.translate(cx, cy)
      ctx.scale(sx, sy)
      // body
      ctx.fillStyle = accent
      ctx.beginPath()
      ctx.ellipse(0, 0, PW / 2 + 2, PH / 2 + 2, 0, 0, Math.PI * 2)
      ctx.fill()
      // subtle shine
      ctx.fillStyle = 'rgba(255,255,255,0.25)'
      ctx.beginPath()
      ctx.ellipse(-6, -8, 6, 4, -0.5, 0, Math.PI * 2)
      ctx.fill()
      // eyes
      const ex = player.face * 4
      ctx.fillStyle = '#fff'
      ctx.beginPath(); ctx.arc(-7 + ex, -4, 6, 0, Math.PI * 2); ctx.arc(8 + ex, -4, 6, 0, Math.PI * 2); ctx.fill()
      ctx.fillStyle = '#1a1a1a'
      ctx.beginPath(); ctx.arc(-6 + ex + player.face * 1.5, -3, 3, 0, Math.PI * 2); ctx.arc(9 + ex + player.face * 1.5, -3, 3, 0, Math.PI * 2); ctx.fill()
      // mouth
      ctx.strokeStyle = 'rgba(0,0,0,0.55)'; ctx.lineWidth = 2
      ctx.beginPath()
      if (player.onGround) ctx.arc(ex + 1, 6, 5, 0.1 * Math.PI, 0.9 * Math.PI)
      else ctx.arc(ex + 1, 7, 4, 0, Math.PI * 2)
      ctx.stroke()
      ctx.restore()
    }

    function render() {
      drawBackground()
      ctx.save()
      ctx.translate(-cameraX, 0)

      // Platforms.
      for (const p of platforms) {
        if (p.x + p.w < cameraX || p.x > cameraX + W) continue
        if (p.ground) {
          ctx.fillStyle = '#3a2a1e' // dirt
          roundRect(p.x, p.y, p.w, p.h, 6); ctx.fill()
          ctx.fillStyle = '#4caf50' // grass top
          roundRect(p.x, p.y, p.w, 12, 6); ctx.fill()
        } else {
          ctx.fillStyle = '#6b7bb0'
          roundRect(p.x, p.y, p.w, p.h, 6); ctx.fill()
        }
      }

      // Coins.
      for (const c of coins) {
        if (c.taken || c.x < cameraX - 30 || c.x > cameraX + W + 30) continue
        const s = Math.abs(Math.cos(time * 4 + c.phase))
        ctx.fillStyle = '#ffce3b'
        ctx.beginPath(); ctx.ellipse(c.x, c.y, 9 * s + 2, 11, 0, 0, Math.PI * 2); ctx.fill()
        ctx.fillStyle = 'rgba(255,255,255,0.6)'
        ctx.beginPath(); ctx.ellipse(c.x - 2 * s, c.y - 3, 2 * s + 0.5, 3, 0, 0, Math.PI * 2); ctx.fill()
      }

      // Enemies.
      for (const e of enemies) {
        if (e.dead || e.x + e.w < cameraX || e.x > cameraX + W) continue
        ctx.fillStyle = '#7c3aed'
        roundRect(e.x, e.y, e.w, e.h, 8); ctx.fill()
        ctx.fillStyle = '#fff'
        ctx.beginPath(); ctx.arc(e.x + 10, e.y + 11, 4, 0, Math.PI * 2); ctx.arc(e.x + 20, e.y + 11, 4, 0, Math.PI * 2); ctx.fill()
        ctx.fillStyle = '#1a1a1a'
        const ed = e.vx < 0 ? -1.5 : 1.5
        ctx.beginPath(); ctx.arc(e.x + 10 + ed, e.y + 11, 2, 0, Math.PI * 2); ctx.arc(e.x + 20 + ed, e.y + 11, 2, 0, Math.PI * 2); ctx.fill()
      }

      drawBlob()
      ctx.restore()

      // HUD.
      ctx.fillStyle = 'rgba(255,255,255,0.92)'
      ctx.font = '600 16px ui-sans-serif, system-ui, sans-serif'
      ctx.textAlign = 'left'
      ctx.fillText(`🪙 ${score}    ↦ ${distance}m`, 16, 26)
      ctx.textAlign = 'right'
      ctx.fillStyle = 'rgba(255,255,255,0.6)'
      ctx.fillText(`best ${best}`, W - 16, 26)
      ctx.textAlign = 'center'
      ctx.fillStyle = 'rgba(255,255,255,0.5)'
      ctx.font = '13px ui-sans-serif, system-ui, sans-serif'
      ctx.fillText('A / D  move     Space  jump', W / 2, H - 14)

      if (over) {
        ctx.fillStyle = 'rgba(8,10,20,0.62)'
        ctx.fillRect(0, 0, W, H)
        ctx.textAlign = 'center'
        ctx.fillStyle = '#fff'
        ctx.font = '700 36px ui-sans-serif, system-ui, sans-serif'
        ctx.fillText('Game Over', W / 2, H / 2 - 24)
        ctx.font = '16px ui-sans-serif, system-ui, sans-serif'
        ctx.fillStyle = 'rgba(255,255,255,0.85)'
        ctx.fillText(`${score} coins · ${distance}m   (best ${best})`, W / 2, H / 2 + 6)
        ctx.fillStyle = accent
        ctx.font = '600 16px ui-sans-serif, system-ui, sans-serif'
        ctx.fillText('Press Space or tap to play again', W / 2, H / 2 + 38)
      }
    }

    // ── Loop + sizing ─────────────────────────────────────────────────────
    function fit() {
      const dpr = window.devicePixelRatio || 1
      const cw = canvas!.clientWidth, ch = canvas!.clientHeight
      if (cw === 0 || ch === 0) return
      if (canvas!.width !== Math.round(cw * dpr) || canvas!.height !== Math.round(ch * dpr)) {
        canvas!.width = Math.round(cw * dpr)
        canvas!.height = Math.round(ch * dpr)
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      W = cw; H = ch
    }

    let started = false
    let raf = 0
    let last = performance.now()
    let running = true
    function frame(now: number) {
      if (!running) return
      fit()
      // Defer the first world build until the canvas has a real size, so the
      // terrain isn't generated against the 800x400 fallback (which spawned the
      // blob into a pit).
      if (!started) {
        if (canvas!.clientWidth < 4 || canvas!.clientHeight < 4) { raf = requestAnimationFrame(frame); return }
        reset()
        started = true
        last = now
      }
      let dt = (now - last) / 1000
      last = now
      dt = Math.min(dt, 1 / 30)
      update(dt)
      render()
      raf = requestAnimationFrame(frame)
    }
    raf = requestAnimationFrame(frame)

    // ── Input (ignore when typing in a field; don't hijack Space there) ─────
    function typing(t: EventTarget | null) {
      return t instanceof HTMLElement && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)
    }
    function onKey(down: boolean) {
      return (e: KeyboardEvent) => {
        if (typing(e.target)) return
        const k = e.key.toLowerCase()
        if (k === 'a' || k === 'arrowleft') { input.current.left = down; e.preventDefault() }
        else if (k === 'd' || k === 'arrowright') { input.current.right = down; e.preventDefault() }
        else if (k === ' ' || k === 'spacebar' || k === 'arrowup' || k === 'w') { input.current.jump = down; e.preventDefault() }
        else if (k === 'r' && down) { input.current.restart = true }
      }
    }
    const kd = onKey(true)
    const ku = onKey(false)
    window.addEventListener('keydown', kd)
    window.addEventListener('keyup', ku)
    function onVis() { if (document.hidden) { input.current.left = input.current.right = input.current.jump = false } last = performance.now() }
    document.addEventListener('visibilitychange', onVis)

    return () => {
      running = false
      cancelAnimationFrame(raf)
      window.removeEventListener('keydown', kd)
      window.removeEventListener('keyup', ku)
      document.removeEventListener('visibilitychange', onVis)
    }
  }, [])

  // Touch controls (also work with a mouse). Hold to move/jump.
  const hold = (key: 'left' | 'right' | 'jump') => ({
    onPointerDown: (e: React.PointerEvent) => { e.preventDefault(); input.current[key] = true },
    onPointerUp: (e: React.PointerEvent) => { e.preventDefault(); input.current[key] = false },
    onPointerLeave: () => { input.current[key] = false },
    onPointerCancel: () => { input.current[key] = false },
  })

  return (
    <div className="relative h-full w-full overflow-hidden bg-[#10162b]">
      <canvas
        ref={canvasRef}
        className="block h-full w-full touch-none"
        onPointerDown={() => { input.current.restart = true }}
      />
      {/* On-screen controls — handy on touch devices. */}
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
