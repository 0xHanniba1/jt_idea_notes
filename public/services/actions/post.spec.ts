import { httpMock } from "@fider/services/testing"
import { searchPosts } from "./post"

test("search without a view preserves the API default scope", async () => {
  const mock = httpMock.alwaysOk()
  await searchPosts({ query: "original idea", noTags: true, myPosts: true })
  const url = new URL((mock.get as jest.Mock).mock.calls[0][0], "http://localhost")
  expect(url.pathname).toBe("/api/v1/posts")
  expect(url.searchParams.has("view")).toBe(false)
  expect(url.searchParams.get("query")).toBe("original idea")
  expect(url.searchParams.get("notags")).toBe("true")
  expect(url.searchParams.get("myposts")).toBe("true")
})

test.each(["trending", "most-wanted", "my-votes", "unknown"])("normalizes an explicitly supplied %s view in API requests", async (view) => {
  const mock = httpMock.alwaysOk()
  await searchPosts({ view, tags: ["bug"], limit: 40 })
  const url = new URL((mock.get as jest.Mock).mock.calls[0][0], "http://localhost")
  expect(url.searchParams.get("view")).toBe("recent")
  expect(url.searchParams.get("tags")).toBe("bug")
  expect(url.searchParams.get("limit")).toBe("40")
})
