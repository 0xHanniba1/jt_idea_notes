import React from "react"
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react"
import { i18n } from "@lingui/core"
import { Fider } from "@fider/services"
import { Header } from "./Header"

jest.mock("@fider/components", () => ({
  ...jest.requireActual("@fider/components"),
  NotificationIndicator: () => null,
  ModerationIndicator: () => null,
  SignInModal: () => null,
  RSSModal: () => null,
}))
jest.mock("@lingui/react", () => ({
  Trans: ({ children, message, id }: { children?: React.ReactNode; message?: string; id?: string }) => <>{children || message || id}</>,
}))
let mobile = false
let changed: (() => void) | undefined
const initialize = (staff = true, authenticated = true) =>
  Fider.initialize({
    settings: { oauth: [], baseURL: "http://test.localhost" },
    tenant: { name: "Idea Notes", allowedSchemes: "", locale: "en" },
    user: authenticated ? { id: 1, name: "Test Admin", isAdministrator: staff, isCollaborator: staff } : undefined,
  })
const renderShell = () =>
  render(
    <Header title="Test page">
      <input aria-label="Draft" defaultValue="Keep me" />
    </Header>,
    { container: document.getElementById("root") as HTMLElement }
  )
beforeEach(() => {
  i18n.load("en", {})
  i18n.activate("en")
  initialize()
  mobile = false
  localStorage.clear()
  window.history.replaceState({}, "", "/")
  document.body.innerHTML = '<div id="root"></div><div id="root-modal"></div>'
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: jest.fn(() => ({
      matches: mobile,
      addEventListener: (_: string, callback: () => void) => {
        changed = callback
      },
      removeEventListener: jest.fn(),
    })),
  })
})
afterEach(() => {
  cleanup()
  jest.restoreAllMocks()
})

test.each(["administrator", "collaborator", "member"])("settings is only in the administrator account menu: %s", (role) => {
  Fider.initialize({
    settings: { oauth: [], baseURL: "http://test.localhost" },
    tenant: { name: "Idea Notes", allowedSchemes: "", locale: "en" },
    user: { id: 1, name: "Test User", isAdministrator: role === "administrator", isCollaborator: role !== "member" },
  })
  renderShell()
  const nav = screen.getByRole("navigation", { name: "Main navigation" })
  expect(within(nav).queryByRole("link", { name: "Site Settings" })).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole("button", { name: "Test User" }))
  const menu = screen.getByRole("menu", { name: "Test User" })
  expect(within(menu).queryByText("Test User")).not.toBeInTheDocument()
  expect(within(menu).queryByText("Administration")).not.toBeInTheDocument()
  expect(within(menu).getByRole("menuitem", { name: "My Settings" })).toBeInTheDocument()
  expect(within(menu).getByRole("menuitem", { name: "Sign out" })).toBeInTheDocument()
  const settings = within(menu).queryByRole("menuitem", { name: "Site Settings" })
  if (role === "administrator") expect(settings).toHaveAttribute("href", "/admin")
  else expect(settings).not.toBeInTheDocument()
})

test("collapse persists across full page visits without remounting or losing content", () => {
  const view = renderShell()
  const draft = screen.getByLabelText("Draft")
  fireEvent.change(draft, { target: { value: "Unsaved text" } })
  fireEvent.click(screen.getByRole("button", { name: "Collapse navigation" }))
  expect(screen.getByRole("button", { name: "Expand navigation" })).toHaveAttribute("aria-expanded", "false")
  expect(screen.getByLabelText("Draft")).toBe(draft)
  expect(draft).toHaveValue("Unsaved text")
  view.unmount()
  cleanup()
  document.body.innerHTML = '<div id="root"></div><div id="root-modal"></div>'
  renderShell()
  expect(screen.getByRole("button", { name: "Expand navigation" })).toHaveAttribute("aria-expanded", "false")
})

test("opening a roadmap details drawer retains the source section after history changes", () => {
  window.history.replaceState({}, "", "/roadmap")
  const view = renderShell()
  window.history.pushState({}, "", "/posts/1/example")
  view.rerender(
    <Header title="Roadmap">
      <input aria-label="Draft" />
    </Header>
  )
  expect(screen.getByRole("link", { name: "Roadmap" })).toHaveAttribute("aria-current", "page")
  expect(screen.getByRole("link", { name: "All Feedback" })).not.toHaveAttribute("aria-current")
})

test("mobile navigation traps focus, restores the trigger on Escape, and does not reopen after a resize", () => {
  mobile = true
  renderShell()
  const trigger = screen.getByRole("button", { name: "Open navigation" })
  trigger.focus()
  fireEvent.click(trigger)
  const dialog = screen.getByRole("dialog", { name: "Main navigation" })
  expect(document.getElementById("root")).toHaveAttribute("inert")
  expect(dialog.contains(document.activeElement)).toBe(true)
  const close = within(dialog).getByRole("button", { name: "Close" })
  close.focus()
  fireEvent.keyDown(close, { key: "Tab", shiftKey: true })
  expect(dialog.contains(document.activeElement)).toBe(true)
  expect(document.activeElement).not.toBe(close)
  fireEvent.keyDown(document.activeElement as HTMLElement, { key: "Escape" })
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
  expect(document.getElementById("root")).not.toHaveAttribute("inert")
  expect(document.activeElement).toBe(trigger)
  fireEvent.click(trigger)
  // matchMedia's object reflects the current breakpoint on its change event.
  act(() => {
    ;(window.matchMedia as jest.Mock).mock.results[0].value.matches = false
    changed?.()
  })
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
  act(() => {
    ;(window.matchMedia as jest.Mock).mock.results[0].value.matches = true
    changed?.()
  })
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
})

test("the skip link moves focus to the main workspace", () => {
  renderShell()
  fireEvent.click(screen.getByRole("link", { name: "Skip to content" }))
  expect(document.activeElement).toBe(screen.getByRole("main"))
})
