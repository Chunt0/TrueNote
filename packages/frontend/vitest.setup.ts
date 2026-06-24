import '@testing-library/jest-dom/vitest'
import { afterEach } from 'vitest'
import { cleanup } from '@testing-library/react'

// jsdom doesn't implement scrollIntoView; stub it for components that auto-scroll.
Element.prototype.scrollIntoView = () => {}

afterEach(() => cleanup())
