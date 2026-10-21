import { createHash } from 'node:crypto'
import { Buffer } from 'node:buffer'

export async function fetchVerifiedRequire(url) {
    const parsed = new URL(url)
    const integrity = parsed.hash.match(/^#(sha256|sha384|sha512)=([A-Za-z0-9+/]+={0,2})$/)
    if (parsed.protocol !== 'https:' || !integrity) {
        throw new Error(`Require an HTTPS URL with a pinned integrity hash: ${url}`)
    }
    const response = await fetch(url, { signal: AbortSignal.timeout(30000) })
    if (!response.ok) throw new Error(`Dependency HTTP ${response.status}: ${url}`)
    const bytes = Buffer.from(await response.arrayBuffer())
    const actual = createHash(integrity[1]).update(bytes).digest('base64')
    if (actual !== integrity[2]) throw new Error(`Dependency integrity mismatch: ${url}`)
    return bytes.toString('utf8')
}
