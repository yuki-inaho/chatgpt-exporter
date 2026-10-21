import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import packageJson from '../package.json'

const template = readFileSync(new URL('../src/template.html', import.meta.url), 'utf8')

describe('exported HTML dependencies', () => {
    it('pins the installed KaTeX version and integrity for all three resources', () => {
        const resources = [...template.matchAll(/(?:href|src)="https:\/\/cdnjs.cloudflare.com\/ajax\/libs\/KaTeX\/([^/]+)\/([^"]+)" integrity="(sha512-[^"]+)"/g)]
        expect(resources).toHaveLength(3)
        for (const [, version, file, integrity] of resources) {
            expect(version).toBe(packageJson.devDependencies.katex)
            const bytes = readFileSync(new URL(`../node_modules/katex/dist/${file}`, import.meta.url))
            expect(integrity).toBe(`sha512-${createHash('sha512').update(bytes).digest('base64')}`)
        }
    })
})
