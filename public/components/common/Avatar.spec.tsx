import React from "react"
import { fireEvent, render, screen } from "@testing-library/react"
import { Avatar } from "./Avatar"

test("default avatars use the first Unicode character and update with the nickname", () => {
  const { rerender } = render(<Avatar user={{ name: " 验收人员", avatarURL: "/static/avatars/letter/1/name" }} />)
  expect(screen.getByRole("img", { name: "验收人员" })).toHaveTextContent("验")
  rerender(<Avatar user={{ name: "😀测试", avatarURL: "/static/avatars/letter/1/name" }} />)
  expect(screen.getByRole("img", { name: "😀测试" })).toHaveTextContent("😀")
})

test("a failed custom image falls back to the initial and a new URL can load", () => {
  const { rerender } = render(<Avatar user={{ name: "测试", avatarURL: "/images/a?v=1" }} />)
  expect(screen.getByRole("img")).toHaveAttribute("src", "/images/a?v=1&size=50")
  fireEvent.error(screen.getByRole("img"))
  expect(screen.getByRole("img")).toHaveTextContent("测")
  rerender(<Avatar user={{ name: "测试", avatarURL: "/images/b" }} />)
  expect(screen.getByRole("img")).toHaveAttribute("src", "/images/b?size=50")
})
