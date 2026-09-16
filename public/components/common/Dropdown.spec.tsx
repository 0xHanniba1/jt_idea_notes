import React from "react"
import { fireEvent, render, screen } from "@testing-library/react"
import { Dropdown } from "./Dropdown"
import { Modal } from "./Modal"

const renderMenu = () =>
  render(
    <>
      <Dropdown ariaLabel="Sort" renderHandle={<span>Sort</span>}>
        <Dropdown.ListItem checked={false}>Recent</Dropdown.ListItem>
        <Dropdown.ListItem disabled>Unavailable</Dropdown.ListItem>
        <Dropdown.ListItem checked>Comments</Dropdown.ListItem>
      </Dropdown>
      <button>Outside</button>
    </>
  )

describe("Dropdown keyboard navigation", () => {
  test("opens with arrows, skips disabled items, loops, and returns focus on Escape", () => {
    renderMenu()
    const trigger = screen.getByRole("button", { name: "Sort" })
    trigger.focus()
    fireEvent.keyDown(trigger, { key: "ArrowDown" })
    const first = screen.getByRole("menuitemradio", { name: "Recent" })
    const last = screen.getByRole("menuitemradio", { name: "Comments" })
    expect(first).toHaveFocus()
    fireEvent.keyDown(first, { key: "ArrowDown" })
    expect(last).toHaveFocus()
    expect(last).toHaveAttribute("aria-checked", "true")
    fireEvent.keyDown(last, { key: "ArrowDown" })
    expect(first).toHaveFocus()
    fireEvent.keyDown(first, { key: "End" })
    expect(last).toHaveFocus()
    fireEvent.keyDown(last, { key: "Escape" })
    expect(screen.queryByRole("menu")).not.toBeInTheDocument()
    expect(trigger).toHaveFocus()
  })

  test("does not consume composing Escape and closes when focus leaves", () => {
    renderMenu()
    const trigger = screen.getByRole("button", { name: "Sort" })
    fireEvent.keyDown(trigger, { key: "ArrowUp" })
    const last = screen.getByRole("menuitemradio", { name: "Comments" })
    expect(last).toHaveFocus()
    fireEvent.keyDown(last, { key: "Escape", isComposing: true })
    expect(screen.getByRole("menu")).toBeInTheDocument()
    fireEvent.focusIn(screen.getByRole("button", { name: "Outside" }))
    expect(screen.queryByRole("menu")).not.toBeInTheDocument()
  })

  test("Escape closes only the menu before a surrounding dialog", () => {
    const outerEscape = jest.fn()
    render(
      <div onKeyDown={outerEscape}>
        <Dropdown renderHandle={<span>Open</span>}>
          <Dropdown.ListItem>Item</Dropdown.ListItem>
        </Dropdown>
      </div>
    )
    fireEvent.click(screen.getByRole("button", { name: "Open" }))
    fireEvent.keyDown(screen.getByRole("menu"), { key: "Escape" })
    expect(outerEscape).not.toHaveBeenCalled()
    expect(screen.queryByRole("menu")).not.toBeInTheDocument()
  })
})

test("Tab from a menu inside a modal leaves from the trigger instead of wrapping to the first field", () => {
  document.body.insertAdjacentHTML("beforeend", '<div id="root-modal"></div>')
  const view = render(
    <Modal.Window isOpen onClose={jest.fn()} ariaLabel="Edit">
      <input aria-label="First field" />
      <Dropdown renderHandle={<span>Actions</span>}>
        <Dropdown.ListItem>Copy link</Dropdown.ListItem>
      </Dropdown>
      <button>After menu</button>
    </Modal.Window>
  )
  const trigger = screen.getByRole("button", { name: "Actions" })
  fireEvent.click(trigger)
  const option = screen.getByRole("menuitem", { name: "Copy link" })
  expect(option).toHaveFocus()
  // jsdom does not perform the browser's native Tab movement. It does expose
  // whether the dialog swallowed the key and where the native step starts.
  expect(fireEvent.keyDown(option, { key: "Tab" })).toBe(true)
  expect(trigger).toHaveFocus()
  expect(screen.queryByRole("menu")).not.toBeInTheDocument()
  fireEvent.click(trigger)
  expect(fireEvent.keyDown(screen.getByRole("menuitem"), { key: "Tab", shiftKey: true })).toBe(true)
  expect(trigger).toHaveFocus()
  view.unmount()
  document.getElementById("root-modal")?.remove()
})
