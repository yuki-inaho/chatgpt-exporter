import { toHtml as hastToHtml } from 'hast-util-to-html'
import { fromMarkdown as fm } from 'mdast-util-from-markdown'
import { gfmFromMarkdown, gfmToMarkdown } from 'mdast-util-gfm'
import { toHast } from 'mdast-util-to-hast'
import { toMarkdown as tm } from 'mdast-util-to-markdown'
import { gfm } from 'micromark-extension-gfm'
import type { Content, Parent, Root } from 'mdast'
import type { Node } from 'unist'

// ref: https://github.com/rxliuli/mdbook/blob/master/libs/markdown-util

export function fromMarkdown(content: string): Root {
    return fm(content, {
        extensions: [gfm()],
        mdastExtensions: [gfmFromMarkdown()],
    })
}

export function toMarkdown(ast: Content | Root): string {
    return tm(ast, {
        bullet: '-',
        bulletOther: '*',
        bulletOrdered: '.',
        emphasis: '*',
        fence: '`',
        fences: true,
        listItemIndent: 'one',
        resourceLink: false,
        rule: '-',
        ruleRepetition: 3,
        ruleSpaces: false,
        strong: '*',
        extensions: [gfmToMarkdown()],
    })
}

/**
 * Neutralize a URL that would otherwise allow script execution when the
 * exported HTML is opened. Returns '' for dangerous schemes. `data:` URIs are
 * only allowed for images (assistant images are inlined as data URIs).
 */
function sanitizeUrl(url: string, allowDataImage: boolean): string {
    // Strip control chars / whitespace (code point <= 0x20 or 0x7F) used to
    // obfuscate the scheme, e.g. "java\tscript:" or leading newlines.
    const cleaned = Array.from(url)
        .filter((ch) => {
            const code = ch.charCodeAt(0)
            return code > 0x20 && code !== 0x7F
        })
        .join('')
    if (/^(?:javascript|vbscript|file):/i.test(cleaned)) return ''
    if (/^data:/i.test(cleaned)) {
        return allowDataImage && /^data:image\//i.test(cleaned) ? url : ''
    }
    return url
}

/** Recursively sanitize href/src attributes in a hast tree in place. */
function sanitizeHastUrls(node: any): void {
    if (!node || typeof node !== 'object') return
    if (node.type === 'element' && node.properties) {
        const props = node.properties
        if (node.tagName === 'a' && typeof props.href === 'string') {
            props.href = sanitizeUrl(props.href, false)
        }
        if ((node.tagName === 'img' || node.tagName === 'source') && typeof props.src === 'string') {
            props.src = sanitizeUrl(props.src, true)
        }
    }
    if (Array.isArray(node.children)) {
        for (const child of node.children) sanitizeHastUrls(child)
    }
}

export function toHtml(node: Root): string {
    const hast = toHast(node)!
    sanitizeHastUrls(hast)
    return hastToHtml(hast)
}

export function flatMap<T extends Node>(
    tree: T,
    fn: (node: Node, i: number, parent?: Parent) => Node[],
): T {
    function transform(node: Node, i: number, parent?: Parent): Node[] {
        if ('children' in node) {
            const p = node as unknown as Parent
            p.children = p.children.flatMap((item, i) => transform(item, i, p)) as any
        }
        return fn(node, i, parent)
    }
    return transform(tree, 0, undefined)[0] as T
}
