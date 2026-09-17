import React from "react"
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { i18n } from "@lingui/core"
import { SignInControl } from "./SignInControl"
import { PasswordChangeForm } from "./PasswordChangeForm"
import { AccountModal } from "@fider/pages/Administration/components/AccountModal"
import ManageMembersPage from "@fider/pages/Administration/pages/ManageMembers.page"
import { NotificationSettings } from "@fider/pages/MySettings/components/NotificationSettings"
import { Fider, http } from "@fider/services"
import { ManagedUser, UserRole, UserStatus } from "@fider/models"

jest.mock("@fider/pages/Administration/components/AdminBasePage", () => ({
  AdminPageContainer: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))

jest.mock("@lingui/react", () => ({
  Trans: ({ children, message, id }: { children?: React.ReactNode; message?: string; id?: string }) => <>{children || message || id}</>,
}))

const originalLocation = window.location
const go = jest.fn()
const password = " 密码🔑Ab1 "
const legacyPassword = " A long test password with spaces "
const member: ManagedUser = {
  id: 42,
  name: "Existing member",
  username: "",
  passwordInitialized: false,
  mustChangePassword: false,
  email: "",
  role: UserRole.Visitor,
  status: UserStatus.Active,
  isTrusted: false,
  avatarURL: "",
}

beforeEach(() => {
  i18n.load("en", {})
  i18n.activate("en")
  Object.defineProperty(window, "location", { configurable: true, value: { ...originalLocation, pathname: "/signin", search: "", assign: go } })
  go.mockClear()
  Fider.initialize({ settings: { oauth: [] }, tenant: { allowedSchemes: "", name: "Test" }, user: undefined })
  document.body.innerHTML = '<div id="root-modal"></div>'
})
afterEach(() => {
  cleanup()
  jest.restoreAllMocks()
  Object.defineProperty(window, "location", { configurable: true, value: originalLocation })
})
const fill = (label: string, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } })
const submit = (label: string) => {
  const form = screen.getByLabelText(label).closest("form")
  if (!form) throw new Error("Expected a form")
  fireEvent.submit(form)
}

test("password login accepts existing long passwords, normalizes only the username, and prevents duplicate submits", async () => {
  let complete!: (value: any) => void
  const post = jest.spyOn(http, "post").mockImplementation(
    () =>
      new Promise((resolve) => {
        complete = resolve
      })
  )
  const onSignedIn = jest.fn()
  render(<SignInControl onSignedIn={onSignedIn} />)
  fill("Username", "  Employee.ONE  ")
  fill("Password", legacyPassword)
  submit("Password")
  submit("Password")
  expect(post).toHaveBeenCalledTimes(1)
  expect(post).toHaveBeenCalledWith("/_api/auth/password/signin", { username: "employee.one", password: legacyPassword })
  expect(screen.getByLabelText("Password")).toBeDisabled()
  await act(async () => {
    complete({ ok: true, data: { next: "password_change_required" } })
  })
  expect(go).toHaveBeenCalledWith("/password/change-required")
  expect(onSignedIn).not.toHaveBeenCalled()
  expect(screen.getByLabelText("Password")).toHaveValue("")
})

test("login errors remain editable, are associated with the password, and password visibility never changes its value", async () => {
  jest.spyOn(http, "post").mockResolvedValue({ ok: false, data: undefined, error: { errors: [{ field: "password", message: "Invalid credentials" }] } })
  render(<SignInControl />)
  fill("Username", "member")
  fill("Password", password)
  fireEvent.click(screen.getByRole("button", { name: "Show password" }))
  expect(screen.getByLabelText("Password")).toHaveAttribute("type", "text")
  submit("Password")
  await screen.findByText("Invalid credentials")
  expect(screen.getByLabelText("Password")).toHaveAttribute("aria-describedby", "error-password")
  expect(screen.getByLabelText("Password")).toHaveValue(password)
  expect(screen.getByLabelText("Password")).not.toBeDisabled()
})

test("a normal login safely rejects an external redirect", async () => {
  jest.spyOn(http, "post").mockResolvedValue({ ok: true, data: { next: "signed_in" } })
  render(<SignInControl redirectTo="//untrusted.example" />)
  fill("Username", "member")
  fill("Password", password)
  submit("Password")
  await waitFor(() => expect(go).toHaveBeenCalledWith("/"))
})

test("required password change checks confirmation locally and accepts 8 Unicode code points without trimming", async () => {
  const post = jest.spyOn(http, "post").mockResolvedValue({ ok: true, data: undefined })
  render(<PasswordChangeForm required />)
  const unicode = " 密码🔑Ab1 "
  fill("New password", unicode)
  fill("Confirm new password", "different")
  submit("New password")
  expect(await screen.findByText("The passwords do not match.")).toBeInTheDocument()
  expect(post).not.toHaveBeenCalled()
  fill("Confirm new password", unicode)
  submit("New password")
  await waitFor(() => expect(go).toHaveBeenCalledWith("/signin?passwordChanged=1"))
  expect(post).toHaveBeenCalledWith("/_api/auth/password/complete", { newPassword: unicode, confirmPassword: unicode })
  expect(screen.getByLabelText("New password")).toHaveValue("")
})

