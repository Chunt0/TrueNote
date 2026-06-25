// Tiny procedural sound — a few oscillator blips, no audio files. Muted by
// default (landing-page courtesy + autoplay policy); the AudioContext is created
// lazily on the first unmute (a user gesture). The engine stays pure: it pushes
// event names onto state.sfx and the React wrapper plays them through here.

interface ToneOpts { f: number; f2?: number; d: number; type?: OscillatorType; v?: number; delay?: number }

export interface GameAudio {
  setMuted(m: boolean): void
  muted(): boolean
  play(name: string, combo?: number): void
}

export function createAudio(): GameAudio {
  let ac: AudioContext | null = null
  let isMuted = true

  function ensure(): AudioContext | null {
    if (isMuted) return null
    if (!ac) {
      const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
      if (!Ctor) return null
      try { ac = new Ctor() } catch { return null }
    }
    if (ac.state === 'suspended') void ac.resume()
    return ac
  }

  function tone(o: ToneOpts) {
    const a = ensure()
    if (!a) return
    const t0 = a.currentTime + (o.delay || 0)
    const osc = a.createOscillator(), g = a.createGain()
    osc.type = o.type || 'square'
    osc.frequency.setValueAtTime(o.f, t0)
    if (o.f2) osc.frequency.exponentialRampToValueAtTime(Math.max(20, o.f2), t0 + o.d)
    const v = o.v ?? 0.2
    g.gain.setValueAtTime(0.0001, t0)
    g.gain.exponentialRampToValueAtTime(v, t0 + 0.008)
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + o.d)
    osc.connect(g).connect(a.destination)
    osc.start(t0); osc.stop(t0 + o.d + 0.02)
  }

  function play(name: string, combo = 0) {
    switch (name) {
      case 'jump': tone({ f: 380, f2: 620, d: 0.12, v: 0.16 }); break
      case 'double': tone({ f: 560, f2: 900, d: 0.12, v: 0.16 }); break
      case 'wall': tone({ f: 300, f2: 520, d: 0.12, v: 0.16 }); break
      case 'dive': tone({ f: 720, f2: 140, d: 0.16, type: 'sawtooth', v: 0.13 }); break
      case 'land': tone({ f: 170, f2: 90, d: 0.09, type: 'sine', v: 0.16 }); break
      case 'spring': tone({ f: 300, f2: 940, d: 0.18, type: 'sine', v: 0.2 }); break
      case 'stomp': tone({ f: 240, f2: 70, d: 0.14, type: 'sawtooth', v: 0.2 }); break
      case 'orb': tone({ f: 660 + combo * 28, f2: 940 + combo * 28, d: 0.085, type: 'triangle', v: 0.13 }); break
      case 'grapple': tone({ f: 280, f2: 780, d: 0.14, type: 'sine', v: 0.15 }); break
      case 'power': tone({ f: 520, f2: 780, d: 0.1, type: 'triangle', v: 0.18 }); tone({ f: 800, f2: 1060, d: 0.12, type: 'triangle', v: 0.14, delay: 0.08 }); break
      case 'shield': tone({ f: 300, f2: 520, d: 0.2, type: 'sine', v: 0.18 }); break
      case 'over': tone({ f: 300, f2: 60, d: 0.5, type: 'sawtooth', v: 0.2 }); break
      case 'biome': tone({ f: 330, f2: 560, d: 0.4, type: 'sine', v: 0.14 }); break
    }
  }

  return { setMuted: (m) => { isMuted = m; if (!m) ensure() }, muted: () => isMuted, play }
}
