import React, { useEffect, useRef, useState } from "react"
import {
  SignInModal,
  RSSModal,
  TenantLogo,
  NotificationIndicator,
  UserMenu,
  ThemeSwitcher,
  Icon,
  Button,
  ModerationIndicator,
  Modal,
  CloseIcon,
} from "@fider/components"
import { useFider } from "@fider/hooks"
import { Trans } from "@lingui/react/macro"
import { i18n } from "@lingui/core"
import IconRss from "@fider/assets/images/heroicons-rss.svg"
import IconSignIn from "@fider/assets/images/heroicons-arrowleft-rectangle.svg"
import "./Header.scss"

interface HeaderProps {
  hasInert?: boolean
  children?: React.ReactNode
  title?: string
  section?: { label: string; href: string }
}

const NavigationIcon = ({ kind, expand = false }: { kind: "ideas" | "roadmap" | "settings" | "panel"; expand?: boolean }) => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    {kind === "ideas" && <path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-8H9v8H4a1 1 0 0 1-1-1Z" />}
    {kind === "roadmap" && (
      <>
        <rect x="3" y="4" width="18" height="16" rx="2" />
        <path d="M9 4v16M15 4v16M5.5 8h1M11.5 12h1M17.5 16h1" />
      </>
    )}
    {kind === "settings" && (
      <>
        <path d="M4 7h16M4 17h16" />
        <circle cx="9" cy="7" r="2" fill="var(--canvas)" />
        <circle cx="15" cy="17" r="2" fill="var(--canvas)" />
      </>
    )}
    {kind === "panel" && (
      <>
        <rect x="3" y="3" width="18" height="18" rx="2" />
        <path d="M9 3v18" />
        <path d={expand ? "m13 7 3 5-3 5" : "m16 7-3 5 3 5"} />
      </>
    )}
  </svg>
)

interface SidebarProps {
  compact?: boolean
  active: string
  onSignIn: () => void
}

const Sidebar = ({ compact = false, active, onSignIn }: SidebarProps) => {
  const fider = useFider()
  const feedback = i18n._({ id: "header.nav.feedback", message: "All Feedback" })
  const roadmap = i18n._({ id: "header.nav.roadmap", message: "Roadmap" })
  const brandTitle = "金唐"
  const brandSubtitle = i18n._({ id: "workspace.brand.subtitle", message: "Requirements workspace" })
  const brandLabel = `${brandTitle} · ${brandSubtitle}`
  const link = (href: string, label: string, kind: "ideas" | "roadmap" | "settings") => (
    <a
      href={href}
      className="c-workspace__nav-link"
      aria-current={active === kind ? "page" : undefined}
      title={compact ? label : undefined}
      aria-label={compact ? label : undefined}
    >
      <NavigationIcon kind={kind} />
      <span className="c-workspace__nav-label">{label}</span>
    </a>
  )
  return (
    <>
      <a href="/" className="c-workspace__brand" title={compact ? brandLabel : undefined} aria-label={brandLabel}>
        <span className="c-workspace__brand-mark">{fider.session.tenant.logoBlobKey ? <TenantLogo size={100} /> : <span aria-hidden="true">JT</span>}</span>
        <span className="c-workspace__brand-text">
          <strong>{brandTitle}</strong>
          <small>{brandSubtitle}</small>
        </span>
      </a>
      <nav className="c-workspace__navigation" aria-label={i18n._({ id: "workspace.navigation", message: "Main navigation" })}>
        <div className="c-workspace__nav-group">
          <Trans id="workspace.label">Workspace</Trans>
        </div>
        {link("/", feedback, "ideas")}
        {link("/roadmap", roadmap, "roadmap")}
      </nav>
      <div className="c-workspace__account">
        {fider.session.isAuthenticated ? (
          <UserMenu sidebar compact={compact} />
        ) : (
          <Button onClick={onSignIn} ariaLabel={i18n._({ id: "action.signin", message: "Sign in" })}>
            {compact ? <Icon sprite={IconSignIn} width="16" height="16" /> : <Trans id="action.signin">Sign in</Trans>}
          </Button>
        )}
      </div>
    </>
  )
}

