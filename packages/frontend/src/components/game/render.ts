// Renderer: draws a GameState onto a 2D context. Pure drawing — no game logic.
import { C, PHYS } from './constants'
import type { Coin, Enemy, GameState, Platform } from './types'

const { PW, PH } = PHYS
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))
const hash = (n: number) => { const x = Math.sin(n * 127.1 + 11.7) * 43758.5453; return x - Math.floor(x) }

export function draw(ctx: CanvasRenderingContext2D, s: GameState) {
  const { W, H, cam, time } = s
  const accent = s.accent

  const rr = (x: number, y: number, w: number, h: number, r: number) => {
    r = Math.min(r, w / 2, h / 2)
    ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath()
  }
  const ridge = (speed: number, baseY: number, amp: number, color: string, span: number, seed: number) => {
    const off = cam.x * speed
    ctx.fillStyle = color; ctx.beginPath(); ctx.moveTo(0, H)
    const start = Math.floor(off / span) - 1
    for (let i = start; i < start + W / span + 3; i++) { const x = i * span - off; const peak = baseY - (0.4 + hash(i + seed) * 0.8) * amp; ctx.lineTo(x, baseY); ctx.lineTo(x + span / 2, peak); ctx.lineTo(x + span, baseY) }
    ctx.lineTo(W, H); ctx.closePath(); ctx.fill()
  }

  // ── Sky + far parallax. ──
  const g = ctx.createLinearGradient(0, 0, 0, H)
  g.addColorStop(0, C.skyTop); g.addColorStop(0.55, C.skyMid); g.addColorStop(1, C.skyLow)
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H)
  const so = cam.x * 0.05
  ctx.fillStyle = 'rgba(255,255,255,0.7)'
  for (let i = 0; i < 60; i++) { let x = (hash(i) * 2400 - so) % 2400; if (x < 0) x += 2400; if (x > W) continue; const y = hash(i + 99) * H * 0.6; ctx.globalAlpha = (0.4 + 0.6 * Math.abs(Math.sin(time * 1.5 + i))) * 0.8; const sz = hash(i + 7) > 0.7 ? 2 : 1; ctx.fillRect(x, y, sz, sz) }
  ctx.globalAlpha = 1
  const px = W * 0.74 - cam.x * 0.06, py = H * 0.26
  ctx.save(); ctx.globalAlpha = 0.9
  const pg = ctx.createRadialGradient(px - 18, py - 18, 6, px, py, 60); pg.addColorStop(0, '#efd9ff'); pg.addColorStop(1, C.planet)
  ctx.fillStyle = pg; ctx.beginPath(); ctx.arc(px, py, 54, 0, 7); ctx.fill()
  ctx.strokeStyle = 'rgba(180,150,230,0.55)'; ctx.lineWidth = 5; ctx.beginPath(); ctx.ellipse(px, py, 92, 24, -0.45, 0, 7); ctx.stroke()
  ctx.fillStyle = C.moon; ctx.globalAlpha = 0.85; ctx.beginPath(); ctx.arc(W * 0.3 - cam.x * 0.04, H * 0.18, 16, 0, 7); ctx.fill()
  ctx.restore()
  ridge(0.25, H * 0.66, 70, C.mtn, 210, 0)
  ridge(0.4, H * 0.74, 90, C.spire, 260, 50)
  drawBubbles(ctx, s, false)

  // ── World (camera + shake). ──
  const shx = (Math.random() - 0.5) * cam.shake, shy = (Math.random() - 0.5) * cam.shake
  ctx.save(); ctx.translate(-cam.x + shx, shy)

  // Stalks (near parallax, drawn in world space approximated by cam offset).
  { const speed = 0.72, span = 120, off = cam.x * speed; const start = Math.floor(off / span) - 1
    for (let i = start; i < start + W / span + 3; i++) { const wx = i * span - off + hash(i) * 60 + cam.x; const h = 90 + hash(i + 3) * 120; const sway = Math.sin(time * 0.8 + i) * 10
      ctx.strokeStyle = C.stalk; ctx.lineWidth = 7; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(wx, cam.x * 0 + H); ctx.quadraticCurveTo(wx + sway, H - h * 0.6, wx + sway * 1.6, H - h); ctx.stroke()
      ctx.fillStyle = C.stalkTip; ctx.globalAlpha = 0.9; ctx.beginPath(); ctx.arc(wx + sway * 1.6, H - h, 9, 0, 7); ctx.fill(); ctx.globalAlpha = 1 } }

  for (const p of s.platforms) drawPlatform(ctx, s, p, rr)
  for (const c of s.coins) if (!c.taken) drawCoin(ctx, s, c)
  for (const e of s.enemies) if (!e.dead) drawEnemy(ctx, s, e, rr)
  drawBlob(ctx, s)
  for (const pa of s.particles) { ctx.globalAlpha = clamp(pa.life / pa.max, 0, 1); ctx.fillStyle = pa.color; ctx.beginPath(); ctx.arc(pa.x, pa.y, pa.size, 0, 7); ctx.fill() }
  ctx.globalAlpha = 1
  ctx.font = '700 15px ui-sans-serif, system-ui, sans-serif'; ctx.textAlign = 'center'
  for (const u of s.popups) { ctx.globalAlpha = clamp(u.life / 0.8, 0, 1); ctx.fillStyle = C.orb; ctx.fillText(u.text, u.x, u.y) }
  ctx.globalAlpha = 1
  ctx.restore()
  drawThreat(ctx, s)
  drawBubbles(ctx, s, true)

  // Vignette.
  const vg = ctx.createRadialGradient(W / 2, H / 2, H * 0.4, W / 2, H / 2, H * 0.95)
  vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(5,2,12,0.55)')
  ctx.fillStyle = vg; ctx.fillRect(0, 0, W, H)

  // HUD.
  ctx.textAlign = 'left'
  const ig = ctx.createRadialGradient(20, 21, 1, 22, 22, 8); ig.addColorStop(0, '#e8ffff'); ig.addColorStop(1, C.orbEdge)
  ctx.fillStyle = ig; ctx.beginPath(); ctx.arc(22, 22, 7, 0, 7); ctx.fill()
  ctx.fillStyle = 'rgba(255,255,255,0.95)'; ctx.font = '600 16px ui-sans-serif, system-ui, sans-serif'; ctx.fillText(`${s.score}`, 36, 27)
  ctx.fillStyle = 'rgba(255,255,255,0.65)'; ctx.fillText(`${s.distance}m`, 72, 27)
  if (s.combo > 1) { ctx.fillStyle = accent; ctx.font = '700 16px ui-sans-serif, system-ui, sans-serif'; ctx.fillText(`x${s.combo}`, 128, 27) }
  ctx.textAlign = 'right'; ctx.fillStyle = 'rgba(255,255,255,0.6)'; ctx.font = '600 16px ui-sans-serif, system-ui, sans-serif'; ctx.fillText(`best ${s.best}`, W - 16, 27)
  ctx.textAlign = 'center'; ctx.fillStyle = 'rgba(255,255,255,0.45)'; ctx.font = '13px ui-sans-serif, system-ui, sans-serif'
  ctx.fillText('A / D  move    Space  jump (x2)    S  dive', W / 2, H - 14)

  if (s.over) {
    ctx.fillStyle = 'rgba(8,4,18,0.66)'; ctx.fillRect(0, 0, W, H)
    ctx.textAlign = 'center'; ctx.fillStyle = '#fff'; ctx.font = '700 38px ui-sans-serif, system-ui, sans-serif'; ctx.fillText('Game Over', W / 2, H / 2 - 24)
    ctx.font = '16px ui-sans-serif, system-ui, sans-serif'; ctx.fillStyle = 'rgba(255,255,255,0.85)'; ctx.fillText(`${s.score} orbs · ${s.distance}m   (best ${s.best})`, W / 2, H / 2 + 6)
    ctx.fillStyle = accent; ctx.font = '600 16px ui-sans-serif, system-ui, sans-serif'; ctx.fillText('Press Space or tap to play again', W / 2, H / 2 + 38)
  }
}

