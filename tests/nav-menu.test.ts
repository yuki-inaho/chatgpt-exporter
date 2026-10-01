// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest'
import { getNavMenuMounts } from '../src/utils/navMenu'

afterEach(() => {
    document.body.innerHTML = ''
})

function insertMenus() {
    return getNavMenuMounts().map((mount) => {
        const container = document.createElement('div')
        container.dataset.testMenu = ''
        mount.insert(container)
        return container
    })
}

describe('exporter menu placement', () => {
    it('mounts a text row and rail icon when Your dot replaces the profile footer', () => {
        document.body.innerHTML = `
            <aside>
                <nav data-app-navigation-rail>
                    <div><button data-sidebar-destination="builtin:automations"></button></div>
                    <div id="profile"><button aria-haspopup="menu"></button></div>
                </nav>
                <nav id="sidebar">
                    <div><button data-sidebar-destination="builtin:orbit">Your dot</button></div>
                    <div data-app-action-sidebar-scroll></div>
                </nav>
            </aside>`

        const menus = insertMenus()

        expect(menus).toHaveLength(2)
        expect(document.querySelector('[data-app-action-sidebar-scroll]')?.previousElementSibling).toBe(menus[0])
        expect(document.querySelector('#profile')?.previousElementSibling).toBe(menus[1])
        expect(menus[1].style.pointerEvents).toBe('auto')
        expect(getNavMenuMounts().map(mount => mount.target)).toEqual([
            document.querySelector('[data-app-action-sidebar-scroll]'),
            document.querySelector('#profile button'),
        ])
    })

    it('keeps an existing expanded-sidebar footer', () => {
        document.body.innerHTML = '<nav><div data-app-action-sidebar-scroll></div><div id="footer"><button aria-haspopup="menu"></button></div></nav>'
        const [menu] = insertMenus()
        expect(document.querySelector('#footer')?.firstElementChild).toBe(menu)
    })

    it('supports a footer outside the wrapping nav', () => {
        document.body.innerHTML = '<aside><nav><div data-app-action-sidebar-scroll></div></nav><div id="footer"><button aria-haspopup="menu"></button></div></aside>'
        const [menu] = insertMenus()
        expect(document.querySelector('#footer')?.firstElementChild).toBe(menu)
    })

    it('keeps the legacy profile-button placement', () => {
        document.body.innerHTML = '<nav><div id="profile"><button data-testid="accounts-profile-button"></button></div></nav>'
        const [menu] = insertMenus()
        expect(document.querySelector('#profile')?.previousElementSibling).toBe(menu)
    })

    it('falls back to automations before a sidebar has mounted', () => {
        document.body.innerHTML = '<nav><span></span><button data-sidebar-destination="builtin:automations"></button></nav>'
        const [menu] = insertMenus()
        expect(document.querySelector('button')?.previousElementSibling).toBe(menu)
    })

    it('does not mount without a supported navigation anchor', () => {
        expect(getNavMenuMounts()).toEqual([])
    })
})
