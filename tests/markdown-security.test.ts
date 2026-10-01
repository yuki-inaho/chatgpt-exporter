import { describe, expect, it } from 'vitest'
import { toHtml } from '../src/utils/markdown'

describe('markdown URL safety after the micromark migration', () => {
    it.each(['javascript:alert(1)', 'vbscript:alert(1)', 'file:///etc/passwd', 'data:text/html,hello'])('drops %s links', (url) => {
        expect(toHtml(`[link](<${url}>)`)).toContain('href=""')
    })

    it('keeps HTTPS links and images', () => {
        expect(toHtml('[link](https://example.com) ![image](https://example.com/a.png)'))
            .toContain('href="https://example.com"')
        expect(toHtml('![image](https://example.com/a.png)')).toContain('src="https://example.com/a.png"')
    })

    it('drops raw HTML and its event handlers', () => {
        expect(toHtml('before <img src=x onerror=alert(1)> after')).toBe('<p>before  after</p>')
    })
})
