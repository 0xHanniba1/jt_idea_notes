import { safeSignInRedirect, validatePassword, validateUsername } from "./password-auth"
import { http } from "./http"
import { i18n } from "@lingui/core"

beforeEach(() => {
  i18n.load("en", {})
  i18n.activate("en")
})

test.each([
  "https://example.com",
  "//example.com",
  "/\\example.com",
  "/%2fexample.com",
  "/%5cexample.com",
  "/signin/verify?token=x",
  "/signup",
  "/oauth/github",
  "/password/change-required",
  "/api/v1/users",
  "/_api/auth/signout",
  "/a/../signin",
])("rejects unsafe or retired redirect %s", (value) => {
  expect(safeSignInRedirect(value)).toBe("/")
})
test("preserves a local business URL with filters and an anchor", () => {
  expect(safeSignInRedirect("/posts/3/idea?tag=bug#comment-5")).toBe("/posts/3/idea?tag=bug#comment-5")
})
test("password lengths count Unicode code points and do not silently trim or truncate", () => {
  expect(validatePassword("🔑".repeat(15))).toEqual([])
  expect(validatePassword("🔑".repeat(14))).toHaveLength(1)
  expect(validatePassword("🔑".repeat(128))).toEqual([])
  expect(validatePassword("a".repeat(129))).toHaveLength(1)
  expect(validatePassword(" " + "a".repeat(13) + " ")).toEqual([])
})
test("username policy normalizes case and whitespace, while rejecting invalid characters", () => {
  expect(validateUsername("  Employee.001 ")).toEqual([])
  expect(validateUsername("_employee")).toHaveLength(1)
  expect(validateUsername("员工001")).toHaveLength(1)
})
test("network errors never include credentials from a request body", async () => {
  const original = global.fetch
  global.fetch = jest.fn().mockRejectedValue(new Error("Connection failed"))
  try {
    await expect(http.post("/_api/auth/password/signin", { username: "employee", password: "super secret password" })).rejects.toThrow(
      "Failed to POST /_api/auth/password/signin"
    )
    await http.post("/_api/admin/accounts", { password: "super secret password" }).catch((error) => expect(error.message).not.toContain("super secret"))
  } finally {
    global.fetch = original
  }
})