// The advancing "Devourer" — a wall of alien void/goo creeping from the left.
function drawThreat(ctx: CanvasRenderingContext2D, s: GameState) {
  const sx = s.threatX - s.cam.x
  if (sx < -30) return
  const w = Math.max(0, sx)
  const edge = (yStep: number) => { ctx.moveTo(w, -2); for (let y = 0; y <= s.H; y += yStep) ctx.lineTo(w + Math.sin(s.time * 5 + y * 0.06) * 12 + Math.sin(s.time * 9 + y * 0.13) * 5, y) }
  const g = ctx.createLinearGradient(0, 0, Math.max(sx, 1), 0)
  g.addColorStop(0, 'rgba(35,8,52,0.97)'); g.addColorStop(0.7, 'rgba(90,20,120,0.82)'); g.addColorStop(1, 'rgba(170,50,200,0.45)')
  ctx.fillStyle = g; ctx.fillRect(0, 0, w, s.H)
  ctx.fillStyle = 'rgba(200,90,235,0.9)'; ctx.beginPath(); edge(20); ctx.lineTo(0, s.H); ctx.lineTo(0, -2); ctx.closePath(); ctx.fill()
  ctx.save(); ctx.shadowColor = '#d36bff'; ctx.shadowBlur = 22; ctx.strokeStyle = 'rgba(235,160,255,0.55)'; ctx.lineWidth = 3; ctx.beginPath(); edge(20); ctx.stroke(); ctx.restore()
  // Danger glow when it's closing in on the player.
  const prox = s.player.x - s.threatX
  if (prox < s.W * 0.55 && !s.over) {
    const dg = ctx.createLinearGradient(0, 0, s.W * 0.5, 0)
    const a = 0.18 + 0.12 * Math.sin(s.time * 8)
    dg.addColorStop(0, `rgba(210,60,150,${a})`); dg.addColorStop(1, 'rgba(210,60,150,0)')
    ctx.fillStyle = dg; ctx.fillRect(0, 0, s.W * 0.5, s.H)
  }
}

