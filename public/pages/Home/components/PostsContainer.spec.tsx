import React, { act } from "react"
import { fireEvent, render, screen } from "@testing-library/react"
import { i18n } from "@lingui/core"
import { Post, UserRole, UserStatus } from "@fider/models"
import { Fider, FiderContext } from "@fider/services"
import { httpMock } from "@fider/services/testing"
import { PostsContainer } from "./PostsContainer"

const post: Post = {
  id: 1,
  number: 1,
  slug: "example",
  title: "Example idea",
  description: "A useful improvement",
  createdAt: "2026-09-16T00:00:00Z",
  status: "open",
  user: { id: 1, name: "Author", role: UserRole.Visitor, status: UserStatus.Active, isTrusted: false, avatarURL: "" },
  response: null,
  commentsCount: 0,
  tags: [],
  isApproved: true,
}

beforeEach(() => {
  jest.useFakeTimers()
  window.history.replaceState({}, "", "/")
  Fider.initialize({ settings: { baseURL: "http://localhost", environment: "development", oauth: [] }, tenant: { locale: "en" }, user: { name: "Author" } })
  i18n.load("en", {})
  i18n.activate("en")
})

afterEach(() => {
  jest.useRealTimers()
})

const pageData = (posts: Post[] = [], total = posts.length, page = 1, pageSize = 25) => ({ posts, total, page, pageSize })

const renderPosts = (posts: Post[] = [], total = posts.length, page = 1, pageSize = 25) =>
  render(
    <FiderContext.Provider value={Fider}>
      <PostsContainer pagination={{ total, page, pageSize }} posts={posts} tags={[]} countPerStatus={{}} />
    </FiderContext.Provider>
  )

test.each(["trending", "most-wanted", "my-votes", "unknown"])("normalizes %s links while retaining all unrelated parameters", (view) => {
  window.history.replaceState(
    {},
    "",
    `/?view=${view}&myvotes=false&tags=bug&statuses=started&myposts=true&notags=true&query=Test&moderation=pending&limit=40#top`
  )
  const mock = httpMock.alwaysOk()
  renderPosts()

  const url = new URL(window.location.href)
  expect(url.searchParams.get("view")).toBe("recent")
  expect(url.searchParams.has("myvotes")).toBe(false)
  expect(url.searchParams.get("tags")).toBe("bug")
  expect(url.searchParams.get("statuses")).toBe("started")
  expect(url.searchParams.get("myposts")).toBe("true")
  expect(url.searchParams.get("notags")).toBe("true")
  expect(url.searchParams.get("query")).toBe("Test")
  expect(url.searchParams.get("moderation")).toBeNull()
  expect(url.searchParams.get("limit")).toBe("25")
  expect(url.hash).toBe("#top")
  // The normalized SSR results are reused, with no extra request on hydration.
  expect(mock.get).not.toHaveBeenCalled()
})

test("defaults to recent and offers only recent and most discussed sorting", () => {
  renderPosts()
  fireEvent.click(screen.getByRole("button", { name: "Sort by: Recent" }))
  expect(screen.getByText("Recent")).toBeInTheDocument()
  expect(screen.getByText("Most Discussed")).toBeInTheDocument()
  expect(screen.queryByText("Trending")).not.toBeInTheDocument()
  expect(screen.queryByText("Most Wanted")).not.toBeInTheDocument()
})

test.each(["all", "planned", "started", "completed", "declined", "most-discussed", "recent"])("preserves the %s view when dropping a voting filter", (view) => {
  window.history.replaceState({}, "", `/?view=${view}&myvotes=true`)
  renderPosts()
  expect(new URL(window.location.href).searchParams.get("view")).toBe(view)
  expect(new URL(window.location.href).searchParams.has("myvotes")).toBe(false)
})

test("keeps the normalized view and filters when loading the next page", async () => {
  window.history.replaceState({}, "", "/?view=most-wanted&myvotes=true&tags=bug&statuses=started&myposts=true&moderation=pending&limit=1")
  const mock = httpMock.alwaysOk()
  ;(mock.get as jest.Mock).mockResolvedValue({ ok: true, data: pageData([post], 31, 2) })
  renderPosts([post], 31)
  expect(screen.getByRole("button", { name: "Previous page" })).toBeDisabled()
  fireEvent.click(screen.getByRole("button", { name: "Next page" }))
  await act(async () => {
    jest.advanceTimersByTime(500)
  })

  const requestURL = new URL((mock.get as jest.Mock).mock.calls[0][0], "http://localhost")
  expect(requestURL.pathname).toBe("/api/v1/posts")
  expect(requestURL.searchParams.get("view")).toBe("recent")
  expect(requestURL.searchParams.has("myvotes")).toBe(false)
  expect(requestURL.searchParams.get("tags")).toBe("bug")
  expect(requestURL.searchParams.get("statuses")).toBe("started")
  expect(requestURL.searchParams.get("myposts")).toBe("true")
  expect(requestURL.searchParams.get("moderation")).toBeNull()
  expect(requestURL.searchParams.get("limit")).toBe("25")
  expect(requestURL.searchParams.get("page")).toBe("2")
  expect(screen.getByRole("button", { name: "Next page" })).toBeDisabled()
  expect(screen.getByText("2 / 2")).toBeInTheDocument()
})

