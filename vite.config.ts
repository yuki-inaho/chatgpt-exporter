import preact from '@preact/preset-vite'
import { defineConfig } from 'vite'
import monkey from 'vite-plugin-monkey'
import packageJson from './package.json'

// https://vitejs.dev/config/
export default defineConfig({
    // https://github.com/lisonge/vite-plugin-monkey/issues/10#issuecomment-1207264978
    esbuild: {
        charset: 'utf8',
    },
    plugins: [
        preact({
            devToolsEnabled: false,
            devtoolsInProd: false,
        }),
        monkey({
            entry: 'src/main.tsx',
            userscript: {
                'name': {
                    '': packageJson.title,
                    'zh-CN': packageJson['title:zh-CN'],
                    'zh-TW': packageJson['title:zh-TW'],
                },
                'author': packageJson.author,
                'namespace': packageJson.author,
                'description': {
                    '': packageJson.description,
                    'zh-CN': packageJson['description:zh-CN'],
                    'zh-TW': packageJson['description:zh-TW'],
                },
                'license': packageJson.license,
                'match': [
                    'https://chat.openai.com/',
                    // support https://chat.openai.com/?model={model}
                    'https://chat.openai.com/?*',
                    // support https://chat.openai.com/c/123456789
                    'https://chat.openai.com/c/*',
                    // support https://chat.openai.com/g/g-123456789
                    'https://chat.openai.com/g/*',
                    // support https://chat.openai.com/gpts/
                    'https://chat.openai.com/gpts',
                    'https://chat.openai.com/gpts/*',
                    // support https://chat.openai.com/share/123456789
                    'https://chat.openai.com/share/*',
                    // support https://chat.openai.com/share/123456789/continue
                    'https://chat.openai.com/share/*/continue',

                    'https://chatgpt.com/',
                    'https://chatgpt.com/?*',
                    'https://chatgpt.com/c/*',
                    'https://chatgpt.com/g/*',
                    'https://chatgpt.com/gpts',
                    'https://chatgpt.com/gpts/*',
                    'https://chatgpt.com/share/*',
                    'https://chatgpt.com/share/*/continue',

                    'https://new.oaifree.com/',
                    'https://new.oaifree.com/?model=*',
                    'https://new.oaifree.com/c/*',
                    'https://new.oaifree.com/g/*',
                    'https://new.oaifree.com/gpts',
                    'https://new.oaifree.com/gpts/*',
                    'https://new.oaifree.com/share/*',
                    'https://new.oaifree.com/share/*/continue',
                ],
                'icon': 'https://chat.openai.com/favicon.ico',
                'run-at': 'document-end',
            },
            build: {
                fileName: 'chatgpt.user.js',
                // Pin exact versions and attach Subresource Integrity hashes to
                // the @require URLs so a compromised/poisoned CDN response cannot
                // execute arbitrary code in the chatgpt.com page context.
                // Tampermonkey/Violentmonkey verify the `#sha384=` fragment.
                externalGlobals: [
                    ['jszip', ['JSZip', 'https://cdn.jsdelivr.net/npm/jszip@3.9.1/dist/jszip.min.js#sha384=QC9YCuBRpz3M81TBQGFGTrpTo2B2igltSqvOvHmbG3mb9X3Ftljj+WWRfI6VojME']],
                    ['html2canvas', ['html2canvas', 'https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js#sha384=ZZ1pncU3bQe8y31yfZdMFdSpttDoPmOZg2wguVK9almUodir1PghgT0eY7Mrty8H']],
                ],
                cssSideEffects() {
                    return (e) => {
                        const o = document.createElement('style')
                        o.textContent = e
                        document.head.append(o)
                        setInterval(() => {
                            if (o.isConnected) return
                            document.head.append(o)
                        }, 300)
                    }
                },
            },
            server: {
                open: true,
            },
        }),
    ],
    build: {
        cssMinify: false,
    },
})