function drawBubbles(ctx: CanvasRenderingContext2D, s: GameState, near: boolean) {
  for (const b of s.bubbles) {
    if (b.near !== near) continue
    ctx.fillStyle = near ? 'rgba(150,240,255,0.18)' : 'rgba(150,240,255,0.10)'; ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, 7); ctx.fill()
    ctx.strokeStyle = 'rgba(190,250,255,0.35)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, 7); ctx.stroke()
    ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.beginPath(); ctx.arc(b.x - b.r * 0.3, b.y - b.r * 0.3, b.r * 0.25, 0, 7); ctx.fill()
  }
}

function drawPlatform(ctx: CanvasRenderingContext2D, s: GameState, p: Platform, rr: (x: number, y: number, w: number, h: number, r: number) => void) {
  const { cam, W, time } = s
  if (p.x + p.w < cam.x - 4 || p.x > cam.x + W + 4) return
  ctx.fillStyle = 'rgba(0,0,0,0.25)'; rr(p.x + 4, p.y + 8, p.w, Math.min(p.h, 40), 14); ctx.fill()
  if (p.ground) {
    const bg = ctx.createLinearGradient(0, p.y, 0, p.y + 80); bg.addColorStop(0, C.rock); bg.addColorStop(1, C.rockDark)
    ctx.fillStyle = bg; rr(p.x, p.y, p.w, p.h, 12); ctx.fill()
    for (let i = 0; i < p.w / 26; i++) { const gx = p.x + 12 + i * 26 + hash(p.x + i) * 8, gy = p.y + 24 + hash(p.x + i + 5) * Math.min(p.h - 30, 90); ctx.fillStyle = C.biolume; ctx.globalAlpha = 0.5 + 0.5 * Math.sin(time * 2 + i); ctx.beginPath(); ctx.arc(gx, gy, 2, 0, 7); ctx.fill() }
    ctx.globalAlpha = 1
    const sg = ctx.createLinearGradient(0, p.y - 4, 0, p.y + 16); sg.addColorStop(0, C.slime); sg.addColorStop(1, C.slimeDark)
    ctx.fillStyle = sg; rr(p.x, p.y - 2, p.w, 16, 8); ctx.fill()
    ctx.fillStyle = 'rgba(255,255,255,0.25)'; rr(p.x + 4, p.y, p.w - 8, 3, 2); ctx.fill()
    ctx.fillStyle = C.slimeDark
    for (let i = 0; i < p.w / 60; i++) { const dx = p.x + 24 + i * 60 + hash(p.x + i + 2) * 24, dl = 6 + hash(p.x + i + 9) * 12; ctx.beginPath(); ctx.moveTo(dx - 4, p.y + 12); ctx.quadraticCurveTo(dx, p.y + 12 + dl, dx + 4, p.y + 12); ctx.fill(); ctx.beginPath(); ctx.arc(dx, p.y + 12 + dl, 3, 0, 7); ctx.fill() }
  } else {
    const bg = ctx.createLinearGradient(0, p.y, 0, p.y + p.h); bg.addColorStop(0, C.slime); bg.addColorStop(1, C.rock)
    ctx.fillStyle = bg; rr(p.x, p.y, p.w, p.h, 9); ctx.fill()
    ctx.fillStyle = C.biolume; ctx.globalAlpha = 0.4 + 0.4 * Math.sin(time * 3 + p.x); ctx.beginPath(); ctx.arc(p.x + p.w / 2, p.y + p.h / 2, 2.5, 0, 7); ctx.fill(); ctx.globalAlpha = 1
  }
}

