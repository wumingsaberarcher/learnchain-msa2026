import { describe, it, expect, beforeEach } from 'vitest'
import { useSettingsStore } from '../stores/settingsStore'

describe('settingsStore', () => {
  beforeEach(() => {
    localStorage.clear()
    useSettingsStore.setState({
      corner: 'bl',
      language: 'zh',
      theme: 'night',
    })
  })

  it('setCorner bl sets Chinese and night theme', () => {
    useSettingsStore.getState().setCorner('bl')
    expect(useSettingsStore.getState().language).toBe('zh')
    expect(useSettingsStore.getState().theme).toBe('night')
    expect(localStorage.getItem('settingsCorner')).toBe('bl')
  })

  it('setCorner tr sets English and day theme', () => {
    useSettingsStore.getState().setCorner('tr')
    expect(useSettingsStore.getState().language).toBe('en')
    expect(useSettingsStore.getState().theme).toBe('day')
  })

  it('t returns Chinese translation for zh', () => {
    useSettingsStore.getState().setCorner('bl')
    expect(useSettingsStore.getState().t('nav.dashboard')).toBe('仪表盘')
  })

  it('t returns English translation for en', () => {
    useSettingsStore.getState().setCorner('br')
    expect(useSettingsStore.getState().t('nav.dashboard')).toBe('Dashboard')
  })

  it('t interpolates parameters', () => {
    useSettingsStore.getState().setCorner('bl')
    const text = useSettingsStore.getState().t('countdown.remaining', { days: 5 })
    expect(text).toBe('还剩 5 天')
  })
})
