import { act, cleanup, renderHook, waitFor } from "@testing-library/react"
import { MouseEvent } from "react"
import { shouldOpenPostOverlay, usePostOverlay } from "./use-post-overlay"

const origin = "http://localhost"
let scroll: jest.SpyInstance

beforeEach(() => {
  window.history.replaceState({ existing: "keep" }, "", `${origin}/?query=idea&limit=40#results`)
  document.body.innerHTML =
    '<h2 tabindex="-1" data-post-list-focus>Ideas</h2><a href="/posts/12/idea" data-post-number="12">First</a><a href="/posts/13/next" data-post-number="13">Next</a>'
  scroll = jest.spyOn(window, "scrollTo").mockImplementation(() => undefined)
})

afterEach(() => {
  cleanup()
  scroll.mockRestore()
})

const click = (number = 12) => {
  const element = document.querySelector(`[data-post-number="${number}"]`) as HTMLElement
  element.focus()
  return {
    button: 0,
    metaKey: false,
    ctrlKey: false,
    shiftKey: false,
    altKey: false,
    defaultPrevented: false,
    preventDefault: jest.fn(),
    currentTarget: element,
  } as unknown as MouseEvent<HTMLAnchorElement>
}

test("owns one history entry and restores source query/hash, focus and Back/Forward", async () => {
  const { result } = renderHook(() => usePostOverlay({ basePath: "/" }))
  const initialLength = window.history.length
  act(() => result.current.handlePostClick(12, "idea", click()))
  expect(result.current.selectedPostId).toBe(12)
  expect(window.location.pathname).toBe("/posts/12/idea")
  expect(window.history.state.existing).toBe("keep")
  expect(window.history.length).toBe(initialLength + 1)
  act(() => result.current.handleCloseOverlay())
  await waitFor(() => expect(result.current.selectedPostId).toBeNull())
  expect(window.location.href).toBe(`${origin}/?query=idea&limit=40#results`)
  expect(window.history.length).toBe(initialLength + 1)
  await waitFor(() => expect(document.querySelector('[data-post-number="12"]')).toHaveFocus())
  act(() => window.history.forward())
  await waitFor(() => expect(result.current.selectedPostId).toBe(12))
  act(() => window.history.back())
  await waitFor(() => expect(result.current.selectedPostId).toBeNull())
  expect(window.location.search).toBe("?query=idea&limit=40")
})

test("modified clicks preserve native navigation without adding overlay history", () => {
  const { result } = renderHook(() => usePostOverlay({ basePath: "/" }))
  for (const modifier of [{ metaKey: true }, { ctrlKey: true }, { shiftKey: true }, { altKey: true }, { button: 1 }]) {
    const event = { ...click(), ...modifier }
    expect(shouldOpenPostOverlay(event)).toBe(false)
    act(() => {
      expect(result.current.handlePostClick(12, "idea", event)).toBe(false)
    })
    expect(event.preventDefault).not.toHaveBeenCalled()
  }
  expect(result.current.selectedPostId).toBeNull()
  expect(window.location.pathname).toBe("/")
})

test("cancelled close and Back keep the draft and its owned history entry", async () => {
  const guard = jest.fn(() => false)
  const { result } = renderHook(() => usePostOverlay({ basePath: "/" }))
  act(() => result.current.handlePostClick(12, "idea", click()))
  act(() => result.current.setCloseGuard(guard))
  act(() => result.current.handleCloseOverlay())
  expect(result.current.selectedPostId).toBe(12)
  expect(window.location.pathname).toBe("/posts/12/idea")
  act(() => window.history.back())
  await waitFor(() => expect(guard).toHaveBeenCalledTimes(2))
  await waitFor(() => expect(window.location.pathname).toBe("/posts/12/idea"))
  expect(result.current.selectedPostId).toBe(12)
  guard.mockReturnValue(true)
  act(() => result.current.handleCloseOverlay())
  await waitFor(() => expect(result.current.selectedPostId).toBeNull())
  expect(guard).toHaveBeenCalledTimes(3)
})

test("refreshes changed server data once and falls back to the next record when removed", async () => {
  const refresh = jest.fn(async () => {
    document.querySelector('[data-post-number="12"]')?.remove()
  })
  const { result } = renderHook(() => usePostOverlay({ basePath: "/", onPostClosed: refresh }))
  act(() => result.current.handlePostClick(12, "idea", click()))
  act(() => result.current.setIsPostDirty(true))
  act(() => result.current.handleCloseOverlay())
  await waitFor(() => expect(result.current.selectedPostId).toBeNull())
  expect(refresh).toHaveBeenCalledTimes(1)
  expect(refresh).toHaveBeenCalledWith(12)
  await waitFor(() => expect(document.querySelector('[data-post-number="13"]')).toHaveFocus())
})

test("does not infer overlay state from direct URLs or consume new-record history", () => {
  const { result } = renderHook(() => usePostOverlay({ basePath: "/" }))
  act(() => {
    window.history.pushState({ modalOpen: true, other: "retained" }, "", window.location.href)
    window.dispatchEvent(new PopStateEvent("popstate", { state: window.history.state }))
  })
  expect(result.current.selectedPostId).toBeNull()
  expect(window.history.state.modalOpen).toBe(true)
  act(() => {
    window.history.replaceState({}, "", "/posts/99/direct")
    window.dispatchEvent(new PopStateEvent("popstate", { state: {} }))
  })
  expect(result.current.selectedPostId).toBeNull()
})

test("repeated close activation consumes only the drawer entry", async () => {
  const { result } = renderHook(() => usePostOverlay({ basePath: "/" }))
  act(() => result.current.handlePostClick(12, "idea", click()))
  const back = jest.spyOn(window.history, "back")
  act(() => {
    result.current.handleCloseOverlay()
    result.current.handleCloseOverlay()
  })
  expect(back).toHaveBeenCalledTimes(1)
  await waitFor(() => expect(result.current.selectedPostId).toBeNull())
  expect(window.location.search).toBe("?query=idea&limit=40")
  back.mockRestore()
})

test("restores a moved record to its previous viewport position after server updates", async () => {
  const trigger = document.querySelector('[data-post-number="12"]') as HTMLElement
  const position = jest.spyOn(trigger, "getBoundingClientRect").mockReturnValue({ top: 42 } as DOMRect)
  const { result } = renderHook(() => usePostOverlay({ basePath: "/" }))
  act(() => result.current.handlePostClick(12, "idea", click()))
  position.mockReturnValue({ top: 142 } as DOMRect)
  act(() => result.current.handleCloseOverlay())
  await waitFor(() => expect(scroll).toHaveBeenCalledWith(0, 100))
  position.mockRestore()
})
