import { Bot, Info, Palette, User } from 'lucide-react'
import type { ComponentType } from 'react'
import { AboutSection } from './AboutSection'
import { AccountSection } from './AccountSection'
import { AppearanceSection } from './AppearanceSection'
import { ProvidersSection } from './ProvidersSection'

// ── The single source of truth for Settings sections ─────────────────────────
// Add a settings section: write a <FooSection/> component and append one entry
// here. The dialog builds its nav + panels from this list (like the page route
// manifest). `adminOnly` is reserved for the future role system (not gated yet).
export interface SettingsSection {
  id: string
  label: string
  icon: ComponentType<{ className?: string }>
  Component: ComponentType
  adminOnly?: boolean
}

export const SETTINGS_SECTIONS: SettingsSection[] = [
  { id: 'providers', label: 'AI Providers', icon: Bot, Component: ProvidersSection },
  { id: 'appearance', label: 'Appearance', icon: Palette, Component: AppearanceSection },
  { id: 'account', label: 'Account', icon: User, Component: AccountSection },
  { id: 'about', label: 'About', icon: Info, Component: AboutSection },
]
