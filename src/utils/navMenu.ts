// ChatGPT A/B tests its layout, so users can get different variants at the
// same time. Each injection point notes the date it was added. Keep it for at
// least 30 days, then remove it once no variant renders it anymore.

// Added 2026-05-03.
const PROFILE_BUTTON_SELECTOR = '[data-testid="accounts-profile-button"]'
// Added 2026-09-20. Footer after the nav: 2026-09-26.
const SIDEBAR_SCROLL_SELECTOR = '[data-app-action-sidebar-scroll]'
// Added 2026-09-20.
const AUTOMATIONS_SELECTOR = '[data-sidebar-destination="builtin:automations"]'
// Added 2026-09-25. The rail keeps the help and profile menus in its footer.
const RAIL_MENU_BUTTON_SELECTOR = '[data-app-navigation-rail] button[aria-haspopup="menu"]'

export interface NavMenuMount {
    target: Element
    insert: (container: Element) => void
}

export const NAV_MENU_SELECTORS = [PROFILE_BUTTON_SELECTOR, SIDEBAR_SCROLL_SELECTOR, RAIL_MENU_BUTTON_SELECTOR, AUTOMATIONS_SELECTOR]

function getNavMenuInsertionTarget(target: Element) {
    const wrapper = target.parentElement
    if (!wrapper || wrapper.children.length !== 1) return target

    return wrapper
}

export function getNavMenuMounts(): NavMenuMount[] {
    const profileButtons = Array.from(document.querySelectorAll(PROFILE_BUTTON_SELECTOR))
    if (profileButtons.length > 0) {
        return profileButtons.map(target => ({
            target,
            insert: container => getNavMenuInsertionTarget(target).before(container),
        }))
    }

    // The redesigned shell keeps the expanded sidebar and the collapsed rail
    // mounted together and hides one with `inert`, so mount a menu in each.
    const mounts: NavMenuMount[] = []

    Array.from(document.querySelectorAll(SIDEBAR_SCROLL_SELECTOR)).forEach((scrollRoot) => {
        // The profile footer follows either the scroll root or its wrapping nav.
        const footer = [scrollRoot.nextElementSibling, scrollRoot.parentElement?.nextElementSibling]
            .find(el => el?.querySelector('button[aria-haspopup="menu"]'))
        if (footer) {
            mounts.push({
                target: footer,
                insert: (container) => {
                    // Line up with the sidebar rows, which the footer insets, and
                    // keep a gap from the chat list that ends right above it.
                    Object.assign((container as HTMLElement).style, {
                        paddingInline: 'var(--padding-row-x)',
                        paddingTop: '8px',
                    })
                    footer.prepend(container)
                },
            })
        }
        else {
            // Added 2026-10-01. The Your dot layout keeps the profile in the
            // rail, leaving no footer in the expanded sidebar.
            const sidebar = scrollRoot.closest('nav')
            if (sidebar && !sidebar.hasAttribute('data-app-navigation-rail')) {
                mounts.push({
                    target: scrollRoot,
                    insert: (container) => {
                        Object.assign((container as HTMLElement).style, {
                            flexShrink: '0',
                            paddingInline: 'var(--padding-row-x, 8px)',
                        })
                        scrollRoot.before(container)
                    },
                })
            }
        }
    })

    // Place the menu in its own row above the first footer menu of the rail.
    const railMenuButton = document.querySelector(RAIL_MENU_BUTTON_SELECTOR)
    const rail = railMenuButton?.closest('[data-app-navigation-rail]')
    const railRow = rail && Array.from(rail.children).find(row => row.contains(railMenuButton))
    if (railMenuButton && railRow) {
        mounts.push({
            target: railMenuButton,
            insert: (container) => {
                // The rail itself ignores pointer events and each row opts back in.
                (container as HTMLElement).style.pointerEvents = 'auto'
                railRow.before(container)
            },
        })
    }

    if (mounts.length > 0) return mounts

    return Array.from(document.querySelectorAll(AUTOMATIONS_SELECTOR)).map(target => ({
        target,
        insert: container => getNavMenuInsertionTarget(target).before(container),
    }))
}
