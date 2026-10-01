// @vitest-environment happy-dom
import { render } from 'preact'
import { act } from 'preact/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ApiConversationItem, ApiProjectInfo } from '../src/api'

const exportArchive = vi.hoisted(() => vi.fn())
vi.mock('../src/exporter/markdown', () => ({ exportAllToMarkdown: exportArchive }))

// Without the GM_* APIs, `ScriptStorage` falls back to localStorage.
vi.mock('vite-plugin-monkey/dist/client', () => ({
    unsafeWindow: globalThis,
    monkeyWindow: globalThis,
    GM_info: {},
    GM_getValue: undefined,
    GM_setValue: undefined,
    GM_deleteValue: undefined,
    GM_listValues: undefined,
    GM_addValueChangeListener: undefined,
    GM_removeValueChangeListener: undefined,
    GM_xmlhttpRequest: undefined,
}))

// ---------------------------------------------------------------------------
// API stub
// ---------------------------------------------------------------------------

function item(id: string): ApiConversationItem {
    return { id, title: id, create_time: '2026-01-01T00:00:00Z', update_time: '2026-01-01T00:00:00Z' }
}

function project(id: string, name: string): ApiProjectInfo {
    return { id, organization_id: 'org', display: { name, description: '' } }
}

function json(body: unknown) {
    return new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } })
}

function page(items: ApiConversationItem[], total: number | null = items.length) {
    return json({ items, total, limit: 100, offset: 0 })
}

function tooManyRequests(retryAfter?: string) {
    return new Response('', { status: 429, headers: retryAfter != null ? { 'Retry-After': retryAfter } : {} })
}

/** A response the test releases by hand, to hold a load open across a scope change */
function deferred() {
    let release!: (response: Response) => void
    const promise = new Promise<Response>((resolve) => {
        release = resolve
    })
    return { thunk: () => promise, release }
}

type PageSource = Response | (() => Promise<Response>)

/**
 * Serves the endpoints the dialog walks, so the component drives the real
 * fetch -> `RateLimitError` -> `onError` path rather than a stubbed callback.
 *
 * `list` and `projectList` are handed out in order, one per requested page.
 */
function stubApi({ list = [], projectList = [], projects = [], mutations }: {
    list?: PageSource[]
    projectList?: PageSource[]
    projects?: ApiProjectInfo[]
    mutations?: (url: string, options?: RequestInit) => Response | Promise<Response>
}) {
    const mainPages = [...list]
    const projectPages = [...projectList]
    const serve = (queue: PageSource[]) => {
        const next = queue.shift() ?? page([], 0)
        return typeof next === 'function' ? next() : next
    }
    const fetchMock = vi.fn(async (input: string | URL, options?: RequestInit) => {
        const url = String(input)
        if (options?.method === 'PATCH' && mutations) return mutations(url, options)
        if (url.includes('/api/auth/session')) return json({ accessToken: 'token' })
        if (url.includes('/accounts/check/')) return json({ accounts: {} })
        if (url.includes('/gizmos/snorlax/sidebar')) {
            return json({ cursor: null, items: projects.map(p => ({ gizmo: { gizmo: p } })) })
        }
        if (url.includes('/conversation/')) return json({ title: 'chat', current_node: 'root', mapping: {}, create_time: 1, update_time: 2 })
        // Must follow the sidebar branch: a project's list path holds both segments
        if (url.includes('/conversations')) return serve(url.includes('/gizmos/') ? projectPages : mainPages)
        throw new Error(`unexpected request: ${url}`)
    })
    vi.stubGlobal('fetch', fetchMock)
    return fetchMock
}

// ---------------------------------------------------------------------------
// Rendering and queries
// ---------------------------------------------------------------------------

// The dialog portals into document.body, so queries search there.
let host: HTMLDivElement

const tick = () => new Promise(resolve => setTimeout(resolve, 0))

/** Lets queued promises, and the effects they trigger in turn, settle */
async function flush() {
    // One pass per link in fetch -> setState -> effect
    await act(tick)
    await act(tick)
    await act(tick)
}

async function openDialog() {
    // Re-imported per test: `listCache` lives at module scope in ExportDialog
    const { ExportDialog } = await import('../src/ui/ExportDialog')
    const { SettingProvider } = await import('../src/ui/SettingContext')
    await act(async () => {
        render(
            <SettingProvider><ExportDialog format="markdown" open onOpenChange={() => {}} /></SettingProvider>,
            host,
        )
    })
    await flush()
}

function button(label: string) {
    const found = [...document.body.querySelectorAll('button')].find(b => b.textContent?.trim() === label)
    if (!found) throw new Error(`no ${label} button: ${document.body.textContent}`)
    return found as HTMLButtonElement
}

