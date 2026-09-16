import React, { act } from "react"
import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { i18n } from "@lingui/core"
import { Post, UserRole, UserStatus } from "@fider/models"
import { Fider, cache, actions, notify } from "@fider/services"
import { PostDetails } from "./PostDetails"
import { ShowComment } from "@fider/pages/ShowPost/components/ShowComment"
import { ResponseModal } from "@fider/pages/ShowPost/components/ResponseModal"
import { DeletePostModal } from "@fider/pages/ShowPost/components/DeletePostModal"

jest.mock("@lingui/react", () => ({
  Trans: ({ children, message }: any) => <>{children || message}</>,
}))
jest.mock("@fider/services/actions/post", () => ({
  ...jest.requireActual("@fider/services/actions/post"),
  updatePost: jest.fn(),
  createComment: jest.fn(),
  updateComment: jest.fn(),
  deleteComment: jest.fn(),
  deletePost: jest.fn(),
  respond: jest.fn(),
}))

jest.mock("@fider/components/common/form/CommentEditor", () => ({
  __esModule: true,
  default: ({ initialValue, onChange, field, disabled }: any) => (
    <textarea aria-label={field} defaultValue={initialValue} disabled={disabled} onChange={(event) => onChange(event.target.value)} />
  ),
}))

const post: Post = {
  id: 1,
  number: 1,
  title: "First record",
  slug: "first-record",
  description: "Original body",
  status: "open",
  createdAt: "2026-09-16T00:00:00Z",
  user: { id: 1, name: "Author", role: UserRole.Administrator, status: UserStatus.Active, isTrusted: true, avatarURL: "" },
  response: null,
  tags: [],
  commentsCount: 0,
  isApproved: true,
}
const response = (data: unknown, status = 200) => ({ ok: status < 400, status, json: async () => data } as Response)
const comment = { id: 27, content: "A comment", createdAt: post.createdAt, user: post.user, isApproved: true }

beforeEach(() => {
  window.history.replaceState({}, "", "/posts/1/first-record")
  document.body.innerHTML = '<div id="root-modal"></div>'
  sessionStorage.clear()
  Fider.initialize({
    settings: { baseURL: "http://localhost", environment: "development", oauth: [], avatarURL: "" },
    tenant: { locale: "en", allowedSchemes: "", isFeedEnabled: false },
    user: { ...post.user, isAdministrator: true, isCollaborator: true },
  })
  i18n.load("en", {})
  i18n.activate("en")
  Element.prototype.scrollIntoView = jest.fn()
  global.fetch = jest.fn(async (url: string) => {
    if (url.endsWith("/subscription")) return response({ subscribed: false })
    if (url.endsWith("/comments") || url.endsWith("/tags")) return response([])
    return response(post)
  }) as jest.Mock
  ;(actions.updatePost as jest.Mock).mockReset()
  ;(actions.createComment as jest.Mock).mockReset()
  ;(actions.updateComment as jest.Mock).mockReset()
  ;(actions.deleteComment as jest.Mock).mockReset()
  ;(actions.deletePost as jest.Mock).mockReset()
  ;(actions.respond as jest.Mock).mockReset()
  jest.spyOn(notify, "success").mockResolvedValue(undefined)
  jest.spyOn(notify, "error").mockResolvedValue(undefined)
})

afterEach(() => jest.restoreAllMocks())

test("ignores a delayed response after switching to a different record", async () => {
  let resolveFirst!: (value: Response) => void
  ;(fetch as jest.Mock).mockImplementation(async (url: string) => {
    if (url === "/api/v1/posts/1") return new Promise((resolve) => (resolveFirst = resolve))
    if (url === "/api/v1/posts/2") return response({ ...post, number: 2, title: "Second record" })
    if (url.endsWith("subscription")) return response({ subscribed: false })
    return response([])
  })
  const view = render(<PostDetails postNumber={1} />)
  view.rerender(<PostDetails postNumber={2} />)
  expect(await screen.findByRole("heading", { name: "Second record" })).toBeInTheDocument()
  await act(async () => resolveFirst(response(post)))
  expect(screen.queryByRole("heading", { name: "First record" })).not.toBeInTheDocument()
})

