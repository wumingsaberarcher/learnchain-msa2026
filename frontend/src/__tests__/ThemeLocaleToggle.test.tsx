import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import ThemeLocaleToggle from '../components/ThemeLocaleToggle'
import { useSettingsStore } from '../stores/settingsStore'

describe('ThemeLocaleToggle', () => {
  it('renders four corner labels', () => {
    render(<ThemeLocaleToggle />)
    expect(screen.getAllByText('中')).toHaveLength(2)
    expect(screen.getAllByText('EN')).toHaveLength(2)
  })

  it('switches to English day mode when top-right area is clicked', async () => {
    useSettingsStore.setState({ corner: 'bl', language: 'zh', theme: 'night' })

    const { container } = render(<ThemeLocaleToggle />)
    const toggle = container.querySelector('.theme-locale-toggle') as HTMLElement
    toggle.getBoundingClientRect = () => ({
      x: 0,
      y: 0,
      width: 100,
      height: 100,
      top: 0,
      left: 0,
      right: 100,
      bottom: 100,
      toJSON: () => ({}),
    })

    toggle.dispatchEvent(new MouseEvent('click', {
      bubbles: true,
      clientX: 75,
      clientY: 25,
    }))

    expect(useSettingsStore.getState().corner).toBe('tr')
    expect(useSettingsStore.getState().language).toBe('en')
    expect(useSettingsStore.getState().theme).toBe('day')
  })
})