/** The `Error: …` row the list renders, or '' when the list shows no error */
function listError() {
    const row = [...document.body.querySelectorAll('.ce-select-list .ce-select-item')]
        .find(el => el.textContent?.startsWith('Error:'))
    return row?.textContent ?? ''
}

function conversationRows() {
    return [...document.body.querySelectorAll('.ce-select-list .ce-select-item')]
        .filter(el => el.querySelector('input[type="checkbox"]'))
}

function conversationTitles() {
    return conversationRows().map(el => el.querySelector('.ce-checkbox-label')?.textContent ?? '')
}

/** The `selected / shown` counter above the list */
function counter() {
    return [...document.body.querySelectorAll('*')]
        .map(el => el.textContent?.trim() ?? '')
        .find(text => /^\d+ \/ \d+$/.test(text)) ?? ''
}

function projectSelect() {
    const select = document.body.querySelector('.ce-project-select select')
    if (!select) throw new Error('no project select')
    return select as HTMLSelectElement
}

/** preact/compat listens for `change` here; `input` is dispatched for parity with the browser */
async function fire(target: HTMLElement) {
    await act(async () => {
        target.dispatchEvent(new Event('input', { bubbles: true }))
        target.dispatchEvent(new Event('change', { bubbles: true }))
    })
    await flush()
}

async function chooseProject(id: string) {
    const select = projectSelect()
    select.value = id
    await fire(select)
}

async function checkFirstConversation() {
    const box = conversationRows()[0]?.querySelector('input[type="checkbox"]') as HTMLInputElement | null
    if (!box) throw new Error(`no conversation to select: ${document.body.textContent}`)
    box.checked = true
    await fire(box)
}

async function uploadLocal(count: number) {
    const input = document.querySelector<HTMLInputElement>('input[type="file"]')!
    const data = Array.from({ length: count }, (_, i) => ({ ...item(`local-${i}`), current_node: 'root', mapping: {} }))
    Object.defineProperty(input, 'files', { configurable: true, value: [new File([JSON.stringify(data)], 'conversations.json')] })
    await fire(input)
    expect(conversationTitles()).toHaveLength(count)
    expect(document.querySelector('.ce-project-select')).toBeNull()
}

beforeEach(() => {
    vi.resetModules()
    localStorage.clear()
    exportArchive.mockReset().mockResolvedValue(true)
    host = document.createElement('div')
    document.body.append(host)
})

