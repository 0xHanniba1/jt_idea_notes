import "./SignInControl.scss"

import React, { useRef, useState } from "react"
import { Form, Button, Input, Message } from "@fider/components"
import { actions, Failure, isCookieEnabled } from "@fider/services"
import { PasswordInput } from "./form/PasswordInput"
import { authenticationFailure, safeSignInRedirect } from "@fider/services/password-auth"
import { Trans } from "@lingui/react/macro"
import { i18n } from "@lingui/core"

interface SignInControlProps {
  redirectTo?: string
  onSubmit?: () => void
  onSignedIn?: () => Promise<void> | void
  onSubmittingChange?: (submitting: boolean) => void
}

export const SignInControl = (props: SignInControlProps) => {
  const [username, setUsername] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState<Failure>()
  const [submitting, setSubmitting] = useState(false)
  const pending = useRef(false)

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (pending.current) return
    if (!username.trim() || !password) {
      setError({ errors: [{ message: i18n._({ id: "auth.signin.required", message: "Enter your username and password." }) }] })
      return
    }
    pending.current = true
    setSubmitting(true)
    props.onSubmittingChange?.(true)
    setError(undefined)
    try {
      props.onSubmit?.()
      const result = await actions.passwordSignIn(username, password)
      if (!result.ok) {
        setError(result.error || authenticationFailure())
        return
      }
      setPassword("")
      if (result.data.next === "password_change_required") {
        window.location.assign("/password/change-required")
      } else if (result.data.next === "signed_in") {
        if (props.onSignedIn) await props.onSignedIn()
        else window.location.assign(safeSignInRedirect(props.redirectTo))
      } else {
        setError(authenticationFailure())
      }
    } catch {
      setError(authenticationFailure())
    } finally {
      pending.current = false
      setSubmitting(false)
      props.onSubmittingChange?.(false)
    }
  }

  if (!isCookieEnabled()) {
    return (
      <Message type="error">
        <Trans id="auth.cookies.required">Enable browser cookies to sign in.</Trans>
      </Message>
    )
  }

  return (
    <div className="c-signin-control">
      <Form error={error} autoComplete="on" onSubmit={submit}>
        <Input
          field="username"
          label={i18n._({ id: "auth.username", message: "Username" })}
          value={username}
          onChange={setUsername}
          autoComplete="username"
          disabled={submitting}
        />
        <PasswordInput
          field="password"
          label={i18n._({ id: "auth.password", message: "Password" })}
          value={password}
          onChange={setPassword}
          autoComplete="current-password"
          disabled={submitting}
        />
        <Button className="w-full justify-center" type="submit" variant="primary" disabled={submitting}>
          {submitting ? <Trans id="auth.signin.pending">Signing in…</Trans> : <Trans id="action.signin">Sign in</Trans>}
        </Button>
      </Form>
      <p className="text-muted mt-3">
        <Trans id="auth.signin.help">Accounts are created by an administrator. Contact your administrator if you forget your password.</Trans>
      </p>
    </div>
  )
}
