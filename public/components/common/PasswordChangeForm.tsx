import React, { useRef, useState } from "react"
import { Button, Form, Input } from "@fider/components"
import { PasswordInput } from "./form/PasswordInput"
import { actions, Failure } from "@fider/services"
import { authenticationFailure, validatePassword, validatePasswordConfirmation } from "@fider/services/password-auth"
import { i18n } from "@lingui/core"
import { Trans } from "@lingui/react/macro"

export const PasswordChangeForm = (props: { required?: boolean; disabled?: boolean; username?: string; onSubmittingChange?: (busy: boolean) => void }) => {
  const [currentPassword, setCurrentPassword] = useState("")
  const [newPassword, setNewPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [error, setError] = useState<Failure>()
  const [busy, setBusy] = useState(false)
  const pending = useRef(false)

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (pending.current || props.disabled) return
    const errors = [...validatePassword(newPassword, "newPassword"), ...validatePasswordConfirmation(newPassword, confirmPassword)]
    if (!props.required && !currentPassword)
      errors.push({ field: "currentPassword", message: i18n._({ id: "auth.password.current.required", message: "Enter your current password." }) })
    if (errors.length) {
      setError({ errors })
      return
    }
    pending.current = true
    setBusy(true)
    props.onSubmittingChange?.(true)
    setError(undefined)
    try {
      const result = props.required
        ? await actions.completePasswordChange(newPassword, confirmPassword)
        : await actions.changePassword(currentPassword, newPassword, confirmPassword)
      if (result.ok) {
        setCurrentPassword("")
        setNewPassword("")
        setConfirmPassword("")
        window.location.assign("/signin?passwordChanged=1")
      } else setError(result.error || authenticationFailure())
    } catch {
      setError(authenticationFailure())
    } finally {
      pending.current = false
      setBusy(false)
      props.onSubmittingChange?.(false)
    }
  }

  return (
    <Form error={error} autoComplete="on" onSubmit={submit}>
      {props.username && (
        <Input field="passwordUsername" label={i18n._({ id: "auth.username", message: "Username" })} value={props.username} autoComplete="username" readOnly />
      )}
      {!props.required && (
        <PasswordInput
          field="currentPassword"
          label={i18n._({ id: "auth.password.current", message: "Current password" })}
          value={currentPassword}
          onChange={setCurrentPassword}
          autoComplete="current-password"
          disabled={busy || props.disabled}
        />
      )}
      <PasswordInput
        field="newPassword"
        label={i18n._({ id: "auth.password.new", message: "New password" })}
        value={newPassword}
        onChange={setNewPassword}
        autoComplete="new-password"
        disabled={busy || props.disabled}
      >
        <p className="text-muted mt-1">
          <Trans id="auth.password.policy">Use 8–12 characters. Spaces and Chinese characters are allowed.</Trans>
        </p>
      </PasswordInput>
      <PasswordInput
        field="confirmPassword"
        label={i18n._({ id: "auth.password.confirm", message: "Confirm new password" })}
        value={confirmPassword}
        onChange={setConfirmPassword}
        autoComplete="new-password"
        disabled={busy || props.disabled}
      />
      <p className="text-muted mb-3">
        <Trans id="auth.password.relogin">Changing your password signs you out on all devices. Sign in again with your new password.</Trans>
      </p>
      <Button type="submit" variant="primary" disabled={busy || props.disabled}>
        <Trans id="auth.password.save">Save new password</Trans>
      </Button>
    </Form>
  )
}
