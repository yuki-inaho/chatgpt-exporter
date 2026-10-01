// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ApiConversations } from '../src/api'

vi.mock('vite-plugin-monkey/dist/client', () => ({ unsafeWindow: globalThis }))

function json(body: unknown) {
    return new Response(JSON.stringify(body), { headers: { 'Content-Type': 'application/json' } })
}

function stubPages(serve: (url: URL) => Response) {
    const requests: URL[] = []
    vi.stubGlobal('fetch', vi.fn(async (input: string | URL) => {
        const url = new URL(String(input))
        if (url.pathname === '/api/auth/session') return json({ accessToken: 'test' })
        if (url.pathname.includes('/accounts/check/')) return json({ accounts: {} })
        requests.push(url)
        return serve(url)
    }))
    return requests
}

beforeEach(() => {
    vi.resetModules()
    vi.stubGlobal('location', new URL('https://chatgpt.com/'))
})
afterEach(() => vi.unstubAllGlobals())

describe('conversation pagination', () => {
    it('uses an opaque project cursor when loading another page', async () => {
        const requests = stubPages(() => json({ items: [], cursor: null }))
        const { fetchConversationsPage } = await import('../src/api')
        await fetchConversationsPage('project-1', 'opaque+cursor', 50)
        expect(requests[0].searchParams.get('cursor')).toBe('opaque+cursor')
        expect(requests[0].searchParams.get('limit')).toBe('50')
    })

    it('limits every batch so a project cursor never skips truncated conversations', async () => {
        let offset = 0
        const requests = stubPages((url) => {
            const limit = Number(url.searchParams.get('limit'))
            const items = Array.from({ length: limit }, (_, i) => ({ id: `c${offset + i}` }))
            offset += limit
            return json({ items, cursor: `next-${offset}` })
        })
        const { fetchAllConversations } = await import('../src/api')
        const batches: number[] = []
        const hasMore = vi.fn()
        const onPage = vi.fn<(page: ApiConversations) => void>()
        const result = await fetchAllConversations('project-1', 60, batch => batches.push(batch.length), hasMore, undefined, onPage)
        expect(result).toHaveLength(60)
        expect(batches).toEqual([50, 10])
        expect(requests.map(url => url.searchParams.get('cursor'))).toEqual(['0', 'next-50'])
        expect(onPage.mock.lastCall?.[0].cursor).toBe('next-60')
        expect(hasMore).toHaveBeenLastCalledWith(true)
    })

    it('does not show load more when a project ends exactly at the requested limit', async () => {
        stubPages(() => json({ items: Array.from({ length: 50 }, (_, i) => ({ id: `c${i}` })), cursor: null }))
        const { fetchAllConversations } = await import('../src/api')
        const hasMore = vi.fn()
        await fetchAllConversations('project-1', 50, undefined, hasMore)
        expect(hasMore).toHaveBeenLastCalledWith(false)
    })
})
