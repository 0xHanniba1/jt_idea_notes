import React from "react"
import { act, fireEvent, render, screen } from "@testing-library/react"
import { TagsSelect } from "./TagsSelect"
import { FiderContext } from "@fider/services"
import { fiderMock } from "@fider/services/testing"
import { Tag } from "@fider/models"

const tags: Tag[] = [
  { id: 1, slug: "bug", name: "Bug", color: "ff0000", isPublic: true },
  { id: 2, slug: "idea", name: "Idea", color: "00ff00", isPublic: true },
]

test("tag combobox selects with the keyboard and keeps outer Escape untouched", async () => {
  const changed = jest.fn()
  const outside = jest.fn()
  render(
    <FiderContext.Provider value={fiderMock.notAuthenticated()}>
      <div onKeyDown={outside}>
        <TagsSelect tags={tags} selected={[]} selectionChanged={changed} canEdit alwaysEditing />
      </div>
    </FiderContext.Provider>
  )
  await act(async () => {
    fireEvent.click(screen.getByRole("button"))
  })
  const input = screen.getByRole("combobox")
  expect(input).toHaveFocus()
  fireEvent.keyDown(input, { key: "End" })
  fireEvent.keyDown(input, { key: "Enter" })
  expect(changed).toHaveBeenCalledWith([tags[1]])
  outside.mockClear()
  fireEvent.keyDown(input, { key: "Escape", isComposing: true })
  expect(screen.getByRole("combobox")).toBeInTheDocument()
  outside.mockClear()
  fireEvent.keyDown(input, { key: "Escape" })
  expect(screen.queryByRole("combobox")).not.toBeInTheDocument()
  expect(outside).not.toHaveBeenCalled()
})
