import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { createGame } from './engine'
import { draw } from './render'
import { dailySeed, mulberry32 } from './rng'
import type { Input } from './types'

type Phase = 'start' | 'playing' | 'paused'
type Mode = 'endless' | 'daily'

// React wrapper for the PuttyRunner engine: owns the canvas, the rAF loop, input,
// on-screen touch controls, and the start/pause overlays. The engine (engine.ts)
// holds all game logic; the renderer (render.ts) draws its state. Keyboard is
// ignored while typing in a field so it never hijacks Space in the assistant.
export function PuttyRunner() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const input = useRef<Input>({ left: false, right: false, jump: false, dive: false, grapple: false, restart: false })
  const phaseRef = useRef<Phase>('start')
  const modeRef = useRef<Mode>('endless')
  const actions = useRef<{ start: () => void; resume: () => void; restart: () => void; setMode: (m: Mode) => void } | null>(null)
  const [phase, setPhaseState] = useState<Phase>('start')
  const [mode, setModeState] = useState<Mode>('endless')
  const [best, setBest] = useState(0)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx: CanvasRenderingContext2D = canvas.getContext('2d')!
    const css = getComputedStyle(document.documentElement)
    const accent = (css.getPropertyValue('--accent-solid') || css.getPropertyValue('--accent') || '#ff7a5c').trim() || '#ff7a5c'

    const newRng = () => (modeRef.current === 'daily' ? mulberry32(dailySeed(Date.now())) : Math.random)
    const game = createGame(accent, '#ffd9cf', newRng)
    setBest(game.state.best)

    const setPhase = (p: Phase) => { phaseRef.current = p; setPhaseState(p) }
    actions.current = {
      start: () => { game.reset(); setPhase('playing') },
      resume: () => setPhase('playing'),
      restart: () => { game.reset(); setPhase('playing') },
      setMode: (m: Mode) => { modeRef.current = m; setModeState(m); game.reset() },
    }

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
      if (phaseRef.current === 'playing' && !document.hidden) game.step(dt, input.current)
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
      else if (k === ' ' || k === 'spacebar' || k === 'w' || k === 'arrowup') { input.current.jump = down; e.preventDefault(); if (down && phaseRef.current !== 'playing') actions.current?.start() }
      else if (k === 's' || k === 'arrowdown') { input.current.dive = down; e.preventDefault() }
      else if (k === 'shift' || k === 'j') { input.current.grapple = down }
      else if (k === 'r' && down) input.current.restart = true
      else if ((k === 'p' || k === 'escape') && down) { if (phaseRef.current === 'playing') setPhase('paused'); else if (phaseRef.current === 'paused') setPhase('playing') }
    }
    const kd = key(true), ku = key(false)
    window.addEventListener('keydown', kd); window.addEventListener('keyup', ku)
    const onVis = () => { if (document.hidden) { const i = input.current; i.left = i.right = i.jump = i.dive = i.grapple = false; if (phaseRef.current === 'playing') setPhase('paused') } last = performance.now() }
    document.addEventListener('visibilitychange', onVis)

    return () => { running = false; cancelAnimationFrame(raf); window.removeEventListener('keydown', kd); window.removeEventListener('keyup', ku); document.removeEventListener('visibilitychange', onVis); actions.current = null }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const hold = (k: keyof Input) => ({
    onPointerDown: (e: React.PointerEvent) => { e.preventDefault(); input.current[k] = true },
    onPointerUp: (e: React.PointerEvent) => { e.preventDefault(); input.current[k] = false },
    onPointerLeave: () => { input.current[k] = false },
    onPointerCancel: () => { input.current[k] = false },
  })

  return (
    <div className="relative h-full w-full overflow-hidden bg-[#1b0a31]">
      <canvas ref={canvasRef} className="block h-full w-full touch-none" onPointerDown={() => { input.current.restart = true }} />

      {/* On-screen controls (touch). */}
      {phase === 'playing' && (
        <div className="pointer-events-none absolute inset-x-0 bottom-3 flex select-none items-end justify-between px-4 md:hidden">
          <div className="flex gap-2">
            <GameButton label="◄" {...hold('left')} />
            <GameButton label="►" {...hold('right')} />
          </div>
          <div className="flex gap-2">
            <GameButton label="↗" {...hold('grapple')} />
            <GameButton label="▼" {...hold('dive')} />
            <GameButton label="▲" {...hold('jump')} />
          </div>
        </div>
      )}

      {phase === 'start' && (
        <Overlay>
          <h2 className="text-2xl font-bold tracking-tight">Putty Runner</h2>
          <p className="text-sm text-white/70">Run the alien wilds. Collect orbs, stomp gloops, don't get devoured.</p>
          <p className="text-xs text-white/60">best {best}</p>
          <div className="flex gap-1 rounded-full bg-white/10 p-1">
            {(['endless', 'daily'] as const).map((m) => (
              <button key={m} type="button" onClick={() => actions.current?.setMode(m)}
                className={`rounded-full px-3 py-1 text-xs capitalize ${mode === m ? 'bg-white/85 text-black' : 'text-white/80'}`}>{m}</button>
            ))}
          </div>
          <p className="max-w-xs text-center text-[11px] leading-relaxed text-white/55">
            A / D move · Space jump (double-jump in air) · S dive-stomp · Shift grapple · P pause
          </p>
          <Button onClick={() => actions.current?.start()} className="mt-1">Play</Button>
          <p className="text-[11px] text-white/40">or press Space</p>
        </Overlay>
      )}

      {phase === 'paused' && (
        <Overlay>
          <h2 className="text-xl font-bold">Paused</h2>
          <div className="flex gap-2">
            <Button onClick={() => actions.current?.resume()}>Resume</Button>
            <Button variant="outline" onClick={() => actions.current?.restart()}>Restart</Button>
          </div>
        </Overlay>
      )}
    </div>
  )
}

function Overlay({ children }: { children: React.ReactNode }) {
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/55 text-white backdrop-blur-sm">
      {children}
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
