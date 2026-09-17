import React from "react"
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { i18n } from "@lingui/core"
import { Fider, http, notify } from "@fider/services"
import { ManagedUser, UserRole, UserStatus } from "@fider/models"
import ManageMembersPage from "./ManageMembers.page"
import { AccountModal } from "../components/AccountModal"

jest.mock("../components/AdminBasePage", () => ({ AdminPageContainer: ({ children }: { children: React.ReactNode }) => <>{children}</> }))
jest.mock("@lingui/react", () => ({
  Trans: ({ children, message, id }: { children?: React.ReactNode; message?: string; id?: string }) => <>{children || message || id}</>,
}))

const member: ManagedUser = {
  id: 42,
  name: "Display nickname",
  username: "fixed.username",
  passwordInitialized: true,
  mustChangePassword: false,
  email: "",
  role: UserRole.Visitor,
  status: UserStatus.Active,
  isTrusted: false,
  avatarURL: "",
}
const automaticPassword = "Ab7!mQ9#rT2x"
const fill = (label: string, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } })
const submitForm = (label: string) => {
  const form = screen.getByLabelText(label).closest("form")
  if (!form) throw new Error("Expected a form")
  fireEvent.submit(form)
}
const submitCreate = () => submitForm("Nickname")

beforeEach(() => {
  i18n.load("en", {})
  i18n.activate("en")
  Fider.initialize({
    settings: { oauth: [] },
    tenant: { allowedSchemes: "", name: "Test" },
    user: { id: 1, name: "Admin", role: UserRole.Administrator, isAdministrator: true, isCollaborator: true },
  })
  document.body.innerHTML = '<div id="root-modal"></div>'
  jest.spyOn(notify, "success").mockImplementation(async () => undefined)
  jest.spyOn(http, "get").mockResolvedValue({ ok: true, data: { users: [member], totalPages: 1, totalCount: 1 } })
})
afterEach(() => {
  cleanup()
  jest.restoreAllMocks()
})

const page = () => render(<ManageMembersPage users={[member]} totalPages={1} totalCount={1} />)

test("creating an account separates immutable username and nickname, accepts an automatic password, and shows it only until dismissed", async () => {
  const post = jest.spyOn(http, "post").mockResolvedValue({ ok: true, data: { id: 43, temporaryPassword: automaticPassword } })
  const view = page()
  expect(screen.getByText("Display nickname")).toBeInTheDocument()
  expect(screen.getByText("@fixed.username")).toBeInTheDocument()
  fill("Username", "  New.Member  ")
  fill("Nickname", "新同事")
  submitCreate()
  const dialog = await screen.findByRole("dialog", { name: "Temporary sign-in details" })
  expect(post).toHaveBeenCalledWith("/_api/admin/accounts", { username: "new.member", name: "新同事", password: "", role: UserRole.Visitor })
  expect(within(dialog).getByLabelText("Username")).toHaveValue("new.member")
  expect(within(dialog).getByLabelText("Temporary password")).toHaveValue(automaticPassword)
  expect(screen.getByLabelText("Nickname")).toHaveValue("")
  fireEvent.click(within(dialog).getByRole("button", { name: "Saved, close" }))
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument())
  expect(screen.queryByDisplayValue(automaticPassword)).not.toBeInTheDocument()
  expect(screen.getByLabelText("Username")).toHaveValue("")
  expect(screen.getByLabelText("Temporary password (optional)")).toHaveValue("")
  view.unmount()
  page()
  expect(screen.queryByDisplayValue(automaticPassword)).not.toBeInTheDocument()
})

test("creation prevents duplicate submissions and preserves input with a visible server field error", async () => {
  let complete!: (value: any) => void
  const post = jest.spyOn(http, "post").mockImplementation(
    () =>
      new Promise((resolve) => {
        complete = resolve
      })
  )
  page()
  fill("Username", "new.member")
  fill("Nickname", "新同事")
  submitCreate()
  submitCreate()
  expect(post).toHaveBeenCalledTimes(1)
  expect(screen.getByLabelText("Username")).toBeDisabled()
  await act(async () => {
    complete({ ok: false, error: { errors: [{ field: "username", message: "This username is already in use." }] } })
  })
  expect(await screen.findByText("This username is already in use.")).toBeInTheDocument()
  expect(screen.getByLabelText("Username")).toHaveValue("new.member")
  expect(screen.getByLabelText("Username")).toHaveAttribute("aria-describedby", "error-create-username")
  expect(screen.getByLabelText("Nickname")).toHaveValue("新同事")
  expect(screen.getByRole("button", { name: "Create account" })).not.toBeDisabled()
})

test("optional passwords enforce the 8–12 character range and preserve leading and trailing spaces", async () => {
  const post = jest.spyOn(http, "post").mockResolvedValue({ ok: true, data: { id: 43 } })
  page()
  fill("Username", "new.member")
  fill("Nickname", "New member")
  fill("Temporary password (optional)", "short")
  submitCreate()
  expect(post).not.toHaveBeenCalled()
  expect(await screen.findByRole("alert")).toHaveTextContent("8–12")
  fill("Temporary password (optional)", "Ab1!密码🔑abcdef")
  submitCreate()
  expect(post).not.toHaveBeenCalled()
  expect(await screen.findByRole("alert")).toHaveTextContent("8–12")
  const password = " 密码🔑Ab1 "
  fill("Temporary password (optional)", password)
  submitCreate()
  const dialog = await screen.findByRole("dialog", { name: "Temporary sign-in details" })
  expect(post).toHaveBeenCalledWith("/_api/admin/accounts", expect.objectContaining({ password }))
  expect(within(dialog).getByLabelText("Temporary password")).toHaveValue(password)
})

