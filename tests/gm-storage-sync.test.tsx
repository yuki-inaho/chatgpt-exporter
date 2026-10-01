// @vitest-environment happy-dom
import { render } from 'preact'
import { act } from 'preact/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useGMStorage } from '../src/hooks/useGMStorage'

vi.mock('vite-plugin-monkey/dist/client', () => ({
    GM_getValue: undefined,
    GM_setValue: undefined,
    GM_deleteValue: undefined,
}))

let host: HTMLDivElement

function Probe({ id, storageKey = 'setting' }: { id: string, storageKey?: string }) {
    const [value, setValue] = useGMStorage(storageKey, { enabled: false })
    return <button id={id} onClick={() => setValue({ enabled: !value.enabled })}>{String(value.enabled)}</button>
}

beforeEach(() => {
    localStorage.clear()
    host = document.createElement('div')
    document.body.append(host)
})

afterEach(() => {
    render(null, host)
    host.remove()
})

describe('shared userscript settings', () => {
    it('synchronizes mounted menus without a page reload', async () => {
        await act(() => render(<><Probe id="expanded" /><Probe id="rail" /><Probe id="other" storageKey="other" /></>, host))
        await act(() => document.querySelector<HTMLButtonElement>('#expanded')!.click())
        expect(document.querySelector('#expanded')?.textContent).toBe('true')
        expect(document.querySelector('#rail')?.textContent).toBe('true')
        expect(document.querySelector('#other')?.textContent).toBe('false')
        await act(() => document.querySelector<HTMLButtonElement>('#rail')!.click())
        expect(document.querySelector('#expanded')?.textContent).toBe('false')
        expect(JSON.parse(localStorage.getItem('setting')!)).toEqual({ enabled: false })
    })

    it('reads persisted settings again after all consumers unmount', async () => {
        await act(() => render(<Probe id="first" />, host))
        await act(() => render(null, host))
        localStorage.setItem('setting', JSON.stringify({ enabled: true }))
        await act(() => render(<Probe id="second" />, host))
        expect(document.querySelector('#second')?.textContent).toBe('true')
    })

    it('switches subscriptions when a consumer changes its storage key', async () => {
        await act(() => render(<><Probe id="changed" /><Probe id="peer" /></>, host))
        await act(() => render(<><Probe id="changed" storageKey="new-key" /><Probe id="peer" /></>, host))
        await act(() => document.querySelector<HTMLButtonElement>('#peer')!.click())
        expect(document.querySelector('#changed')?.textContent).toBe('false')
    })
})
