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

const renderPosts = (posts: Post[] = []) =>
  render(
    <FiderContext.Provider value={Fider}>
      <PostsContainer posts={posts} tags={[]} countPerStatus={{}} />
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
  expect(url.searchParams.get("moderation")).toBe("pending")
  expect(url.searchParams.get("limit")).toBe("40")
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
  renderPosts([post])

  const moreLink = document.querySelector<HTMLAnchorElement>(".c-posts-container__list a[href*='limit=']")
  if (!moreLink) throw new Error("View more link is missing")
  const nextURL = new URL(moreLink.href)
  expect(nextURL.searchParams.get("view")).toBe("recent")
  expect(nextURL.searchParams.has("myvotes")).toBe(false)
  expect(nextURL.searchParams.get("limit")).toBe("11")

  fireEvent.click(moreLink)
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
  expect(requestURL.searchParams.get("moderation")).toBe("pending")
  expect(requestURL.searchParams.get("limit")).toBe("11")
})

test("keeps My Posts available after removing My Votes", () => {
  renderPosts()
  fireEvent.click(screen.getByRole("button", { name: "Filter" }))
  expect(screen.getByText("My Posts")).toBeInTheDocument()
  expect(screen.queryByText("My Votes")).not.toBeInTheDocument()
})