function drawCoin(ctx: CanvasRenderingContext2D, s: GameState, c: Coin) {
  const { cam, W, time } = s
  if (c.x < cam.x - 30 || c.x > cam.x + W + 30) return
  const y = c.y + Math.sin(time * 3 + c.phase) * 4
  const sx = Math.abs(Math.cos(time * 4 + c.phase)) * 0.9 + 0.1
  const halo = ctx.createRadialGradient(c.x, y, 1, c.x, y, 22); halo.addColorStop(0, 'rgba(120,240,255,0.45)'); halo.addColorStop(1, 'rgba(120,240,255,0)')
  ctx.fillStyle = halo; ctx.beginPath(); ctx.arc(c.x, y, 22, 0, 7); ctx.fill()
  const og = ctx.createRadialGradient(c.x - 3, y - 4, 1, c.x, y, 11); og.addColorStop(0, '#e8ffff'); og.addColorStop(0.5, C.orb); og.addColorStop(1, C.orbEdge)
  ctx.fillStyle = og; ctx.beginPath(); ctx.ellipse(c.x, y, 9 * sx + 2, 11, 0, 0, 7); ctx.fill()
  ctx.fillStyle = 'rgba(255,255,255,0.8)'; ctx.beginPath(); ctx.ellipse(c.x - 2 * sx, y - 4, 2 * sx + 0.5, 3, 0, 0, 7); ctx.fill()
}

function drawEnemy(ctx: CanvasRenderingContext2D, s: GameState, e: Enemy, rr: (x: number, y: number, w: number, h: number, r: number) => void) {
  if (e.x + e.w < s.cam.x || e.x > s.cam.x + s.W) return
  const wob = Math.sin(e.wob * 6) * 2, cx = e.x + e.w / 2, by = e.y + e.h
  ctx.fillStyle = 'rgba(0,0,0,0.22)'; ctx.beginPath(); ctx.ellipse(cx, by + 2, e.w * 0.5, 4, 0, 0, 7); ctx.fill()
  const g = ctx.createLinearGradient(0, e.y, 0, by); g.addColorStop(0, C.gloo); g.addColorStop(1, C.glooDark)
  ctx.fillStyle = g; rr(e.x - wob / 2, e.y + Math.abs(wob), e.w + wob, e.h - Math.abs(wob), 12); ctx.fill()
  ctx.fillStyle = C.glooDark; ctx.beginPath(); ctx.arc(cx - 8, by, 4, 0, 7); ctx.arc(cx + 8, by, 4, 0, 7); ctx.fill()
  ctx.strokeStyle = C.glooDark; ctx.lineWidth = 2
  for (const sd of [-1, 1]) { ctx.beginPath(); ctx.moveTo(cx + sd * 5, e.y + 2); ctx.lineTo(cx + sd * 9, e.y - 8); ctx.stroke(); ctx.fillStyle = s.accent; ctx.beginPath(); ctx.arc(cx + sd * 9, e.y - 9, 2.5, 0, 7); ctx.fill() }
  const look = clamp((s.player.x - e.x) / 120, -1.5, 1.5)
  ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(cx - 7, e.y + 12, 6, 0, 7); ctx.arc(cx + 7, e.y + 12, 6, 0, 7); ctx.fill()
  if (e.blink < 0.12) { ctx.strokeStyle = '#1a1a1a'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(cx - 12, e.y + 12); ctx.lineTo(cx - 2, e.y + 12); ctx.moveTo(cx + 2, e.y + 12); ctx.lineTo(cx + 12, e.y + 12); ctx.stroke() }
  else { ctx.fillStyle = '#1a1a1a'; ctx.beginPath(); ctx.arc(cx - 7 + look * 2, e.y + 13, 2.6, 0, 7); ctx.arc(cx + 7 + look * 2, e.y + 13, 2.6, 0, 7); ctx.fill() }
}

