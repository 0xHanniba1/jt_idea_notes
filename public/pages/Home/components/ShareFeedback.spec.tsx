import React, { act } from "react"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { i18n } from "@lingui/core"
import { actions, cache, Fider } from "@fider/services"
import { TenantStatus, UserRole } from "@fider/models"
import { ShareFeedback } from "./ShareFeedback"
import { CACHE_KEYS } from "./PostCache"

jest.mock("@lingui/react", () => ({
  Trans: ({ children, message }: any) => <>{children || message}</>,
}))
jest.mock("@fider/services/actions/post", () => ({
  ...jest.requireActual("@fider/services/actions/post"),
  createPost: jest.fn(),
}))
jest.mock("./SimilarPosts", () => ({ SimilarPosts: () => null }))
jest.mock("@fider/components/common/form/CommentEditor", () => ({
  __esModule: true,
  default: ({ initialValue, onChange, field, disabled, placeholder, onImageUploaded }: any) => (
    <>
      <textarea
        aria-label={field}
        defaultValue={initialValue}
        disabled={disabled}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
      />
      <button type="button" onClick={() => onImageUploaded({ bkey: "screenshot", remove: false, upload: { content: "aW1hZ2U=", contentType: "image/png" } })}>
        Attach test image
      </button>
    </>
  ),
}))

const initialize = (tenant: Record<string, unknown> = {}) => {
  Fider.initialize({
    settings: { baseURL: "http://localhost", postWithTags: false },
    tenant: { locale: "en", allowedSchemes: "", status: TenantStatus.Active, ...tenant },
    user: { id: 1, name: "Admin", role: UserRole.Administrator },
  })
}
const renderEditor = () => render(<ShareFeedback isOpen placeholder="Record an idea" tags={[]} onClose={jest.fn()} />)
const titleInput = () => screen.getByLabelText("Title")
const publishButton = () => screen.getByRole("button", { name: "Publish" })

beforeEach(() => {
  window.history.replaceState({}, "", "/")
  document.body.innerHTML = '<div id="root-modal"></div>'
  localStorage.clear()
  sessionStorage.clear()
  initialize()
  i18n.load("en", {})
  i18n.activate("en")
  jest.mocked(actions.createPost).mockReset()
})

afterEach(() => {
  cleanup()
  jest.restoreAllMocks()
})

test("an empty form has no input placeholders and keeps its publish button visible but disabled", () => {
  renderEditor()
  expect(titleInput()).not.toHaveAttribute("placeholder")
  expect(screen.getByLabelText("description")).toHaveAttribute("placeholder", "")
  expect(publishButton()).toBeVisible()
  expect(publishButton()).toBeDisabled()
  fireEvent.click(publishButton())
  expect(actions.createPost).not.toHaveBeenCalled()
})

test("publication accepts 1–100 Unicode characters and rejects blank or oversized titles", () => {
  renderEditor()
  for (const title of ["", "  ", "\t\u0085\u3000\uFEFF", "中".repeat(101), "😀".repeat(101)]) {
    fireEvent.change(titleInput(), { target: { value: title } })
    expect(publishButton()).toBeVisible()
    expect(publishButton()).toBeDisabled()
  }
  for (const title of ["a", "修", "登录报错", "中".repeat(100), "😀".repeat(100), "  登录   报错  "]) {
    fireEvent.change(titleInput(), { target: { value: title } })
    expect(publishButton()).toBeEnabled()
  }
  expect(titleInput()).not.toHaveAttribute("maxlength")
})

test("description still supplies the title, and a failed submission preserves the draft and attachments for retry", async () => {
  const attachment = { bkey: "screenshot", remove: false, upload: { content: "aW1hZ2U=", contentType: "image/png" } }
  let finish!: (result: any) => void
  jest.mocked(actions.createPost).mockImplementation(() => new Promise((resolve) => (finish = resolve)))
  renderEditor()
  fireEvent.click(screen.getByRole("button", { name: "Attach test image" }))
  const description = "Keep an important idea for later"
  fireEvent.change(screen.getByLabelText("description"), { target: { value: description } })
  expect(titleInput()).toHaveValue(description)
  expect(publishButton()).toBeEnabled()
  fireEvent.click(publishButton())
  fireEvent.click(publishButton())
  expect(actions.createPost).toHaveBeenCalledTimes(1)
  expect(actions.createPost).toHaveBeenCalledWith(description, description, [attachment], [])
  expect(publishButton()).toBeDisabled()
  expect(titleInput()).toBeDisabled()
  expect(screen.getByLabelText("description")).toBeDisabled()
  await act(async () => {
    finish({ ok: false, error: { errors: [{ field: "title", message: "This title is already in use." }] } })
  })
  expect(screen.getByText("This title is already in use.")).toBeVisible()
  expect(titleInput()).toHaveValue(description)
  expect(screen.getByLabelText("description")).toHaveValue(description)
  expect(publishButton()).toBeVisible()
  expect(publishButton()).toBeEnabled()
  expect(cache.local.get(CACHE_KEYS.TITLE)).toBeFalsy()
  expect(cache.local.get(CACHE_KEYS.DESCRIPTION)).toBeFalsy()
  expect(cache.local.get(CACHE_KEYS.ATTACHMENT)).toBeFalsy()
})