export const Header = (props: HeaderProps) => {
  const fider = useFider()
  const [isSignInModalOpen, setIsSignInModalOpen] = useState(false)
  const [isRSSModalOpen, setIsRSSModalOpen] = useState(false)
  const [collapsed, setCollapsed] = useState(false)
  const [mobile, setMobile] = useState(false)
  const [navigationOpen, setNavigationOpen] = useState(false)
  const contentRef = useRef<HTMLElement>(null)

  useEffect(() => {
    try {
      setCollapsed(localStorage.getItem("jt-workspace-sidebar") === "collapsed")
    } catch {
      /* Storage is optional. */
    }
    const query = window.matchMedia("(max-width: 680px)")
    const update = () => {
      setMobile(query.matches)
      if (!query.matches) setNavigationOpen(false)
    }
    update()
    query.addEventListener("change", update)
    return () => query.removeEventListener("change", update)
  }, [])

  const toggleNavigation = () => {
    if (mobile) setNavigationOpen(true)
    else {
      setCollapsed(!collapsed)
      try {
        localStorage.setItem("jt-workspace-sidebar", collapsed ? "expanded" : "collapsed")
      } catch {
        /* Navigation works without persistence. */
      }
    }
  }
  // A details drawer changes history without leaving its source page.
  const [pathname] = useState(() => (typeof window !== "undefined" ? window.location.pathname || "/" : "/"))
  const active =
    pathname === "/roadmap" ? "roadmap" : pathname.startsWith("/admin") ? "settings" : pathname === "/" || pathname.startsWith("/posts/") ? "ideas" : ""
  const title =
    props.title ||
    (active === "roadmap" ? i18n._({ id: "header.nav.roadmap", message: "Roadmap" }) : i18n._({ id: "header.nav.feedback", message: "All Feedback" }))
  const navigationLabel = i18n._({ id: "workspace.navigation", message: "Main navigation" })
  const sidebar = { active, onSignIn: () => setIsSignInModalOpen(true) }

  return (
    <div id="c-header" className={collapsed ? "c-workspace c-workspace--collapsed" : "c-workspace"} {...(props.hasInert && { inert: "true" })}>
      <a
        className="c-workspace__skip"
        href="#workspace-content"
        onClick={(event) => {
          event.preventDefault()
          contentRef.current?.focus()
        }}
      >
        <Trans id="workspace.skip">Skip to content</Trans>
      </a>
      <SignInModal isOpen={isSignInModalOpen} onClose={() => setIsSignInModalOpen(false)} />
      <RSSModal isOpen={isRSSModalOpen} onClose={() => setIsRSSModalOpen(false)} url={`${fider.settings.baseURL}/feed/global.atom`} />
      <aside id="workspace-sidebar" className="c-workspace__sidebar">
        <Sidebar {...sidebar} compact={collapsed} />
      </aside>
      <Modal.Window
        isOpen={navigationOpen && mobile}
        onClose={() => setNavigationOpen(false)}
        size="drawer"
        center={false}
        ariaLabel={navigationLabel}
        className="c-workspace__mobile-navigation"
      >
        <CloseIcon closeModal={() => setNavigationOpen(false)} />
        <Sidebar {...sidebar} />
      </Modal.Window>
      <div className="c-workspace__panel">
        <header className="c-workspace__topbar">
          <button
            type="button"
            className="c-workspace__toggle"
            onClick={toggleNavigation}
            aria-controls={mobile ? undefined : "workspace-sidebar"}
            aria-expanded={mobile ? navigationOpen : !collapsed}
            aria-label={
              mobile
                ? i18n._({ id: "workspace.navigation.open", message: "Open navigation" })
                : collapsed
                ? i18n._({ id: "workspace.navigation.expand", message: "Expand navigation" })
                : i18n._({ id: "workspace.navigation.collapse", message: "Collapse navigation" })
            }
          >
            <NavigationIcon kind="panel" expand={mobile || collapsed} />
          </button>
          <nav className="c-workspace__breadcrumbs" aria-label={i18n._({ id: "workspace.breadcrumbs", message: "Breadcrumb" })}>
            <a href={props.section?.href || "/"}>{props.section?.label || i18n._({ id: "workspace.label", message: "Workspace" })}</a>
            <span className="c-workspace__breadcrumb-divider" aria-hidden="true">
              /
            </span>
            <span aria-current="page" title={title}>
              {title}
            </span>
          </nav>
          <div className="c-workspace__actions">
            {fider.session.isAuthenticated && <ModerationIndicator />}
            {fider.session.tenant.isFeedEnabled && (
              <button
                type="button"
                className="c-themeswitcher"
                title={i18n._({ id: "action.postsfeed", message: "Posts Feed" })}
                onClick={() => setIsRSSModalOpen(true)}
              >
                <Icon sprite={IconRss} className="h-5" />
              </button>
            )}
            {fider.session.isAuthenticated && <NotificationIndicator />}
            <ThemeSwitcher />
          </div>
        </header>
        <main id="workspace-content" ref={contentRef} className="c-workspace__content" tabIndex={-1}>
          {props.children}
        </main>
      </div>
    </div>
  )
}