test("search and status filters query the server, reset pagination, and do not allow stale search responses to overwrite results", async () => {
  const get = jest.mocked(http.get)
  let firstResponse!: (value: any) => void
  get.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        firstResponse = resolve
      })
  )
  page()
  fill("Search by username or name", "nickname")
  fireEvent.click(screen.getByRole("button", { name: "Search" }))
  expect(get).toHaveBeenLastCalledWith("/api/v1/users?page=1&limit=10&status=all&query=nickname")
  fireEvent.change(screen.getByLabelText("Filter by account status"), { target: { value: "inactive" } })
  expect(get).toHaveBeenLastCalledWith("/api/v1/users?page=1&limit=10&status=inactive&query=nickname")
  await screen.findByText("@fixed.username")
  await act(async () => {
    firstResponse({ ok: true, data: { users: [{ ...member, name: "Stale result" }], totalPages: 1, totalCount: 1 } })
  })
  expect(screen.queryByText("Stale result")).not.toBeInTheDocument()
  expect(screen.getByText("Display nickname")).toBeInTheDocument()
})

test("list loading failures are visible and retryable", async () => {
  jest.mocked(http.get).mockResolvedValueOnce({ ok: false, data: undefined, error: { errors: [{ field: "status", message: "Unable to load accounts." }] } })
  page()
  fireEvent.click(screen.getByRole("button", { name: "Refresh" }))
  expect(await screen.findByRole("alert")).toHaveTextContent("Unable to load accounts.")
  fireEvent.click(screen.getByRole("button", { name: "Retry" }))
  await waitFor(() => expect(screen.queryByRole("alert")).not.toBeInTheDocument())
})

test("reset and restore use generated passwords without offering a username editor", async () => {
  const post = jest.spyOn(http, "post").mockResolvedValue({ ok: true, data: { id: 42, temporaryPassword: automaticPassword } })
  const restored = jest.spyOn(http, "delete").mockResolvedValue({ ok: true, data: { id: 42, temporaryPassword: automaticPassword } })
  const saved = jest.fn()
  const view = render(<AccountModal operation="reset" user={member} onClose={jest.fn()} onSaved={saved} />)
  expect(screen.queryByLabelText("Username")).not.toBeInTheDocument()
  submitForm("Temporary password (optional)")
  await waitFor(() => expect(saved).toHaveBeenCalledWith({ username: member.username, password: automaticPassword }))
  expect(post).toHaveBeenCalledWith("/_api/admin/accounts/42/reset-password", { password: "" })
  view.unmount()
  saved.mockClear()
  render(<AccountModal operation="restore" user={{ ...member, status: UserStatus.Blocked }} onClose={jest.fn()} onSaved={saved} />)
  submitForm("Temporary password (optional)")
  await waitFor(() => expect(saved).toHaveBeenCalledWith({ username: member.username, password: automaticPassword }))
  expect(restored).toHaveBeenCalledWith("/_api/admin/users/42/block", { password: "" })
})

test.each(["reset", "restore"] as const)("%s rejects supplied passwords outside 8–12 characters before calling the server", async (operation) => {
  const post = jest.spyOn(http, "post").mockResolvedValue({ ok: true, data: { id: member.id } })
  const remove = jest.spyOn(http, "delete").mockResolvedValue({ ok: true, data: { id: member.id } })
  render(<AccountModal operation={operation} user={member} onClose={jest.fn()} onSaved={jest.fn()} />)
  for (const invalidPassword of ["Ab1!密码🔑", "Ab1!密码🔑abcdef"]) {
    fill("Temporary password (optional)", invalidPassword)
    submitForm("Temporary password (optional)")
    expect(await screen.findByRole("alert")).toHaveTextContent("Use 8–12 characters.")
    expect(post).not.toHaveBeenCalled()
    expect(remove).not.toHaveBeenCalled()
  }
})

test("role changes preserve identity and display server-side last-administrator protection errors", async () => {
  const post = jest
    .spyOn(http, "post")
    .mockResolvedValue({ ok: false, data: undefined, error: { errors: [{ field: "userID", message: "Keep at least one administrator." }] } })
  render(<AccountModal operation="role" user={{ ...member, role: UserRole.Administrator }} onClose={jest.fn()} onSaved={jest.fn()} />)
  expect(screen.queryByLabelText("Username")).not.toBeInTheDocument()
  fireEvent.change(screen.getByLabelText("Role"), { target: { value: UserRole.Visitor } })
  submitForm("Role")
  expect(await screen.findByRole("alert")).toHaveTextContent("Keep at least one administrator.")
  expect(post).toHaveBeenCalledWith("/_api/admin/roles/visitor/users", { userID: 42 })
})
