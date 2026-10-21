// @vitest-environment happy-dom
import { render } from 'preact'
import { act } from 'preact/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ComponentChildren } from 'preact'
import { Menu } from '../src/ui/Menu'

vi.mock('../src/i18n', () => ({ useTranslation: () => ({ t: (key: string) => key }) }))
vi.mock('../src/exporter/html', () => ({}))
vi.mock('../src/exporter/image', () => ({}))
vi.mock('../src/exporter/json', () => ({}))
vi.mock('../src/exporter/markdown', () => ({}))
vi.mock('../src/exporter/text', () => ({}))
vi.mock('../src/ui/ExportDialog', () => ({ ExportDialog: () => null }))
vi.mock('../src/ui/SettingDialog', () => ({ SettingDialog: () => null }))
vi.mock('../src/ui/Dialog', () => ({ Dialog: () => null }))
vi.mock('../src/ui/SettingContext', () => ({
    SettingProvider: ({ children }: { children: ComponentChildren }) => children,
    useSettingContext: () => ({ format: '{title}', enableTimestamp: false, enableMeta: false }),
}))

let host: HTMLDivElement
beforeEach(() => {
    vi.useFakeTimers()
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => setTimeout(() => callback(0), 16))
    vi.stubGlobal('cancelAnimationFrame', clearTimeout)
    vi.stubGlobal('ResizeObserver', class {
        observe() {}
        disconnect() {}
    })
    host = document.createElement('div')
})
afterEach(() => {
    render(null, host)
    document.body.innerHTML = ''
    vi.useRealTimers()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
})

describe('export trigger sizing', () => {
    it.each([
        [320, 52, true],
        [1440, 52, true],
        [320, 268, false],
    ])('viewport %i, sidebar %i: collapsed=%s', async (viewport, sidebar, collapsed) => {
        vi.stubGlobal('innerWidth', viewport)
        vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, sidebar, 844))
        const nav = document.createElement('nav')
        if (sidebar === 52) nav.setAttribute('data-app-navigation-rail', '')
        nav.append(host)
        document.body.append(nav)
        await act(() => render(<Menu container={host} />, host))
        await act(() => vi.advanceTimersByTime(32))
        expect(host.querySelector('.ce-nav-trigger')?.classList.contains('ce-nav-trigger-collapsed')).toBe(collapsed)
    })
})
