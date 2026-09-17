import React from "react"
import { fireEvent, render, screen } from "@testing-library/react"
import { Select } from "./Select"
import { Form } from "./Form"

const options = [
  { value: "", label: "All roles" },
  { value: "visitor", label: "Member" },
  { value: "administrator", label: "Administrator" },
]

test("preserves default selection, label association, and does not submit a form when choosing", () => {
  const onChange = jest.fn()
  const onSubmit = jest.fn()
  render(
    <Form onSubmit={onSubmit}>
      <Select field="role" label="Role" defaultValue="visitor" options={options} onChange={onChange} />
    </Form>
  )
  const trigger = screen.getByLabelText("Role")
  expect(trigger).toHaveTextContent("Member")
  fireEvent.click(trigger)
  expect(screen.getByRole("menuitemradio", { name: "Member" })).toHaveAttribute("aria-checked", "true")
  fireEvent.click(screen.getByRole("menuitemradio", { name: "All roles" }))
  expect(trigger).toHaveTextContent("All roles")
  expect(onChange).toHaveBeenCalledWith(options[0])
  expect(onSubmit).not.toHaveBeenCalled()
  expect(trigger).toHaveFocus()
})

test("uses a controlled value when filters are restored or reset externally", () => {
  const onChange = jest.fn()
  const view = render(<Select field="role" ariaLabel="Filter roles" value="visitor" options={options} onChange={onChange} />)
  const trigger = screen.getByRole("button", { name: "Filter roles" })
  fireEvent.click(trigger)
  fireEvent.click(screen.getByRole("menuitemradio", { name: "Administrator" }))
  expect(onChange).toHaveBeenCalledWith(options[2])
  expect(trigger).toHaveTextContent("Member")
  view.rerender(<Select field="role" ariaLabel="Filter roles" value="administrator" options={options} onChange={onChange} />)
  expect(trigger).toHaveTextContent("Administrator")
})

test("retains validation errors until a new selection and associates the error with the trigger", () => {
  render(
    <Form error={{ errors: [{ field: "role", message: "Choose a role" }] }}>
      <Select field="role" label="Role" defaultValue="visitor" options={options} />
    </Form>
  )
  const trigger = screen.getByLabelText("Role")
  expect(trigger).toHaveAttribute("aria-invalid", "true")
  expect(trigger).toHaveAccessibleDescription("Choose a role")
  fireEvent.click(trigger)
  fireEvent.click(screen.getByRole("menuitemradio", { name: "Administrator" }))
  expect(trigger).not.toHaveAttribute("aria-invalid")
  expect(screen.queryByRole("alert")).not.toBeInTheDocument()
})

test("disabled selects cannot open or change, including keyboard use", () => {
  const onChange = jest.fn()
  render(<Select field="role" label="Role" defaultValue="visitor" options={options} disabled onChange={onChange} />)
  const trigger = screen.getByLabelText("Role")
  expect(trigger).toBeDisabled()
  fireEvent.click(trigger)
  fireEvent.keyDown(trigger, { key: "ArrowDown" })
  expect(screen.queryByRole("menu")).not.toBeInTheDocument()
  expect(onChange).not.toHaveBeenCalled()
})

test("supports arrow navigation, typeahead for long option lists, and Escape without changing selection", () => {
  const onChange = jest.fn()
  render(<Select field="role" label="Role" defaultValue="visitor" options={options} onChange={onChange} />)
  const trigger = screen.getByLabelText("Role")
  fireEvent.keyDown(trigger, { key: "ArrowDown" })
  expect(screen.getByRole("menuitemradio", { name: "All roles" })).toHaveFocus()
  fireEvent.keyDown(screen.getByRole("menuitemradio", { name: "All roles" }), { key: "m" })
  expect(screen.getByRole("menuitemradio", { name: "Member" })).toHaveFocus()
  fireEvent.keyDown(screen.getByRole("menuitemradio", { name: "Member" }), { key: "ArrowDown" })
  expect(screen.getByRole("menuitemradio", { name: "Administrator" })).toHaveFocus()
  fireEvent.keyDown(screen.getByRole("menuitemradio", { name: "Administrator" }), { key: "Escape" })
  expect(screen.queryByRole("menu")).not.toBeInTheDocument()
  expect(trigger).toHaveFocus()
  expect(trigger).toHaveTextContent("Member")
  expect(onChange).not.toHaveBeenCalled()
})

test("refreshes translated labels without resetting an uncontrolled selected value", () => {
  const view = render(<Select field="role" label="Role" defaultValue="visitor" options={options} />)
  const trigger = screen.getByLabelText("Role")
  fireEvent.click(trigger)
  fireEvent.click(screen.getByRole("menuitemradio", { name: "Administrator" }))
  view.rerender(
    <Select field="role" label="Role" defaultValue="visitor" options={options.map((option) => ({ ...option, label: `Translated ${option.label}` }))} />
  )
  expect(trigger).toHaveTextContent("Translated Administrator")
})
