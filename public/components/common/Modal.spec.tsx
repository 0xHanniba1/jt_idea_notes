import React from "react"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { Modal } from "./Modal"

beforeEach(() => {
  document.body.innerHTML = '<div id="root"><button id="opener">Open</button></div><div id="root-modal"></div><div id="root-toastify"></div>'
  document.getElementById("opener")?.focus()
})

afterEach(() => {
  cleanup()
  document.body.innerHTML = ""
  document.body.style.overflow = ""
})

test("labels the dialog, contains keyboard focus including editable text, and restores focus and scrolling", () => {
  const onClose = jest.fn()
  document.body.style.overflow = "auto"
  const view = render(
    <Modal.Window isOpen onClose={onClose}>
      <Modal.Header>Edit idea</Modal.Header>
      <input aria-label="Title" />
      <textarea aria-label="Description" />
      <div contentEditable role="textbox" aria-label="Comment" />
    </Modal.Window>
  )
  const dialog = screen.getByRole("dialog", { name: "Edit idea" })
  expect(dialog).toHaveAttribute("aria-modal", "true")
  expect(dialog).not.toHaveAttribute("aria-disabled")
  expect(document.getElementById("root")).toHaveAttribute("inert")
  expect(document.getElementById("root-toastify")).not.toHaveAttribute("inert")
  expect(document.body.style.overflow).toBe("hidden")
  const title = screen.getByLabelText("Title")
  const comment = screen.getByLabelText("Comment")
  expect(title).toHaveFocus()
  fireEvent.keyDown(title, { key: "Tab", shiftKey: true })
  expect(comment).toHaveFocus()
  fireEvent.keyDown(comment, { key: "Tab" })
  expect(title).toHaveFocus()
  view.unmount()
  expect(document.getElementById("root")).not.toHaveAttribute("inert")
  expect(document.body.style.overflow).toBe("auto")
  expect(document.getElementById("opener")).toHaveFocus()
  fireEvent.keyDown(document, { key: "Escape" })
  expect(onClose).not.toHaveBeenCalled()
})

test("only the top dialog handles Escape, and closing it keeps the outer scroll lock", () => {
  const outerClose = jest.fn()
  const innerClose = jest.fn()
  const View = ({ innerOpen }: { innerOpen: boolean }) => (
    <Modal.Window isOpen onClose={outerClose} ariaLabel="Outer">
      <button>Nested trigger</button>
      <Modal.Window isOpen={innerOpen} onClose={innerClose} ariaLabel="Inner">
        <input aria-label="Nested input" />
      </Modal.Window>
    </Modal.Window>
  )
  const view = render(<View innerOpen={false} />)
  view.rerender(<View innerOpen />)
  expect(screen.getByLabelText("Nested input")).toHaveFocus()
  expect(screen.getByRole("dialog", { name: "Outer" })).toHaveAttribute("aria-modal", "false")
  fireEvent.keyDown(screen.getByLabelText("Nested input"), { key: "Escape" })
  expect(innerClose).toHaveBeenCalledTimes(1)
  expect(outerClose).not.toHaveBeenCalled()
  view.rerender(<View innerOpen={false} />)
  expect(document.body.style.overflow).toBe("hidden")
  expect(screen.getByRole("button", { name: "Nested trigger" })).toHaveFocus()
  fireEvent.keyDown(document, { key: "Escape" })
  expect(outerClose).toHaveBeenCalledTimes(1)
})

test("respects submitting protection, input composition and a popup consuming Escape", () => {
  const onClose = jest.fn()
  const View = ({ canClose }: { canClose: boolean }) => (
    <Modal.Window isOpen canClose={canClose} onClose={onClose} ariaLabel="Editor">
      <input aria-label="Text" />
      <button
        onKeyDown={(event) => {
          if (event.key === "Escape") event.preventDefault()
        }}
      >
        Editor popup
      </button>
    </Modal.Window>
  )
  const view = render(<View canClose={false} />)
  fireEvent.keyDown(document, { key: "Escape" })
  fireEvent.click(document.querySelector(".c-modal-dimmer") as HTMLElement)
  expect(onClose).not.toHaveBeenCalled()
  view.rerender(<View canClose />)
  fireEvent.keyDown(screen.getByLabelText("Text"), { key: "Escape", isComposing: true })
  fireEvent.keyDown(screen.getByLabelText("Text"), { key: "Escape", keyCode: 229 })
  fireEvent.keyDown(screen.getByRole("button", { name: "Editor popup" }), { key: "Escape" })
  expect(onClose).not.toHaveBeenCalled()
  fireEvent.keyDown(screen.getByLabelText("Text"), { key: "Escape" })
  expect(onClose).toHaveBeenCalledTimes(1)
})

test("idle ProseMirror Escape closes the modal while a real editor popup consumes the first Escape", () => {
  const close = jest.fn()
  const View = ({ popupOpen }: { popupOpen: boolean }) => (
    <Modal.Window isOpen onClose={close} ariaLabel="Rich text form">
      <div
        className="ProseMirror"
        contentEditable
        role="textbox"
        aria-label="Editor"
        onKeyDown={(event) => {
          // ProseMirror's captureKeyDown prevents even idle Escape.
          event.preventDefault()
          if (popupOpen) event.stopPropagation()
        }}
      />
    </Modal.Window>
  )
  const view = render(<View popupOpen />)
  const editor = screen.getByRole("textbox", { name: "Editor" })
  fireEvent.keyDown(editor, { key: "Escape" })
  expect(close).not.toHaveBeenCalled()
  view.rerender(<View popupOpen={false} />)
  fireEvent.keyDown(editor, { key: "Escape", isComposing: true })
  fireEvent.keyDown(editor, { key: "Escape", keyCode: 229 })
  fireEvent.keyDown(editor, { key: "Enter" })
  expect(close).not.toHaveBeenCalled()
  fireEvent.keyDown(editor, { key: "Escape" })
  expect(close).toHaveBeenCalledTimes(1)
})
