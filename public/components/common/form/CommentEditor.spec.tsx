import React from "react"
import { fireEvent, render, screen } from "@testing-library/react"
import CommentEditor from "./CommentEditor"
import { Fider } from "@fider/services"

beforeEach(() => {
  Fider.initialize({ settings: {}, tenant: { allowedSchemes: "" }, user: undefined })
})

test("changing disabled updates the live rich editor and toolbar without replacing its draft", () => {
  const changed = jest.fn()
  const props = { initialValue: "Keep this draft", placeholder: "Your idea", field: "description", onChange: changed }
  const view = render(<CommentEditor {...props} disabled={false} />)
  const editor = screen.getByRole("textbox", { name: "Your idea" })
  expect(editor).toHaveAttribute("contenteditable", "true")
  expect(screen.getByTitle("Bold")).not.toBeDisabled()
  view.rerender(<CommentEditor {...props} disabled />)
  expect(editor).toHaveAttribute("contenteditable", "false")
  expect(editor).toHaveAttribute("aria-readonly", "true")
  expect(screen.getByTitle("Bold")).toBeDisabled()
  expect(editor).toHaveTextContent("Keep this draft")
  view.rerender(<CommentEditor {...props} disabled={false} />)
  expect(screen.getByRole("textbox", { name: "Your idea" })).toBe(editor)
  expect(editor).toHaveAttribute("contenteditable", "true")
  expect(editor).toHaveTextContent("Keep this draft")
  expect(changed).not.toHaveBeenCalled()
})

test("a disabled unauthenticated comment editor remains focusable so its login callback is reachable", () => {
  const onFocus = jest.fn()
  render(<CommentEditor initialValue="" placeholder="Leave a comment" field="comment" disabled onFocus={onFocus} />)
  const editor = screen.getByRole("textbox", { name: "Leave a comment" })
  expect(editor).toHaveAttribute("contenteditable", "false")
  expect(editor).toHaveAttribute("tabindex", "0")
  fireEvent.focus(editor)
  expect(onFocus).toHaveBeenCalledTimes(1)
})