test.each([
  [401, "Please sign in again to view this record."],
  [403, "You do not have access to this record."],
  [404, "This record no longer exists."],
])("shows a bounded failure instead of permanent loading for HTTP %s", async (status, message) => {
  ;(fetch as jest.Mock).mockResolvedValue(response({}, status as number))
  render(<PostDetails postNumber={1} />)
  expect(await screen.findByRole("alert")).toHaveTextContent(message as string)
  expect(screen.queryByRole("status")).not.toBeInTheDocument()
})

test("retries a failed read and only then renders the record", async () => {
  ;(fetch as jest.Mock).mockRejectedValueOnce(new Error("offline"))
  render(<PostDetails postNumber={1} />)
  expect(await screen.findByRole("alert")).toHaveTextContent("Could not load this record")
  fireEvent.click(screen.getByRole("button", { name: "Retry" }))
  expect(await screen.findByRole("heading", { name: post.title })).toBeInTheDocument()
})

test("does not clear a comment hash until comments have loaded", async () => {
  window.history.replaceState({}, "", "/posts/1/first-record#comment-27")
  let resolveComments!: (value: Response) => void
  ;(fetch as jest.Mock).mockImplementation(async (url: string) => {
    if (url.endsWith("/comments")) return new Promise((resolve) => (resolveComments = resolve))
    if (url.endsWith("/subscription")) return response({ subscribed: false })
    if (url.endsWith("/tags")) return response([])
    return response(post)
  })
  render(<PostDetails postNumber={1} />)
  expect(location.hash).toBe("#comment-27")
  expect(notify.error).not.toHaveBeenCalled()
  await act(async () => resolveComments(response([comment])))
  expect(location.hash).toBe("#comment-27")
  expect(screen.getByText("A comment")).toBeInTheDocument()
  expect(Element.prototype.scrollIntoView).toHaveBeenCalled()
})

test("retains editing input after canceled close and clears the guard on permission loss", async () => {
  const onCloseGuardChange = jest.fn()
  render(<PostDetails postNumber={1} initialPost={post} onCloseGuardChange={onCloseGuardChange} />)
  fireEvent.click(screen.getByRole("button", { name: "Edit" }))
  fireEvent.change(screen.getByDisplayValue(post.title), { target: { value: "Unsaved title" } })
  const confirm = jest.spyOn(window, "confirm").mockReturnValue(false)
  const guard = onCloseGuardChange.mock.calls[onCloseGuardChange.mock.calls.length - 1][0]
  expect(guard()).toBe(false)
  expect(screen.getByDisplayValue("Unsaved title")).toBeInTheDocument()
  act(() => window.dispatchEvent(new CustomEvent("fider:access-denied", { detail: { status: 403 } })))
  expect(screen.queryByDisplayValue("Unsaved title")).not.toBeInTheDocument()
  expect(screen.getByRole("alert")).toHaveTextContent("You do not have access")
  expect(onCloseGuardChange).toHaveBeenLastCalledWith(null)
  const event = new Event("beforeunload", { cancelable: true })
  window.dispatchEvent(event)
  expect(event.defaultPrevented).toBe(false)
  expect(confirm).toHaveBeenCalledTimes(1)
})

test("saving updates the detail and notifies the background list without navigation", async () => {
  ;(actions.updatePost as jest.Mock).mockResolvedValue({ ok: true, data: undefined })
  const onDataChanged = jest.fn()
  render(<PostDetails postNumber={1} initialPost={post} onDataChanged={onDataChanged} />)
  fireEvent.click(screen.getByRole("button", { name: "Edit" }))
  fireEvent.change(screen.getByDisplayValue(post.title), { target: { value: "Saved title" } })
  ;(fetch as jest.Mock).mockImplementation(async (url: string) => {
    if (url.endsWith("/subscription")) return response({ subscribed: false })
    if (url.endsWith("/comments") || url.endsWith("/tags")) return response([])
    return response({ ...post, title: "Saved title" })
  })
  fireEvent.click(screen.getByRole("button", { name: "Save" }))
  expect(await screen.findByRole("heading", { name: "Saved title" })).toBeInTheDocument()
  expect(onDataChanged).toHaveBeenCalledTimes(1)
  expect(location.pathname).toBe("/posts/1/first-record")
})

