import React from "react"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { i18n } from "@lingui/core"
import { Fider, http } from "@fider/services"
import { UserRole } from "@fider/models"
import MySettingsPage from "./MySettings.page"
import { normalizeNotificationSettings } from "./components/NotificationSettings"

jest.mock("@fider/components/Header", () => ({
  Header: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))
jest.mock("@lingui/react", () => ({
  Trans: ({ children, message, id }: { children?: React.ReactNode; message?: string; id?: string }) => <>{children || message || id}</>,
}))

beforeEach(() => {
  i18n.load("en", {})
  i18n.activate("en")
  Fider.initialize({
    settings: {},
    tenant: { name: "Ideas", allowedSchemes: "" },
    user: { id: 1, name: "Existing nickname", username: "fixed.user", avatarType: "gravatar", role: UserRole.Visitor },
  })
})
afterEach(() => {
  cleanup()
  jest.restoreAllMocks()
})

test("profile settings retire email and remote email avatars while preserving unrelated account controls", () => {
  render(<MySettingsPage userSettings={{ event_notification_new_post: "3" }} />)
  expect(screen.queryByLabelText("Email")).not.toBeInTheDocument()
  expect(screen.queryByRole("option", { name: "Gravatar" })).not.toBeInTheDocument()
  expect(screen.queryByRole("button", { name: "Delete My Account" })).not.toBeInTheDocument()
  expect(screen.queryByText("Delete account")).not.toBeInTheDocument()
  expect(screen.queryByRole("combobox")).not.toBeInTheDocument()
  expect(screen.getByRole("button", { name: "Upload avatar" })).toBeInTheDocument()
  expect(screen.getByRole("region", { name: "Personal profile" })).toBeInTheDocument()
  expect(screen.getByRole("region", { name: "Login password" })).toBeInTheDocument()
  expect(screen.getByRole("region", { name: "In-app notifications" })).toBeInTheDocument()
  screen.getAllByLabelText("Username").forEach((input) => expect(input).toHaveAttribute("readonly"))
  expect(screen.getByLabelText("Nickname")).toHaveValue("Existing nickname")
  expect(screen.getByLabelText("Current password")).toBeInTheDocument()
  expect(screen.getByLabelText("New password")).toBeInTheDocument()
  expect(screen.getAllByRole("switch")).toHaveLength(4)
})

test("saving a nickname does not submit unrelated notification or avatar drafts", async () => {
  const post = jest.spyOn(http, "post").mockResolvedValue({ ok: false, data: undefined, error: { errors: [{ field: "name", message: "Please try again." }] } })
  render(<MySettingsPage userSettings={{ event_notification_new_post: "3", event_notification_new_comment: "2", other_setting: "unchanged" }} />)
  fireEvent.change(screen.getByLabelText("Nickname"), { target: { value: "New nickname" } })
  fireEvent.click(screen.getByRole("button", { name: "Save profile" }))
  await waitFor(() => expect(post).toHaveBeenCalledWith("/_api/user/profile", { name: "New nickname" }))
  expect(await screen.findByText("Please try again.")).toBeInTheDocument()
})

test("notification normalization preserves the in-app bit and unrelated preferences without mutating input", () => {
  const original = {
    event_notification_new_post: "3",
    event_notification_new_comment: "2",
    event_notification_mention: "1",
    event_notification_change_status: "0",
    other_setting: "unchanged",
  }
  expect(normalizeNotificationSettings(original)).toEqual({ ...original, event_notification_new_post: "1", event_notification_new_comment: "0" })
  expect(original.event_notification_new_post).toBe("3")
})

test("notifications save independently without submitting or clearing an edited nickname", async () => {
  const post = jest.spyOn(http, "post").mockResolvedValue({ ok: true, data: {} })
  render(<MySettingsPage userSettings={{ event_notification_new_post: "3", event_notification_new_comment: "2" }} />)
  fireEvent.change(screen.getByLabelText("Nickname"), { target: { value: "Unsaved nickname" } })
  fireEvent.click(screen.getByRole("switch", { name: "New Post" }))
  fireEvent.click(screen.getByRole("button", { name: "Save notifications" }))
  await waitFor(() =>
    expect(post).toHaveBeenCalledWith("/_api/user/notifications", { settings: { event_notification_new_post: "0", event_notification_new_comment: "0" } })
  )
  expect(screen.getByLabelText("Nickname")).toHaveValue("Unsaved nickname")
  expect(await screen.findByText("Notification preferences saved.")).toBeInTheDocument()
})
