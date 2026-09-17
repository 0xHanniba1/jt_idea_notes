import React from "react"
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { i18n } from "@lingui/core"
import { Fider, http } from "@fider/services"
import ChangePasswordRequiredPage from "./ChangePasswordRequired.page"

jest.mock("@lingui/react", () => ({
  Trans: ({ children, message, id }: { children?: React.ReactNode; message?: string; id?: string }) => <>{children || message || id}</>,
}))

const originalLocation = window.location
const go = jest.fn()

beforeEach(() => {
  i18n.load("en", {})
  i18n.activate("en")
  Fider.initialize({ settings: { oauth: [] }, tenant: { name: "Test", logo: null }, user: undefined })
  Object.defineProperty(window, "location", { configurable: true, value: { ...originalLocation, assign: go } })
  go.mockClear()
})

afterEach(() => {
  cleanup()
  jest.restoreAllMocks()
  Object.defineProperty(window, "location", { configurable: true, value: originalLocation })
})

test("signing out from the password form does not submit empty passwords and blocks password changes while pending", async () => {
  let complete!: (value: any) => void
  const post = jest.spyOn(http, "post").mockImplementation(
    () =>
      new Promise((resolve) => {
        complete = resolve
      })
  )
  render(<ChangePasswordRequiredPage />)
  fireEvent.click(screen.getByRole("button", { name: "Sign out" }))
  expect(post).toHaveBeenCalledTimes(1)
  expect(post).toHaveBeenCalledWith("/_api/auth/signout", {})
  expect(screen.queryByRole("alert")).not.toBeInTheDocument()
  expect(screen.getByRole("button", { name: "Save new password" })).toBeDisabled()
  expect(screen.getByLabelText("New password")).toBeDisabled()
  await act(async () => complete({ ok: true }))
  expect(go).toHaveBeenCalledWith("/signin")
})

test("a rejected password change re-enables both actions without signing the user out", async () => {
  const post = jest
    .spyOn(http, "post")
    .mockResolvedValue({ ok: false, data: undefined, error: { errors: [{ field: "newPassword", message: "Please try again." }] } })
  render(<ChangePasswordRequiredPage />)
  fireEvent.change(screen.getByLabelText("New password"), { target: { value: "newpass123" } })
  fireEvent.change(screen.getByLabelText("Confirm new password"), { target: { value: "newpass123" } })
  fireEvent.click(screen.getByRole("button", { name: "Save new password" }))
  await screen.findByText("Please try again.")
  await waitFor(() => expect(screen.getByRole("button", { name: "Sign out" })).not.toBeDisabled())
  expect(screen.getByRole("button", { name: "Save new password" })).not.toBeDisabled()
  expect(post).toHaveBeenCalledTimes(1)
  expect(go).not.toHaveBeenCalled()
})
