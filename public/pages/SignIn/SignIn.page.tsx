import "./SignIn.page.scss"
import React, { useEffect, useState } from "react"
import { SignInControl, TenantLogo, LegalNotice, Message, ThemeSwitcher } from "@fider/components"
import { Trans } from "@lingui/react/macro"

export const SignInPage = () => {
  const [redirect, setRedirect] = useState("/")
  const [passwordChanged, setPasswordChanged] = useState(false)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    setRedirect(params.get("redirect") || "/")
    setPasswordChanged(params.get("passwordChanged") === "1")
  }, [])
  return (
    <div id="p-signin" className="page container c-password-page">
      <section className="c-password-page__panel">
        <div className="c-password-page__theme">
          <ThemeSwitcher />
        </div>
        <div className="text-center mb-4">
          <TenantLogo size={50} />
        </div>
        <h1 className="text-title text-center">
          <Trans id="auth.signin.brand">Jintang Requirements Workspace</Trans>
        </h1>
        <p className="text-muted text-center mb-4">
          <Trans id="auth.signin.internal">Sign in with your company account to continue.</Trans>
        </p>
        {passwordChanged && (
          <Message type="success">
            <Trans id="auth.password.changed">Your password has been updated. Sign in again with your new password.</Trans>
          </Message>
        )}
        <SignInControl redirectTo={redirect} />
        <LegalNotice />
      </section>
    </div>
  )
}
export default SignInPage
