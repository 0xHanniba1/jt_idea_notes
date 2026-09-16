import { http } from "./http"
import { Fider, notify } from "@fider/services"
import { i18n } from "@lingui/core"

const originalFetch = global.fetch
beforeEach(() => {
  Fider.initialize({ settings: {}, user: undefined })
  i18n.load("zh-CN", {
    "http.error.unexpected": "处理请求时发生意外错误，请重试。",
    "http.error.signin": "请先登录后继续。",
    "http.error.forbidden": "你没有执行此操作的权限。",
  })
  i18n.activate("zh-CN")
})
afterEach(() => {
  global.fetch = originalFetch
  jest.restoreAllMocks()
})

test.each([401, 403, 500])("preserves specific %s errors for the form without duplicating a generic toast", async (status) => {
  const toast = jest.spyOn(notify, "error").mockResolvedValue(undefined)
  const errors = [{ message: "账号或密码不正确" }]
  global.fetch = jest.fn().mockResolvedValue({ status, json: async () => ({ errors }) })
  const result = await http.post("/_api/auth/password/signin", { username: "member", password: "incorrect test password" })
  expect(result.ok).toBe(false)
  expect(result.error?.errors).toEqual(errors)
  expect(toast).not.toHaveBeenCalled()
})

test.each([
  [401, "请先登录后继续。"],
  [403, "你没有执行此操作的权限。"],
  [500, "处理请求时发生意外错误，请重试。"],
])("uses a localized fallback for %s when the server has no specific message", async (status, message) => {
  const toast = jest.spyOn(notify, "error").mockResolvedValue(undefined)
  global.fetch = jest.fn().mockResolvedValue({ status, json: async () => ({}) })
  const result = await http.post("/_api/auth/password/signin", {})
  expect(result.ok).toBe(false)
  expect(toast).toHaveBeenCalledWith(message)
})