test("keeps My Posts available after removing My Votes", () => {
  renderPosts()
  fireEvent.click(screen.getByRole("button", { name: "Filter" }))
  expect(screen.getByText("My Posts")).toBeInTheDocument()
  expect(screen.queryByText("My Votes")).not.toBeInTheDocument()
})

test("ignores results from an earlier search after the query changes", async () => {
  const mock = httpMock.alwaysOk()
  const resolveRequests: Array<(value: unknown) => void> = []
  ;(mock.get as jest.Mock).mockImplementation(() => new Promise((resolve) => resolveRequests.push(resolve)))
  renderPosts()
  const input = screen.getByPlaceholderText("Search")
  fireEvent.change(input, { target: { value: "first" } })
  await act(async () => {
    jest.advanceTimersByTime(500)
  })
  fireEvent.change(input, { target: { value: "second" } })
  await act(async () => {
    jest.advanceTimersByTime(500)
  })
  await act(async () => {
    resolveRequests[1]({ ok: true, data: pageData([{ ...post, title: "Current result" }]) })
  })
  await act(async () => {
    resolveRequests[0]({ ok: true, data: pageData([{ ...post, title: "Stale result" }]) })
  })
  expect(screen.getByText("Current result")).toBeInTheDocument()
  expect(screen.queryByText("Stale result")).not.toBeInTheDocument()
})

test("shows a failed search separately from an empty result and retries the same query", async () => {
  const mock = httpMock.alwaysOk()
  ;(mock.get as jest.Mock).mockRejectedValueOnce(new Error("offline")).mockResolvedValue({ ok: true, data: pageData([post]) })
  renderPosts()
  fireEvent.change(screen.getByPlaceholderText("Search"), { target: { value: "idea" } })
  await act(async () => {
    jest.advanceTimersByTime(500)
  })
  expect(screen.getByRole("alert")).toHaveTextContent("Unable to load ideas")
  expect(screen.queryByText("No results matched your search, try something different.")).not.toBeInTheDocument()
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "Retry" }))
  })
  expect(screen.getByText(post.title)).toBeInTheDocument()
  expect(screen.queryByRole("alert")).not.toBeInTheDocument()
  expect(new URL((mock.get as jest.Mock).mock.calls[1][0], "http://localhost").searchParams.get("query")).toBe("idea")
})

test("refreshes the original filtered page after a mutation without rewriting the detail URL", async () => {
  window.history.replaceState({ source: "keep" }, "", "/?statuses=started&view=most-discussed&limit=40&query=idea")
  const mock = httpMock.alwaysOk()
  ;(mock.get as jest.Mock).mockResolvedValue({ ok: true, data: pageData([]) })
  const ref = React.createRef<PostsContainer>()
  render(
    <FiderContext.Provider value={Fider}>
      <PostsContainer ref={ref} posts={[post]} tags={[]} countPerStatus={{}} />
    </FiderContext.Provider>
  )
  window.history.pushState({ selectedPostId: 1 }, "", "/posts/1/example")
  await act(async () => {
    await ref.current?.refreshPosts()
  })
  const url = new URL((mock.get as jest.Mock).mock.calls[0][0], "http://localhost")
  expect(url.searchParams.get("statuses")).toBe("started")
  expect(url.searchParams.get("view")).toBe("most-discussed")
  expect(url.searchParams.get("limit")).toBe("25")
  expect(url.searchParams.get("query")).toBe("idea")
  expect(window.location.pathname).toBe("/posts/1/example")
  expect(screen.queryByText(post.title)).not.toBeInTheDocument()
})

test("page size and search reset to the first page and keep other filters", async () => {
  window.history.replaceState({}, "", "/?tags=bug&limit=25&page=2")
  const mock = httpMock.alwaysOk()
  ;(mock.get as jest.Mock).mockResolvedValue({ ok: true, data: pageData([post], 31, 1, 10) })
  renderPosts([post], 31, 2)
  fireEvent.click(screen.getByRole("button", { name: "Per page: 25" }))
  expect(screen.getByRole("menuitemradio", { name: "25" })).toHaveAttribute("aria-checked", "true")
  fireEvent.click(screen.getByRole("menuitemradio", { name: "10" }))
  await act(async () => {
    jest.advanceTimersByTime(500)
  })
  let url = new URL((mock.get as jest.Mock).mock.calls[0][0], "http://localhost")
  expect(url.searchParams.get("page")).toBe("1")
  expect(url.searchParams.get("limit")).toBe("10")
  expect(url.searchParams.get("tags")).toBe("bug")
  expect(screen.getByRole("status")).toHaveTextContent("31 total · 1–10")
  ;(mock.get as jest.Mock).mockResolvedValue({ ok: true, data: pageData([post], 31, 2, 10) })
  fireEvent.click(screen.getByRole("button", { name: "Next page" }))
  await act(async () => {
    jest.advanceTimersByTime(500)
  })
  ;(mock.get as jest.Mock).mockResolvedValue({ ok: true, data: pageData([], 0, 1, 10) })
  fireEvent.change(screen.getByPlaceholderText("Search"), { target: { value: "nothing" } })
  await act(async () => {
    jest.advanceTimersByTime(500)
  })
  url = new URL((mock.get as jest.Mock).mock.calls[2][0], "http://localhost")
  expect(url.searchParams.get("page")).toBe("1")
  expect(url.searchParams.get("limit")).toBe("10")
  expect(screen.getByRole("status")).toHaveTextContent("0 total · 0–0")
  expect(screen.getByRole("button", { name: "Next page" })).toBeDisabled()
  expect(screen.getByRole("button", { name: "Previous page" })).toBeDisabled()
})

