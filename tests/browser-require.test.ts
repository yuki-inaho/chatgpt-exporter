import { createHash } from 'node:crypto'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { fetchVerifiedRequire } from '../scripts/browser-test/require.mjs'

const source = 'window.library = "verified";'
const digest = createHash('sha384').update(source).digest('base64')
const url = `https://cdn.example.test/library.js#sha384=${digest}`

afterEach(() => vi.unstubAllGlobals())

describe('browser injection dependencies', () => {
    it('returns only an integrity-verified response', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(source)))
        expect(await fetchVerifiedRequire(url)).toBe(source)
    })

    it('rejects a modified CDN response', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(`${source}window.modified = true;`)))
        await expect(fetchVerifiedRequire(url)).rejects.toThrow(/integrity/i)
    })

    it('rejects HTTP errors even if the body happens to match', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(source, { status: 503 })))
        await expect(fetchVerifiedRequire(url)).rejects.toThrow(/503/)
    })

    it.each([
        'https://cdn.example.test/library.js',
        'https://cdn.example.test/library.js#sha1=obsolete',
        `http://cdn.example.test/library.js#sha384=${digest}`,
    ])('rejects unpinned or insecure URLs before fetching: %s', async (input) => {
        const fetch = vi.fn().mockResolvedValue(new Response(source))
        vi.stubGlobal('fetch', fetch)
        await expect(fetchVerifiedRequire(input)).rejects.toThrow()
        expect(fetch).not.toHaveBeenCalled()
    })
})