test("each opening starts empty even when a description template is configured", () => {
  initialize({ descriptionTemplate: "A configured description template" })
  renderEditor()
  expect(screen.getByLabelText("description")).toHaveValue("")
  expect(titleInput()).toHaveValue("")
  expect(publishButton()).toBeDisabled()
})

test("read-only mode does not restore legacy drafts or allow publication", () => {
  initialize({ status: TenantStatus.Locked })
  cache.local.set(CACHE_KEYS.TITLE, "A valid saved draft title")
  renderEditor()
  expect(publishButton()).toBeVisible()
  expect(publishButton()).toBeDisabled()
  fireEvent.click(publishButton())
  expect(actions.createPost).not.toHaveBeenCalled()
})

test("title comes before content and remains unchanged while the content is edited", () => {
  renderEditor()
  const content = screen.getByLabelText("description")
  expect(titleInput().compareDocumentPosition(content) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  fireEvent.change(titleInput(), { target: { value: "A manually written title" } })
  fireEvent.change(content, { target: { value: "The detailed content goes here" } })
  expect(titleInput()).toHaveValue("A manually written title")
  expect(publishButton()).toBeEnabled()
})

test("new posts do not inherit hidden tags from an old draft or the current filter", async () => {
  Fider.initialize({
    settings: { baseURL: "http://localhost", postWithTags: true },
    tenant: { locale: "en", allowedSchemes: "", status: TenantStatus.Active },
    user: { id: 1, name: "Admin", role: UserRole.Administrator },
  })
  window.history.replaceState({}, "", "/?tags=bug")
  cache.local.set(CACHE_KEYS.TAGS, "bug")
  cache.local.set(CACHE_KEYS.TITLE, "A valid draft title")
  jest.mocked(actions.createPost).mockRejectedValue(new Error("Network unavailable"))
  render(
    <ShareFeedback isOpen placeholder="Record an idea" tags={[{ id: 1, name: "Bug", slug: "bug", color: "ffffff", isPublic: true }]} onClose={jest.fn()} />
  )
  expect(screen.queryByText("Tags")).not.toBeInTheDocument()
  expect(screen.queryByRole("button", { name: /Add tags/ })).not.toBeInTheDocument()
  fireEvent.change(titleInput(), { target: { value: "A valid draft title" } })
  await act(async () => {
    fireEvent.click(publishButton())
  })
  expect(actions.createPost).toHaveBeenCalledWith("A valid draft title", "", [], [])
})

test("closing discards title, content, errors and attachments before reopening", async () => {
  for (const key of Object.values(CACHE_KEYS)) cache.local.set(key, "legacy draft")
  const props = { placeholder: "Record an idea", tags: [], onClose: jest.fn() }
  const view = render(<ShareFeedback {...props} isOpen />)
  expect(titleInput()).toHaveValue("")
  expect(screen.getByLabelText("description")).toHaveValue("")
  fireEvent.change(titleInput(), { target: { value: "Discarded title" } })
  fireEvent.change(screen.getByLabelText("description"), { target: { value: "Discarded content" } })
  fireEvent.click(screen.getByRole("button", { name: "Attach test image" }))
  jest.mocked(actions.createPost).mockRejectedValue(new Error("Failed"))
  await act(async () => {
    fireEvent.click(publishButton())
  })
  expect(screen.getByText(/Unable to save your idea/)).toBeVisible()
  view.rerender(<ShareFeedback {...props} isOpen={false} />)
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
  view.rerender(<ShareFeedback {...props} isOpen />)
  expect(titleInput()).toHaveValue("")
  expect(screen.getByLabelText("description")).toHaveValue("")
  expect(screen.queryByText(/Unable to save your idea/)).not.toBeInTheDocument()
  expect(publishButton()).toBeDisabled()
  fireEvent.change(titleInput(), { target: { value: "Fresh" } })
  await act(async () => {
    fireEvent.click(publishButton())
  })
  expect(actions.createPost).toHaveBeenLastCalledWith("Fresh", "", [], [])
  for (const key of Object.values(CACHE_KEYS)) expect(cache.local.get(key)).toBeFalsy()
})
