import "./SignIn.page.scss"
import React, { useState } from "react"
import { Button, DisplayError, TenantLogo, ThemeSwitcher } from "@fider/components"
import { PasswordChangeForm } from "@fider/components/common/PasswordChangeForm"
import { actions, Failure } from "@fider/services"
import { authenticationFailure } from "@fider/services/password-auth"
import { Trans } from "@lingui/react/macro"

export default function ChangePasswordRequiredPage() {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<Failure>()
  const signOut = async () => {
    if (busy) return
    setBusy(true)
    try {
      const result = await actions.signOut()
      if (result.ok) window.location.assign("/signin")
      else setError(result.error || authenticationFailure())
    } catch {
      setError(authenticationFailure())
    } finally {
      setBusy(false)
    }
  }
  return (
    <div id="p-change-password-required" className="page container c-password-page">
      <div className="c-password-page__theme">
        <ThemeSwitcher />
      </div>
      <section className="c-password-page__panel">
        <div className="text-center mb-4">
          <TenantLogo size={50} />
        </div>
        <h1 className="text-title">
          <Trans id="auth.password.required.title">Set a new password</Trans>
        </h1>
        <p className="text-muted mb-4">
          <Trans id="auth.password.required.help">You are using a temporary password. Set your own password before entering the site.</Trans>
        </p>
        <PasswordChangeForm required disabled={busy} onSubmittingChange={setBusy} />
        <DisplayError error={error} />
        <div className="mt-3">
          <Button disabled={busy} onClick={signOut}>
            <Trans id="menu.signout">Sign out</Trans>
          </Button>
        </div>
      </section>
    </div>
  )
}