afterEach(() => {
    render(null, host)
    host.remove()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
})

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('export All conversation-list load', () => {
    it.each(['{broken', '[null]', '[{"id":"c1","title":123}]'])('keeps the API list usable after an invalid upload: %s', async (content) => {
        const alert = vi.fn()
        vi.stubGlobal('alert', alert)
        stubApi({ list: [page([item('c1')])] })
        await openDialog()
        const input = document.querySelector<HTMLInputElement>('input[type="file"]')!
        Object.defineProperty(input, 'files', { configurable: true, value: [new File([content], 'conversations.json')] })
        await fire(input)
        expect(alert).toHaveBeenCalledWith('Invalid File Format')
        expect(conversationTitles()).toEqual(['c1'])
        expect(document.querySelector('.ce-project-select')).not.toBeNull()
        await checkFirstConversation()
        expect(button('Export').disabled).toBe(false)
    })

    it('keeps loading after an overlapping page and a short page with a remaining total', async () => {
        stubApi({ list: [
            page(Array.from({ length: 100 }, (_, i) => item(`c${i}`)), 302),
            page(Array.from({ length: 100 }, (_, i) => item(`c${100 + i}`)), 302),
            page(Array.from({ length: 100 }, (_, i) => item(`c${199 + i}`)), 302),
            page([item('c299')], 302),
            page([item('c300'), item('c301')], 302),
        ] })
        await openDialog()
        for (const expected of [299, 300, 302]) {
            const more = document.querySelector<HTMLButtonElement>('.ce-load-more button')!
            expect(more).not.toBeNull()
            await act(() => more.click())
            await flush()
            expect(conversationTitles()).toHaveLength(expected)
        }
        expect(document.querySelector('.ce-load-more')).toBeNull()
    })

    it('returns to an actionable state after a local export fails', async () => {
        exportArchive.mockRejectedValue(new Error('Local ZIP generation failed'))
        stubApi({ list: [page([], 0)] })
        await openDialog()
        await uploadLocal(1)
        await checkFirstConversation()
        await act(() => button('Export').click())
        await flush()
        expect(listError()).toContain('Local ZIP generation failed')
        expect(button('Export').disabled).toBe(false)
        expect(document.querySelector('[aria-label="Close"]')).not.toBeNull()
        expect(localStorage.getItem('exporter:exported_update_times')).toBeNull()
    })

    it('does not start a second local batch after cancelling archive generation', async () => {
        let release!: (success: boolean) => void
        exportArchive.mockReturnValue(new Promise<boolean>((resolve) => {
            release = resolve
        }))
        vi.spyOn(await import('../src/utils/utils'), 'sleep').mockResolvedValue(undefined)
        stubApi({ list: [page([], 0)] })
        await openDialog()
        await uploadLocal(101)
        const all = document.querySelector<HTMLInputElement>('.ce-select-toolbar input')!
        all.checked = true
        await fire(all)
        await act(() => button('Export').click())
        expect(exportArchive).toHaveBeenCalledTimes(1)
        await act(() => button('Cancel').click())
        release(true)
        await flush()
        expect(exportArchive).toHaveBeenCalledTimes(1)
        expect(document.querySelector('[aria-label="Close"]')).not.toBeNull()
    })

    it('keeps the last project cursor for load more without skipping a partial page', async () => {
        localStorage.setItem('exporter:export_all_limit', '60')
        const fetchMock = stubApi({
            list: [page([], 0)],
            projectList: [
                json({ items: Array.from({ length: 50 }, (_, i) => item(`p${i}`)), cursor: 'after-50' }),
                json({ items: Array.from({ length: 10 }, (_, i) => item(`p${50 + i}`)), cursor: 'after-60' }),
                json({ items: [item('p60')], cursor: null }),
            ],
            projects: [project('proj-1', 'Kitchen')],
        })
        await openDialog()
        await chooseProject('proj-1')
        expect(conversationTitles()).toHaveLength(60)
        expect(document.querySelector('.ce-load-more button')?.textContent).toContain('50')
        await act(() => document.querySelector<HTMLButtonElement>('.ce-load-more button')!.click())
        await flush()
        expect(conversationTitles()).toHaveLength(61)
        const requests = fetchMock.mock.calls.map(([url]) => new URL(String(url), 'https://chatgpt.com'))
            .filter(url => url.pathname.includes('/gizmos/proj-1/conversations'))
        expect(requests.map(url => url.searchParams.get('cursor'))).toEqual(['0', 'after-50', 'after-60'])
        expect(requests.map(url => url.searchParams.get('limit'))).toEqual(['50', '10', '50'])
        expect(document.querySelector('.ce-load-more')).toBeNull()
    })

    it('returns to an actionable state when archive generation fails', async () => {
        exportArchive.mockRejectedValue(new Error('ZIP generation failed'))
        vi.spyOn(await import('../src/utils/utils'), 'sleep').mockResolvedValue(undefined)
        stubApi({ list: [page([item('c1')])] })
        await openDialog()
        await checkFirstConversation()
        await act(() => button('Export').click())
        await flush()
        expect(listError()).toContain('ZIP generation failed')
        expect(button('Export').disabled).toBe(false)
        expect(document.querySelector('[aria-label="Close"]')).not.toBeNull()
        expect(localStorage.getItem('exporter:exported_update_times')).toBeNull()
    })

    it('does not start the next batch when cancelled while generating the current archive', async () => {
        let release!: (success: boolean) => void
        exportArchive.mockReturnValue(new Promise<boolean>((resolve) => {
            release = resolve
        }))
        vi.spyOn(await import('../src/utils/utils'), 'sleep').mockResolvedValue(undefined)
        stubApi({ list: [page(Array.from({ length: 101 }, (_, i) => item(`c${i}`)))] })
        await openDialog()
        const all = document.querySelector<HTMLInputElement>('.ce-select-toolbar input')!
        all.checked = true
        await fire(all)
        await act(() => button('Export').click())
        await flush()
        expect(exportArchive).toHaveBeenCalledTimes(1)
        await act(() => button('Cancel').click())
        release(true)
        await flush()
        expect(exportArchive).toHaveBeenCalledTimes(1)
        expect(document.querySelector('[aria-label="Close"]')).not.toBeNull()
    })

    it.each(['Archive', 'Delete'])('only removes confirmed successes when %s is cancelled', async (action) => {
        const held = deferred()
        vi.stubGlobal('confirm', () => true)
        vi.stubGlobal('alert', vi.fn())
        vi.spyOn(await import('../src/utils/utils'), 'sleep').mockResolvedValue(undefined)
        stubApi({
            list: [page([item('c1'), item('c2')])],
            mutations: url => url.endsWith('/c1') ? json({ success: true }) : held.thunk(),
        })
        await openDialog()
        const all = document.querySelector<HTMLInputElement>('.ce-select-toolbar input')!
        all.checked = true
        await fire(all)
        await act(() => button(action).click())
        await flush()
        await act(() => button('Cancel').click())
        expect(conversationTitles()).toEqual(['c2'])
        expect(document.querySelector('[aria-label="Close"]')).not.toBeNull()
        held.release(json({ success: false }))
        await flush()
        expect(conversationTitles()).toEqual(['c2'])
    })

    it.each(['Archive', 'Delete'])('keeps failed %s operations in the list after retries', async (action) => {
        const alert = vi.fn()
        vi.stubGlobal('confirm', () => true)
        vi.stubGlobal('alert', alert)
        vi.spyOn(console, 'error').mockImplementation(() => {})
        vi.spyOn(console, 'warn').mockImplementation(() => {})
        vi.spyOn(await import('../src/utils/utils'), 'sleep').mockResolvedValue(undefined)
        stubApi({
            list: [page([item('c1'), item('c2')])],
            mutations: url => json({ success: url.endsWith('/c1') }),
        })
        await openDialog()
        const all = document.querySelector<HTMLInputElement>('.ce-select-toolbar input')!
        all.checked = true
        await fire(all)
        await act(() => button(action).click())
        await flush()
        expect(conversationTitles()).toEqual(['c2'])
        expect(listError()).toBe('Error: Error')
        expect(alert).not.toHaveBeenCalled()
        expect(document.querySelector('[aria-label="Close"]')).not.toBeNull()
    })

    it('discards a load-more page after switching project scope', async () => {
        const held = deferred()
        stubApi({
            list: [page(Array.from({ length: 200 }, (_, i) => item(`c${i}`)), 300), held.thunk],
            projectList: [json({ items: [item('project-chat')], cursor: null })],
            projects: [project('proj-1', 'Kitchen')],
        })
        await openDialog()
        const more = document.querySelector<HTMLButtonElement>('.ce-load-more button')!
        await act(() => more.click())
        await chooseProject('proj-1')
        expect(conversationTitles()).toEqual(['project-chat'])

        held.release(page([item('wrong-scope-chat')], 201))
        await flush()
        expect(conversationTitles()).toEqual(['project-chat'])
    })

    it('shows a rate-limited list as an error, not as an empty account', async () => {
        stubApi({ list: [tooManyRequests('60')] })

        await openDialog()

        // Without the error this looks like an account with no conversations.
        expect(counter()).toBe('0 / 0')
        expect(conversationTitles()).toEqual([])
        expect(listError()).toMatch(/rate limited/i)
        // Quoted only because the server sent Retry-After
        expect(listError()).toContain('60s')
        expect(button('Export').disabled).toBe(true)
    })

    it('keeps the conversations it did load visible and exportable under the error', async () => {
        const first = Array.from({ length: 100 }, (_, i) => item(`c${i}`))
        stubApi({ list: [page(first, 250), tooManyRequests('30')] })

        await openDialog()

        expect(conversationTitles()).toHaveLength(100)
        expect(conversationTitles()).toContain('c0')
        expect(listError()).toMatch(/rate limited/i)

        await checkFirstConversation()
        expect(button('Export').disabled).toBe(false)
    })

    it('does not quote our own fallback as the wait the server asked for', async () => {
        // Without Retry-After, the 30s wait is our fallback, not the server's.
        stubApi({ list: [tooManyRequests()] })

        await openDialog()

        expect(listError()).toMatch(/rate limited/i)
        expect(listError()).not.toContain('30')
    })

    it('clears the error when the next load succeeds', async () => {
        stubApi({
            list: [tooManyRequests('60')],
            projectList: [json({ items: [item('p1'), item('p2')], cursor: null })],
            projects: [project('proj-1', 'Kitchen')],
        })

        await openDialog()
        expect(listError()).toMatch(/rate limited/i)

        await chooseProject('proj-1')

        expect(listError()).toBe('')
        expect(conversationTitles()).toEqual(['p1', 'p2'])
    })

    it('does not let a superseded load write over the current scope', async () => {
        const held = deferred()
        stubApi({
            list: [held.thunk],
            projectList: [json({ items: [item('p1')], cursor: null })],
            projects: [project('proj-1', 'Kitchen')],
        })

        await openDialog()
        // The main list is still in flight when the scope changes
        expect(conversationTitles()).toEqual([])

        await chooseProject('proj-1')
        expect(conversationTitles()).toEqual(['p1'])

        held.release(tooManyRequests('60'))
        await flush()

        // The abandoned load's failure belongs to a scope no longer on screen
        expect(listError()).toBe('')
        expect(conversationTitles()).toEqual(['p1'])
    })
})
