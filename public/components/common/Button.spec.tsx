import React from "react"
import { act, fireEvent, render, screen } from "@testing-library/react"
import { Button } from "./Button"

describe("Button submission state", () => {
  test("prevents disabled actions and repeated pending requests", async () => {
    let finish: () => void = () => undefined
    const action = jest.fn(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve
        })
    )
    const { rerender } = render(
      <Button disabled onClick={action}>
        Save
      </Button>
    )
    fireEvent.click(screen.getByRole("button", { name: "Save" }))
    expect(action).not.toHaveBeenCalled()
    rerender(<Button onClick={action}>Save</Button>)
    const button = screen.getByRole("button", { name: "Save" })
    fireEvent.click(button)
    fireEvent.click(button)
    expect(action).toHaveBeenCalledTimes(1)
    expect(button).toBeDisabled()
    expect(button).toHaveAttribute("aria-busy", "true")
    await act(async () => finish())
    expect(button).not.toBeDisabled()
  })
})