function drawBlob(ctx: CanvasRenderingContext2D, s: GameState) {
  const p = s.player, accent = s.accent, accentLight = s.accentLight
  const cx = p.x + PW / 2, cy = p.y + PH / 2
  // Ground shadow.
  let groundY = p.y + PH
  for (const pl of s.platforms) { if (p.x + PW > pl.x && p.x < pl.x + pl.w && pl.y >= p.y + PH - 2) { groundY = pl.y; break } }
  const airT = clamp((groundY - (p.y + PH)) / 220, 0, 1)
  ctx.fillStyle = `rgba(0,0,0,${0.28 * (1 - airT)})`; ctx.beginPath(); ctx.ellipse(cx, groundY + 3, (PW / 2) * (1 - airT * 0.5), 5 * (1 - airT * 0.5), 0, 0, 7); ctx.fill()
  if (Math.abs(p.vx) > 230 && !p.clinging) { ctx.fillStyle = accent; ctx.globalAlpha = 0.18; ctx.beginPath(); ctx.ellipse(cx - p.face * 12, cy, PW / 2, PH / 2, 0, 0, 7); ctx.fill(); ctx.globalAlpha = 1 }

  let stretch = clamp(1 - p.vy * 0.00018 + p.squash, 0.78, 1.34)
  if (p.diving) stretch = 1.34
  if (p.clinging) stretch = 0.92
  ctx.save(); ctx.translate(cx, cy)
  ctx.scale(1 / stretch, stretch)
  const bg = ctx.createRadialGradient(-6, -8, 3, 0, 0, PW / 2 + 4); bg.addColorStop(0, accentLight); bg.addColorStop(1, accent)
  ctx.fillStyle = bg; ctx.beginPath(); ctx.ellipse(0, 0, PW / 2 + 2, PH / 2 + 2, 0, 0, 7); ctx.fill()
  ctx.fillStyle = 'rgba(255,255,255,0.28)'; ctx.beginPath(); ctx.ellipse(-7, -9, 6, 4, -0.5, 0, 7); ctx.fill()
  const ex = p.face * 4, lookY = clamp(p.vy * 0.004, -2, 3)
  const blinking = p.blink < 0.12 && p.onGround
  ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(-7 + ex, -4, 6.5, 0, 7); ctx.arc(8 + ex, -4, 6.5, 0, 7); ctx.fill()
  if (blinking) { ctx.strokeStyle = '#1a1a1a'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(-13 + ex, -4); ctx.lineTo(-1 + ex, -4); ctx.moveTo(2 + ex, -4); ctx.lineTo(14 + ex, -4); ctx.stroke() }
  else { ctx.fillStyle = '#1a1a1a'; ctx.beginPath(); ctx.arc(-6 + ex + p.face * 1.5, -3 + lookY, 3, 0, 7); ctx.arc(9 + ex + p.face * 1.5, -3 + lookY, 3, 0, 7); ctx.fill() }
  ctx.strokeStyle = 'rgba(0,0,0,0.55)'; ctx.lineWidth = 2; ctx.beginPath()
  if (p.onGround) ctx.arc(ex + 1, 6, 5, 0.12 * Math.PI, 0.88 * Math.PI)
  else { ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.ellipse(ex + 1, 7, 3, 4, 0, 0, 7); ctx.fill(); ctx.beginPath() }
  ctx.stroke()
  ctx.restore()
}
