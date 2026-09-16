import { analytics, notify, Fider } from "@fider/services"
import { i18n } from "@lingui/core"

export interface ErrorItem {
  field?: string
  message: string
}

export interface Failure {
  errors?: ErrorItem[]
}

export interface Result<T = void> {
  ok: boolean
  data: T
  error?: Failure
}

async function toResult<T>(response: Response): Promise<Result<T>> {
  const body = await response.json()

  if (response.status === 401 || response.status === 403) {
    window.dispatchEvent(new CustomEvent("fider:access-denied", { detail: { status: response.status } }))
  }

  if (response.status < 400) {
    return {
      ok: true,
      data: body as T,
    }
  }

  const hasServerErrors = Array.isArray(body.errors) && body.errors.length > 0
  if (response.status === 500 && !hasServerErrors) {
    notify.error(i18n._({ id: "http.error.unexpected", message: "An unexpected error occurred while processing your request." }))
  } else if (response.status === 401) {
    // An authenticated session may have expired or been revoked. Re-authenticate
    // before continuing; anonymous sign-in failures remain in their form.
    if (Fider.session.isAuthenticated) {
      const redirect = encodeURIComponent(window.location.pathname + window.location.search)
      window.location.href = `/signin?redirect=${redirect}`
      // Return a never-resolving promise so no further code runs while navigating.
      // eslint-disable-next-line @typescript-eslint/no-empty-function
      return new Promise<Result<T>>(() => {})
    }
    if (!hasServerErrors) notify.error(i18n._({ id: "http.error.signin", message: "Sign in to continue." }))
  } else if (response.status === 403 && !hasServerErrors) {
    notify.error(i18n._({ id: "http.error.forbidden", message: "You do not have permission to perform this operation." }))
  }

  return {
    ok: false,
    data: body as T,
    error: {
      errors: body.errors,
    },
  }
}
async function request<T>(url: string, method: "GET" | "POST" | "PUT" | "DELETE", body?: any): Promise<Result<T>> {
  const headers: [string, string][] = [
    ["Accept", "application/json"],
    ["Content-Type", "application/json"],
  ]
  try {
    const response = await fetch(url, {
      method,
      headers,
      body: JSON.stringify(body),
      credentials: "same-origin",
    })
    return await toResult<T>(response)
  } catch (err) {
    // Request bodies may contain passwords. Errors reach the client error reporter.
    throw new Error(`Failed to ${method} ${url}`)
  }
}

export const http = {
  get: async <T = void>(url: string): Promise<Result<T>> => {
    return await request<T>(url, "GET")
  },
  post: async <T = void>(url: string, body?: any): Promise<Result<T>> => {
    return await request<T>(url, "POST", body)
  },
  put: async <T = void>(url: string, body?: any): Promise<Result<T>> => {
    return await request<T>(url, "PUT", body)
  },
  delete: async <T = void>(url: string, body?: any): Promise<Result<T>> => {
    return await request<T>(url, "DELETE", body)
  },
  event:
    (category: string, action: string) =>
    <T>(result: Result<T>): Result<T> => {
      if (result && result.ok) {
        analytics.event(category, action)
      }
      return result
    },
}