test.each([true, false])("password changes reject fewer than 8 or more than 12 Unicode characters (required=%s)", async (required) => {
  const post = jest.spyOn(http, "post").mockResolvedValue({ ok: true, data: undefined })
  render(<PasswordChangeForm required={required} />)
  if (!required) fill("Current password", legacyPassword)
  for (const invalidPassword of ["Ab1!密码🔑", "Ab1!密码🔑abcdef"]) {
    fill("New password", invalidPassword)
    fill("Confirm new password", invalidPassword)
    submit("New password")
    expect(await screen.findByRole("alert")).toHaveTextContent("Use 8–12 characters.")
    expect(post).not.toHaveBeenCalled()
    expect(screen.getByLabelText("New password")).toHaveValue(invalidPassword)
  }
})

test("personal password change sends the current password and retains the form on a server rejection", async () => {
  const change = jest
    .spyOn(http, "post")
    .mockResolvedValue({ ok: false, data: undefined, error: { errors: [{ field: "currentPassword", message: "Wrong current password" }] } })
  render(<PasswordChangeForm username="existing.user" />)
  fill("Current password", "current test password")
  fill("New password", password)
  fill("Confirm new password", password)
  submit("New password")
  await screen.findByText("Wrong current password")
  expect(change).toHaveBeenCalledWith("/_api/auth/password/change", {
    currentPassword: "current test password",
    newPassword: password,
    confirmPassword: password,
  })
  expect(go).not.toHaveBeenCalled()
  expect(screen.getByLabelText("New password")).toHaveValue(password)
})

test("initializing an old member targets the original ID, never creates a duplicate, and clears the temporary password", async () => {
  const post = jest.spyOn(http, "post").mockResolvedValue({ ok: true, data: undefined })
  const saved = jest.fn()
  const view = render(<AccountModal operation="initialize" user={member} onClose={jest.fn()} onSaved={saved} />)
  fill("Username", "  Old.Member ")
  fill("Temporary password (optional)", password)
  submit("Temporary password (optional)")
  await waitFor(() => expect(saved).toHaveBeenCalled())
  expect(post).toHaveBeenCalledWith("/_api/admin/accounts/42/initialize", { username: "old.member", password })
  expect(post).toHaveBeenCalledTimes(1)
  expect(screen.getByLabelText("Temporary password (optional)")).toHaveValue("")
  view.unmount()
  render(<AccountModal operation="initialize" user={member} onClose={jest.fn()} onSaved={saved} />)
  expect(screen.getByLabelText("Temporary password (optional)")).toHaveValue("")
})

test("restoring a member accepts a supplied temporary password and sends it in the DELETE body", async () => {
  const restore = jest.spyOn(http, "delete").mockResolvedValue({ ok: true, data: undefined })
  const saved = jest.fn()
  render(<AccountModal operation="restore" user={{ ...member, status: UserStatus.Blocked, passwordInitialized: true }} onClose={jest.fn()} onSaved={saved} />)
  fill("Temporary password (optional)", password)
  submit("Temporary password (optional)")
  await waitFor(() => expect(saved).toHaveBeenCalled())
  expect(restore).toHaveBeenCalledWith("/_api/admin/users/42/block", { password })
})

test("members without email cannot enable email notifications but can change in-app notifications", () => {
  const changed = jest.fn()
  render(<NotificationSettings hasEmail={false} userSettings={{ event_notification_new_post: "3" }} settingsChanged={changed} />)
  screen.getAllByRole("switch", { name: "Email" }).forEach((control) => {
    expect(control).toBeDisabled()
    expect(control).toHaveAttribute("aria-checked", "false")
    fireEvent.click(control)
  })
  expect(changed).not.toHaveBeenCalled()
  fireEvent.click(screen.getAllByRole("switch", { name: "Web" })[0])
  expect(changed).toHaveBeenCalledWith({ event_notification_new_post: "2" })
})

test("administrators cannot manage their own credentials and collaborators cannot open account actions", () => {
  Fider.initialize({
    settings: { oauth: [] },
    tenant: { allowedSchemes: "", name: "Test" },
    user: { id: 42, name: "Current admin", role: UserRole.Administrator, isAdministrator: true, isCollaborator: true },
  })
  const view = render(<ManageMembersPage users={[member, { ...member, id: 43, name: "Other member" }]} totalPages={1} totalCount={2} />)
  expect(screen.getAllByRole("button", { name: "Change role" })).toHaveLength(1)
  expect(screen.getByRole("button", { name: "Create account" })).toBeInTheDocument()
  view.unmount()
  Fider.initialize({
    settings: { oauth: [] },
    tenant: { allowedSchemes: "", name: "Test" },
    user: { id: 10, name: "Collaborator", role: UserRole.Collaborator, isAdministrator: false, isCollaborator: true },
  })
  render(<ManageMembersPage users={[member]} totalPages={1} totalCount={1} />)
  expect(screen.queryByRole("button", { name: "Change role" })).not.toBeInTheDocument()
  expect(screen.queryByRole("button", { name: "Create account" })).not.toBeInTheDocument()
})
