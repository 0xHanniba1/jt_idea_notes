import React, { act } from "react"
import { fireEvent, render, screen } from "@testing-library/react"
import { i18n } from "@lingui/core"
import { actions } from "@fider/services"
import { Post } from "@fider/models"
import { PostSearch } from "./PostSearch"

jest.mock("@lingui/react", () => ({ Trans: ({ children, message }: any) => <>{children || message}</> }))
jest.mock("@fider/services/actions/post", () => ({
  ...jest.requireActual("@fider/services/actions/post"),
  searchPosts: jest.fn(),
}))

const post = { number: 1, title: "First result", status: "open" } as Post

beforeEach(() => {
  jest.useFakeTimers()
  ;(actions.searchPosts as jest.Mock).mockReset()
  i18n.load("en", {})
  i18n.activate("en")
})
afterEach(() => jest.useRealTimers())

const enterQuery = async (value: string) => {
  fireEvent.change(screen.getByRole("textbox"), { target: { value } })
  await act(async () => jest.advanceTimersByTime(500))
}

test("ignores a prior query response and clears results when the query is emptied", async () => {
  let resolveFirst!: (value: unknown) => void
  ;(actions.searchPosts as jest.Mock)
    .mockImplementationOnce(() => new Promise((resolve) => (resolveFirst = resolve)))
    .mockResolvedValue({ ok: true, data: [{ ...post, number: 2, title: "Second result" }] })
  render(<PostSearch onChanged={jest.fn()} />)
  await enterQuery("first")
  await enterQuery("second")
  expect(screen.getByRole("button", { name: /Second result/ })).toBeInTheDocument()
  await act(async () => resolveFirst({ ok: true, data: [post] }))
  expect(screen.queryByRole("button", { name: /First result/ })).not.toBeInTheDocument()
  await enterQuery("")
  expect(screen.queryByRole("button", { name: /Second result/ })).not.toBeInTheDocument()
})

test("retains an accessible selected target and disables all editing during submission", async () => {
  ;(actions.searchPosts as jest.Mock).mockResolvedValue({ ok: true, data: [post] })
  const onChanged = jest.fn()
  const view = render(<PostSearch onChanged={onChanged} />)
  await enterQuery("first")
  const target = screen.getByRole("button", { name: /First result/ })
  target.focus()
  expect(target).toHaveFocus()
  fireEvent.click(target)
  expect(onChanged).toHaveBeenCalledWith(1)
  expect(target).toHaveAttribute("aria-pressed", "true")
  await enterQuery("")
  expect(screen.getByRole("button", { name: /First result/ })).toHaveAttribute("aria-pressed", "true")
  view.rerender(<PostSearch onChanged={onChanged} disabled />)
  expect(screen.getByRole("textbox")).toBeDisabled()
  expect(screen.getByRole("button", { name: /First result/ })).toBeDisabled()
})

test("shows a failed query and retries without replacing it with a false empty state", async () => {
  ;(actions.searchPosts as jest.Mock).mockRejectedValueOnce(new Error("offline")).mockResolvedValue({ ok: true, data: [post] })
  render(<PostSearch onChanged={jest.fn()} />)
  await enterQuery("first")
  expect(screen.getByRole("alert")).toHaveTextContent("Unable to load ideas")
  expect(screen.queryByText("No results matched your search, try something different.")).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole("button", { name: "Retry" }))
  await act(async () => jest.advanceTimersByTime(500))
  expect(screen.getByRole("button", { name: /First result/ })).toBeInTheDocument()
})
