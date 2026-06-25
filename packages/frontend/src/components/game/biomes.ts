// Biomes: full palettes that rotate by distance, with a smooth cross-fade near
// each boundary. render.ts reads the lerped palette off state each frame, so the
// whole world re-skins without touching any draw code.
import { C } from './constants'

export interface Palette {
  skyTop: string; skyMid: string; skyLow: string
  planet: string; moon: string
  mtn: string; spire: string; stalk: string; stalkTip: string
  rock: string; rockDark: string; biolume: string
  slime: string; slimeDark: string
  orb: string; orbEdge: string
  gloo: string; glooDark: string; goo: string; dust: string
}

export const BIOMES: { name: string; pal: Palette }[] = [
  { name: 'Bioluminescent Caverns', pal: { ...C } },
  {
    name: 'Acid Jungle',
    pal: {
      skyTop: '#06241a', skyMid: '#0d4a2e', skyLow: '#13653a', planet: '#bdf5a0', moon: '#e6ffd9',
      mtn: '#0c3a26', spire: '#11512f', stalk: '#08251a', stalkTip: '#9be36a',
      rock: '#2f4a1e', rockDark: '#1b2e10', biolume: '#d4ff5a',
      slime: '#9be36a', slimeDark: '#4f9b2e', orb: '#c8ff7a', orbEdge: '#5fb02a',
      gloo: '#7be0c0', glooDark: '#3a9b78', goo: '#aef06a', dust: '#9be3a0',
    },
  },
  {
    name: 'Crystal Fields',
    pal: {
      skyTop: '#1a0a36', skyMid: '#3a1466', skyLow: '#5a2a8c', planet: '#ffd0f5', moon: '#d9e0ff',
      mtn: '#2a1252', spire: '#3e1c72', stalk: '#1a0a36', stalkTip: '#e08aff',
      rock: '#3a2566', rockDark: '#241046', biolume: '#ff9ef0',
      slime: '#c79bff', slimeDark: '#7a4fd0', orb: '#ffb3f0', orbEdge: '#c84dd6',
      gloo: '#b39bff', glooDark: '#6a4fd0', goo: '#d9a0ff', dust: '#e0b3ff',
    },
  },
  {
    name: 'Sky Reaches',
    pal: {
      skyTop: '#123a6b', skyMid: '#2a6bb0', skyLow: '#6fb0e0', planet: '#fff0d0', moon: '#ffffff',
      mtn: '#3a6ba0', spire: '#5a8cc0', stalk: '#2a4a6b', stalkTip: '#fff0a0',
      rock: '#5a7aa8', rockDark: '#3a5278', biolume: '#fff6c0',
      slime: '#9be0ff', slimeDark: '#4f9bd0', orb: '#fff0a0', orbEdge: '#e0b040',
      gloo: '#ffe08a', glooDark: '#d0a040', goo: '#fff0a0', dust: '#e0f0ff',
    },
  },
  {
    name: 'Derelict Tech',
    pal: {
      skyTop: '#0a0e1a', skyMid: '#10203a', skyLow: '#18324a', planet: '#9be9ff', moon: '#c0fff0',
      mtn: '#10182a', spire: '#162338', stalk: '#080c16', stalkTip: '#00e0ff',
      rock: '#1c2740', rockDark: '#0e1424', biolume: '#00e0ff',
      slime: '#2ad6ff', slimeDark: '#1080a8', orb: '#7af0ff', orbEdge: '#27b4d8',
      gloo: '#ff4da6', glooDark: '#b02a6e', goo: '#ff7ad9', dust: '#9be9ff',
    },
  },
]

const BIOME_LEN = 520 // meters per biome
const FADE = 80 // meters of cross-fade into the next biome

function hexToRgb(h: string): [number, number, number] {
  const n = parseInt(h.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}
function rgbToHex(r: number, g: number, b: number): string {
  return `#${((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1)}`
}
function lerpHex(a: string, b: string, t: number): string {
  const x = hexToRgb(a), y = hexToRgb(b)
  return rgbToHex(Math.round(x[0] + (y[0] - x[0]) * t), Math.round(x[1] + (y[1] - x[1]) * t), Math.round(x[2] + (y[2] - x[2]) * t))
}
function lerpPalette(a: Palette, b: Palette, t: number): Palette {
  const out = {} as Palette
  for (const k of Object.keys(a) as (keyof Palette)[]) out[k] = lerpHex(a[k], b[k], t)
  return out
}

/** The (possibly cross-faded) palette + active biome index/name at a distance. */
export function paletteAt(distance: number): { pal: Palette; index: number; name: string } {
  const idx = Math.floor(distance / BIOME_LEN) % BIOMES.length
  const into = distance % BIOME_LEN
  const cur = BIOMES[idx]
  if (into > BIOME_LEN - FADE) {
    const nxt = BIOMES[(idx + 1) % BIOMES.length]
    const t = (into - (BIOME_LEN - FADE)) / FADE
    return { pal: lerpPalette(cur.pal, nxt.pal, t), index: idx, name: cur.name }
  }
  return { pal: cur.pal, index: idx, name: cur.name }
}