test("uses server-clamped page after records are removed", async () => {
  window.history.replaceState({}, "", "/?page=3&limit=10")
  const mock = httpMock.alwaysOk()
  ;(mock.get as jest.Mock).mockResolvedValue({ ok: true, data: pageData([post], 20, 2, 10) })
  const ref = React.createRef<PostsContainer>()
  render(
    <FiderContext.Provider value={Fider}>
      <PostsContainer ref={ref} posts={[post]} pagination={{ total: 21, page: 3, pageSize: 10 }} tags={[]} countPerStatus={{}} />
    </FiderContext.Provider>
  )
  await act(async () => {
    await ref.current?.refreshPosts()
  })
  expect(new URL(window.location.href).searchParams.get("page")).toBe("2")
  expect(screen.getByText("2 / 2")).toBeInTheDocument()
  expect(screen.getByRole("status")).toHaveTextContent("20 total · 11–20")
})

test("progress switches one full list, keeps roadmap URL and resets page while preserving search", async () => {
  window.history.replaceState({}, "", "/roadmap?view=planned&page=2&limit=10&query=idea&statuses=deleted&tags=hidden")
  const mock = httpMock.alwaysOk()
  ;(mock.get as jest.Mock).mockResolvedValue({ ok: true, data: pageData([{ ...post, status: "started" }], 1, 1, 10) })
  render(
    <FiderContext.Provider value={Fider}>
      <PostsContainer progressView="planned" posts={[post]} tags={[]} countPerStatus={{}} pagination={{ total: 20, page: 2, pageSize: 10 }} />
    </FiderContext.Provider>
  )
  expect(screen.getByRole("button", { name: "Planned" })).toHaveAttribute("aria-pressed", "true")
  expect(screen.queryByRole("button", { name: /Sort by/ })).not.toBeInTheDocument()
  expect(new URL(window.location.href).searchParams.has("statuses")).toBe(false)
  fireEvent.click(screen.getByRole("button", { name: "Started" }))
  await act(async () => {
    jest.advanceTimersByTime(500)
  })
  const requestURL = new URL((mock.get as jest.Mock).mock.calls[0][0], "http://localhost")
  expect(requestURL.searchParams.get("view")).toBe("started")
  expect(requestURL.searchParams.get("page")).toBe("1")
  expect(requestURL.searchParams.get("query")).toBe("idea")
  expect(requestURL.searchParams.has("tags")).toBe(false)
  expect(window.location.pathname).toBe("/roadmap")
  expect(screen.getByRole("button", { name: "Started" })).toHaveAttribute("aria-pressed", "true")
})

test("empty progress retains switching, search and pagination and ignores stale state responses", async () => {
  window.history.replaceState({}, "", "/roadmap?view=planned")
  const mock = httpMock.alwaysOk()
  const resolvers: Array<(result: unknown) => void> = []
  ;(mock.get as jest.Mock).mockImplementation(() => new Promise((resolve) => resolvers.push(resolve)))
  render(
    <FiderContext.Provider value={Fider}>
      <PostsContainer progressView="planned" posts={[]} tags={[]} countPerStatus={{}} />
    </FiderContext.Provider>
  )
  expect(screen.getByPlaceholderText("Search")).toBeInTheDocument()
  expect(screen.getByRole("button", { name: "Next page" })).toBeDisabled()
  fireEvent.click(screen.getByRole("button", { name: "Started" }))
  await act(async () => {
    jest.advanceTimersByTime(500)
  })
  fireEvent.click(screen.getByRole("button", { name: "Completed" }))
  await act(async () => {
    jest.advanceTimersByTime(500)
  })
  await act(async () => {
    resolvers[1]({ ok: true, data: pageData([{ ...post, title: "Completed result", status: "completed" }]) })
  })
  await act(async () => {
    resolvers[0]({ ok: true, data: pageData([{ ...post, title: "Stale started result", status: "started" }]) })
  })
  expect(screen.getByText("Completed result")).toBeInTheDocument()
  expect(screen.queryByText("Stale started result")).not.toBeInTheDocument()
  expect(screen.getByRole("button", { name: "Completed" })).toHaveAttribute("aria-pressed", "true")
})
