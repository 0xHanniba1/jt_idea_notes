import { i18n } from "@lingui/core"
import { ErrorItem, Failure } from "./http"

export const authenticationFailure = (): Failure => ({
  errors: [{ message: i18n._({ id: "auth.request.failed", message: "Unable to complete this request. Please try again." }) }],
})

export const validateUsername = (value: string): ErrorItem[] =>
  /^[a-z0-9][a-z0-9._-]{2,31}$/.test(value.trim().toLowerCase())
    ? []
    : [
        {
          field: "username",
          message: i18n._({
            id: "auth.username.invalid",
            message: "Use 3–32 letters, numbers, dots, underscores or hyphens, starting with a letter or number.",
          }),
        },
      ]

export const validatePassword = (password: string, field = "password"): ErrorItem[] => {
  const characters = Array.from(password)
  return characters.length >= 8 && characters.length <= 12
    ? []
    : [
        {
          field,
          message: i18n._({ id: "auth.password.policy", message: "Use 8–12 characters. Spaces and Chinese characters are allowed." }),
        },
      ]
}

export const validatePasswordConfirmation = (password: string, confirmation: string): ErrorItem[] =>
  password === confirmation ? [] : [{ field: "confirmPassword", message: i18n._({ id: "auth.password.mismatch", message: "The passwords do not match." }) }]

const hasUnsafeCharacters = (value: string) => Array.from(value).some((character) => character.charCodeAt(0) < 32 || character === "\\")

// A redirect must be a local business path, never an authentication exchange.
export const safeSignInRedirect = (value?: string | null): string => {
  if (!value || !value.startsWith("/") || value.startsWith("//") || hasUnsafeCharacters(value)) return "/"
  try {
    const parsed = new URL(value, "https://local.invalid")
    const path = decodeURIComponent(parsed.pathname)
    if (parsed.origin !== "https://local.invalid" || path.startsWith("//") || hasUnsafeCharacters(path)) return "/"
    if (/^\/(?:signin|signout|signup|oauth|invite|loginemailsent|password|_api|api)(?:\/|$)/i.test(path)) return "/"
    return parsed.pathname + parsed.search + parsed.hash
  } catch {
    return "/"
  }
}
