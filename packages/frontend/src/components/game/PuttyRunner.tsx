import { useEffect, useRef } from 'react'
import { createGame } from './engine'
import { draw } from './render'
import type { Input } from './types'

// React wrapper for the PuttyRunner engine. Owns the canvas, the rAF loop, input,
// and on-screen touch controls; the engine (engine.ts) holds all game logic and
// the renderer (render.ts) draws its state. Keyboard is ignored while typing in a
// field so it never hijacks Space in the assistant/editor.
export function PuttyRunner() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const input = useRef<Input>({ left: false, right: false, jump: false, dive: false, grapple: false, restart: false })

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx: CanvasRenderingContext2D = canvas.getContext('2d')!

    const css = getComputedStyle(document.documentElement)
    const accent = (css.getPropertyValue('--accent-solid') || css.getPropertyValue('--accent') || '#ff7a5c').trim() || '#ff7a5c'
    const game = createGame(accent, '#ffd9cf')

    function fit() {
      const dpr = window.devicePixelRatio || 1
      const cw = canvas!.clientWidth, ch = canvas!.clientHeight
      if (cw === 0 || ch === 0) return
      if (canvas!.width !== Math.round(cw * dpr) || canvas!.height !== Math.round(ch * dpr)) { canvas!.width = Math.round(cw * dpr); canvas!.height = Math.round(ch * dpr) }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      game.state.W = cw; game.state.H = ch
    }

    let started = false, raf = 0, last = performance.now(), running = true
    function frame(now: number) {
      if (!running) return
      fit()
      if (!started) { if (canvas!.clientWidth < 4 || canvas!.clientHeight < 4) { raf = requestAnimationFrame(frame); return } game.reset(); started = true; last = now }
      let dt = (now - last) / 1000; last = now; dt = Math.min(dt, 1 / 30)
      game.step(dt, input.current)
      draw(ctx, game.state)
      raf = requestAnimationFrame(frame)
    }
    raf = requestAnimationFrame(frame)

    const typing = (t: EventTarget | null) => t instanceof HTMLElement && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)
    const key = (down: boolean) => (e: KeyboardEvent) => {
      if (typing(e.target)) return
      const k = e.key.toLowerCase()
      if (k === 'a' || k === 'arrowleft') { input.current.left = down; e.preventDefault() }
      else if (k === 'd' || k === 'arrowright') { input.current.right = down; e.preventDefault() }
      else if (k === ' ' || k === 'spacebar' || k === 'w' || k === 'arrowup') { input.current.jump = down; e.preventDefault() }
      else if (k === 's' || k === 'arrowdown') { input.current.dive = down; e.preventDefault() }
      else if (k === 'shift' || k === 'j') { input.current.grapple = down }
      else if (k === 'r' && down) input.current.restart = true
    }
    const kd = key(true), ku = key(false)
    window.addEventListener('keydown', kd); window.addEventListener('keyup', ku)
    const onVis = () => { if (document.hidden) { const i = input.current; i.left = i.right = i.jump = i.dive = i.grapple = false } last = performance.now() }
    document.addEventListener('visibilitychange', onVis)

    return () => { running = false; cancelAnimationFrame(raf); window.removeEventListener('keydown', kd); window.removeEventListener('keyup', ku); document.removeEventListener('visibilitychange', onVis) }
  }, [])

  const hold = (k: keyof Input) => ({
    onPointerDown: (e: React.PointerEvent) => { e.preventDefault(); input.current[k] = true },
    onPointerUp: (e: React.PointerEvent) => { e.preventDefault(); input.current[k] = false },
    onPointerLeave: () => { input.current[k] = false },
    onPointerCancel: () => { input.current[k] = false },
  })

  return (
    <div className="relative h-full w-full overflow-hidden bg-[#1b0a31]">
      <canvas ref={canvasRef} className="block h-full w-full touch-none" onPointerDown={() => { input.current.restart = true }} />
      <div className="pointer-events-none absolute inset-x-0 bottom-3 flex select-none items-end justify-between px-4 md:hidden">
        <div className="flex gap-2">
          <GameButton label="◄" {...hold('left')} />
          <GameButton label="►" {...hold('right')} />
        </div>
        <div className="flex gap-2">
          <GameButton label="▼" {...hold('dive')} />
          <GameButton label="▲" {...hold('jump')} />
        </div>
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
