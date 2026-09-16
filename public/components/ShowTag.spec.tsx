import React from "react"
import { fireEvent, render, screen } from "@testing-library/react"
import { ShowTag } from "./ShowTag"

const tag = { id: 1, slug: "bug", name: "Bug", color: "ff0000", isPublic: true }

test("a read-only tag preserves its record link and does not cancel activation", () => {
  const open = jest.fn((event) => event.defaultPrevented)
  render(
    <a href="/posts/1/idea" onClick={open}>
      <span>Idea</span>
      <ShowTag tag={tag} />
    </a>
  )
  expect(screen.getAllByRole("link")).toHaveLength(1)
  fireEvent.click(screen.getByText("Bug"))
  expect(open).toHaveBeenCalled()
  expect(open.mock.results[0].value).toBe(false)
})

test("explicitly linked tags retain filter navigation", () => {
  render(<ShowTag tag={tag} link />)
  expect(screen.getByRole("link", { name: "Bug" })).toHaveAttribute("href", "/?tags=bug")
})