test("posting comments clears only successful drafts and refreshes detail in place", async () => {
  ;(actions.createComment as jest.Mock)
    .mockResolvedValueOnce({ ok: false, data: undefined, error: { errors: [{ message: "Try again" }] } })
    .mockResolvedValue({ ok: true, data: undefined })
  const onDataChanged = jest.fn()
  render(<PostDetails postNumber={1} initialPost={post} onDataChanged={onDataChanged} />)
  fireEvent.change(screen.getByLabelText("content"), { target: { value: "Keep my draft" } })
  fireEvent.click(screen.getByRole("button", { name: "Post" }))
  expect(await screen.findByText("Try again")).toBeInTheDocument()
  expect(screen.getByLabelText("content")).toHaveValue("Keep my draft")
  expect(cache.session.get("CommentInput-Comment-Title-1")).toBe("Keep my draft")
  fireEvent.click(screen.getByRole("button", { name: "Post" }))
  await waitFor(() => expect(onDataChanged).toHaveBeenCalledTimes(1))
  expect(screen.getByLabelText("content")).toHaveValue("")
  expect(cache.session.get("CommentInput-Comment-Title-1")).toBeNull()
})

test("comment editing keeps failed input and refreshes locally after successful save", async () => {
  ;(actions.updateComment as jest.Mock).mockResolvedValueOnce({ ok: false, error: { errors: [{ message: "Comment failed" }] } }).mockResolvedValue({ ok: true })
  const onDataChanged = jest.fn()
  render(<ShowComment post={post} comment={comment} onDataChanged={onDataChanged} />)
  fireEvent.click(screen.getByRole("button", { name: "More options" }))
  fireEvent.click(screen.getByRole("menuitem", { name: "Edit" }))
  fireEvent.change(screen.getByLabelText("content"), { target: { value: "Changed comment" } })
  fireEvent.click(screen.getByRole("button", { name: "Save" }))
  expect(await screen.findByText("Comment failed")).toBeInTheDocument()
  expect(screen.getByLabelText("content")).toHaveValue("Changed comment")
  fireEvent.click(screen.getByRole("button", { name: "Save" }))
  await waitFor(() => expect(onDataChanged).toHaveBeenCalledTimes(1))
  expect(screen.queryByLabelText("content")).not.toBeInTheDocument()
})

test("copying a comment link in the drawer keeps the owned history entry", async () => {
  const state = { jtPostOverlay: { kind: "post", owner: "test" }, otherState: true }
  window.history.replaceState(state, "", "/posts/1/first-record")
  Object.defineProperty(window.navigator, "clipboard", { configurable: true, value: { writeText: jest.fn().mockResolvedValue(undefined) } })
  const push = jest.spyOn(window.history, "pushState")
  render(<ShowComment post={post} comment={comment} />)
  fireEvent.click(screen.getByRole("button", { name: "More options" }))
  fireEvent.click(screen.getByRole("menuitem", { name: "Copy link" }))
  expect(location.hash).toBe("#comment-27")
  expect(window.history.state).toEqual(state)
  expect(push).not.toHaveBeenCalled()
})

test("status changes report success through their callback and keep a failed response draft", async () => {
  ;(actions.respond as jest.Mock).mockResolvedValueOnce({ ok: false, error: { errors: [{ message: "Status failed" }] } }).mockResolvedValue({ ok: true })
  const onResponded = jest.fn()
  render(<ResponseModal post={post} showModal onCloseModal={jest.fn()} onResponded={onResponded} />)
  fireEvent.change(screen.getByLabelText("Status"), { target: { value: "started" } })
  fireEvent.change(screen.getByRole("textbox"), { target: { value: "Working on it" } })
  fireEvent.click(screen.getByRole("button", { name: "Submit" }))
  expect(await screen.findByText("Status failed")).toBeInTheDocument()
  expect(screen.getByRole("textbox")).toHaveValue("Working on it")
  fireEvent.click(screen.getByRole("button", { name: "Submit" }))
  await waitFor(() => expect(onResponded).toHaveBeenCalledTimes(1))
  expect(actions.respond).toHaveBeenLastCalledWith(1, expect.objectContaining({ status: "started", text: "Working on it" }))
})

test("deleting a record uses the drawer callback after server success", async () => {
  ;(actions.deletePost as jest.Mock).mockResolvedValue({ ok: true })
  const onDeleted = jest.fn()
  const onModalClose = jest.fn()
  render(<DeletePostModal post={post} showModal onModalClose={onModalClose} onDeleted={onDeleted} />)
  fireEvent.click(screen.getByRole("button", { name: "Delete" }))
  await waitFor(() => expect(onDeleted).toHaveBeenCalledTimes(1))
  expect(onModalClose).toHaveBeenCalledTimes(1)
  expect(location.pathname).toBe("/posts/1/first-record")
})
