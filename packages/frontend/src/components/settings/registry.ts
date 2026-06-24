import { Bot, Info, Palette, ShieldCheck, User, Users } from 'lucide-react'
import type { ComponentType } from 'react'
import { AboutSection } from './AboutSection'
import { AccountSection } from './AccountSection'
import { AppearanceSection } from './AppearanceSection'
import { MaintenanceSection } from './MaintenanceSection'
import { ProvidersSection } from './ProvidersSection'
import { TeamSection } from './TeamSection'

// ── The single source of truth for Settings sections ─────────────────────────
// Add a settings section: write a <FooSection/> component and append one entry
// here. The dialog builds its nav + panels from this list (like the page route
// manifest). `adminOnly` sections are hidden from members by SettingsDialog.
export interface SettingsSection {
  id: string
  label: string
  icon: ComponentType<{ className?: string }>
  Component: ComponentType
  adminOnly?: boolean
}

export const SETTINGS_SECTIONS: SettingsSection[] = [
  { id: 'providers', label: 'AI Providers', icon: Bot, Component: ProvidersSection, adminOnly: true },
  { id: 'team', label: 'Team', icon: Users, Component: TeamSection, adminOnly: true },
  { id: 'maintenance', label: 'Maintenance', icon: ShieldCheck, Component: MaintenanceSection, adminOnly: true },
  { id: 'appearance', label: 'Appearance', icon: Palette, Component: AppearanceSection },
  { id: 'account', label: 'Account', icon: User, Component: AccountSection },
  { id: 'about', label: 'About', icon: Info, Component: AboutSection },
]
