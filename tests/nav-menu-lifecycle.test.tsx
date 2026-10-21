// @vitest-environment happy-dom
import { createPortal } from 'preact/compat'
import { useEffect } from 'preact/hooks'
import { act } from 'preact/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const cleanup = vi.hoisted(() => vi.fn())
vi.mock('sentinel-js', () => ({ default: { on: vi.fn() } }))
vi.mock('vite-plugin-monkey/dist/client', () => ({ unsafeWindow: globalThis }))
vi.mock('../src/temporaryChat', () => ({ watchTemporaryChatId: vi.fn() }))
vi.mock('../src/api', () => ({ fetchConversation: vi.fn() }))
vi.mock('../src/i18n', () => ({}))
vi.mock('../src/utils/utils', () => ({ onloadSafe: (callback: () => void) => callback() }))
vi.mock('../src/ui/Menu', () => ({
    Menu: () => {
        useEffect(() => () => cleanup(), [])
        return createPortal(<div data-test-portal="" />, document.body)
    },
}))

beforeEach(() => {
    vi.resetModules()
    vi.useFakeTimers()
    vi.spyOn(console, 'log').mockImplementation(() => {})
    cleanup.mockClear()
    vi.stubGlobal('MutationObserver', class {
        observe() {}
        disconnect() {}
    })
    document.body.innerHTML = '<nav><button data-testid="accounts-profile-button"></button></nav>'
})

afterEach(() => {
    vi.clearAllTimers()
    vi.useRealTimers()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
    document.body.innerHTML = ''
    document.querySelector('#sentinel-css')?.remove()
})

describe('sidebar menu lifecycle', () => {
    it('mounts a project shell during SPA navigation while the old sidebar is cached', async () => {
        await act(async () => {
            await import('../src/main')
        })
        const cached = document.querySelector('nav')!
        cached.setAttribute('inert', '')
        cached.hidden = true
        const project = document.createElement('aside')
        project.innerHTML = `
            <nav data-app-navigation-rail><div><button aria-haspopup="menu"></button></div></nav>
            <nav id="project"><div data-app-action-sidebar-scroll></div></nav>`
        document.body.append(project)
        await act(async () => {
            vi.advanceTimersByTime(2000)
        })
        expect(project.querySelectorAll('.ce-root')).toHaveLength(2)
        expect(document.querySelectorAll('[data-test-portal]')).toHaveLength(3)

        project.remove()
        cached.removeAttribute('inert')
        cached.hidden = false
        await act(async () => {
            vi.advanceTimersByTime(1000)
        })
        expect(document.querySelectorAll('.ce-root')).toHaveLength(1)
        expect(document.querySelectorAll('[data-test-portal]')).toHaveLength(1)
        expect(cleanup).toHaveBeenCalledTimes(2)
    })

    it('unmounts portals and effects when ChatGPT replaces the sidebar', async () => {
        await act(async () => {
            await import('../src/main')
        })
        expect(document.querySelectorAll('[data-test-portal]')).toHaveLength(1)

        for (let i = 1; i <= 3; i++) {
            document.querySelector('nav')!.remove()
            const nav = document.createElement('nav')
            nav.innerHTML = '<button data-testid="accounts-profile-button"></button>'
            document.body.append(nav)
            await act(async () => {
                vi.advanceTimersByTime(1000)
            })
            expect(cleanup).toHaveBeenCalledTimes(i)
            expect(document.querySelectorAll('[data-test-portal]')).toHaveLength(1)
        }

        document.querySelector('nav')!.remove()
        await act(async () => {
            vi.advanceTimersByTime(1000)
        })
        expect(cleanup).toHaveBeenCalledTimes(4)
        expect(document.querySelectorAll('[data-test-portal]')).toHaveLength(0)
    })
})
