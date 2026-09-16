import { t } from "@lingui/core/macro"
import { Trans } from "@lingui/react/macro"

import React from "react"

import { Button, OAuthProviderLogo, Icon, Field, Toggle, Form } from "@fider/components"
import { OAuthConfig, OAuthProviderOption } from "@fider/models"
import { OAuthForm } from "../components/OAuthForm"
import { actions, notify, Fider, Failure } from "@fider/services"
import { AdminBasePage } from "../components/AdminBasePage"

import IconPlay from "@fider/assets/images/heroicons-play.svg"
import IconPencilAlt from "@fider/assets/images/heroicons-pencil-alt.svg"

import { HStack, VStack } from "@fider/components/layout"

interface ManageAuthenticationPageProps {
  providers: OAuthProviderOption[]
}

interface ManageAuthenticationPageState {
  isAdding: boolean
  isEmailAuthAllowed: boolean
  canDisableEmailAuth: boolean
  editing?: OAuthConfig
  error?: Failure
}

export default class ManageAuthenticationPage extends AdminBasePage<ManageAuthenticationPageProps, ManageAuthenticationPageState> {
  public id = "p-admin-authentication"
  public name = "authentication"
  public title = t({ id: "admin.authentication.title", message: "Authentication" })
  public subtitle = t({ id: "admin.authentication.subtitle", message: "Manage your site authentication" })

  constructor(props: ManageAuthenticationPageProps) {
    super(props)
    this.state = {
      isAdding: false,
      isEmailAuthAllowed: Fider.session.tenant.isEmailAuthAllowed,
      canDisableEmailAuth: props.providers.map((o) => o.isEnabled).reduce((a, b) => a || b, false),
    }
  }

  private addNew = async () => {
    this.setState({ isAdding: true, editing: undefined })
  }

  private edit = async (provider: string) => {
    const result = await actions.getOAuthConfig(provider)
    if (result.ok) {
      this.setState({ editing: result.data, isAdding: false })
    } else {
      notify.error(t({ id: "admin.authentication.fetchfailed", message: "Failed to retrieve OAuth configuration. Try again later" }))
    }
  }

  private startTest = async (provider: string) => {
    const redirect = `${Fider.settings.baseURL}/oauth/${provider}/echo`
    window.open(`/oauth/${provider}?redirect=${redirect}`, "oauth-test", "width=1100,height=600,status=no,menubar=no")
  }

  private cancel = async () => {
    this.setState({ isAdding: false, editing: undefined })
  }

  private toggleEmailAuth = async (active: boolean) => {
    this.setState(
      () => ({
        isEmailAuthAllowed: active,
      }),
      async () => {
        const response = await actions.updateTenantEmailAuthAllowed(this.state.isEmailAuthAllowed)
        if (response.ok) {
          notify.success(t({ id: "admin.authentication.emailsaved", message: "You successfully changed email authentication setting." }))
        } else {
          this.setState(
            () => ({
              isEmailAuthAllowed: !active,
              error: response.error,
            }),
            () => notify.error(t({ id: "admin.authentication.savefailed", message: "Unable to save this setting." }))
          )
        }
      }
    )
  }

  private toggleSystemProvider = async (provider: OAuthProviderOption, active: boolean) => {
    const response = await actions.setSystemProviderStatus(provider.provider, active)
    if (response.ok) {
      provider.isEnabled = active
      this.forceUpdate()
    }
  }

  public content() {
    let enabledProvidersCount = 0
    for (const o of this.props.providers) {
      if (o.isEnabled) {
        enabledProvidersCount++
      }
    }
    const cantDisable = !this.state.isEmailAuthAllowed && enabledProvidersCount == 1

    if (this.state.isAdding) {
      return <OAuthForm cantDisable={cantDisable} onCancel={this.cancel} />
    }

    if (this.state.editing) {
      return <OAuthForm cantDisable={cantDisable} config={this.state.editing} onCancel={this.cancel} />
    }

    const enabled = (
      <span className="text-green-700">
        <Trans id="admin.authentication.enabled">Enabled</Trans>
      </span>
    )
    const disabled = (
      <span className="text-red-700">
        <Trans id="admin.authentication.disabled">Disabled</Trans>
      </span>
    )

    return (
      <VStack spacing={8}>
        <div>
          <h2 className="text-display">
            <Trans id="admin.authentication.general">General Authentication</Trans>
          </h2>
          <Form error={this.state.error} className="mt-4">
            <Field label={t({ id: "admin.authentication.allowemail", message: "Allow Email Authentication" })} className="mt-2">
              <Toggle
                field="isEmailAuthAllowed"
                label={
                  this.state.isEmailAuthAllowed ? t({ id: "admin.authentication.yes", message: "Yes" }) : t({ id: "admin.authentication.no", message: "No" })
                }
                disabled={!Fider.session.user.isAdministrator || !this.state.canDisableEmailAuth}
                active={this.state.isEmailAuthAllowed}
                onToggle={this.toggleEmailAuth}
              />
              {!this.state.canDisableEmailAuth && (
                <p className="text-muted my-1">
                  <Trans id="admin.authentication.requireprovider">
                    You need to configure another authentication provider before disabling email authentication.
                  </Trans>
                </p>
              )}
              <p className="text-muted my-1">
                <Trans id="admin.authentication.emailhelp">
                  When email-based authentication is disabled, users must use another authentication method, such as an OAuth provider, to sign in.
                </Trans>
              </p>
              <p className="text-muted mt-1">
                <Trans id="admin.authentication.adminemail">Note: Administrator accounts will still be allowed to sign in using their email.</Trans>
              </p>
            </Field>
          </Form>
        </div>
        <div>
          <h2 className="text-display">
            <Trans id="admin.authentication.providers">OAuth Providers</Trans>
          </h2>
          <p>
            <Trans id="admin.authentication.providershelp">
              You can add any authentication provider that supports the OAuth 2.0 protocol. Learn more in the{" "}
              <a rel="noopener" className="text-link" target="_blank" href="https://docs.fider.io/configuring-oauth">
                OAuth documentation
              </a>
              .
            </Trans>
          </p>
          <VStack spacing={6}>
            {this.props.providers.map((o) => (
              <div key={o.provider}>
                <HStack justify="between">
                  <HStack className="h-6">
                    <OAuthProviderLogo option={o} />
                    <strong>{o.displayName}</strong>
                  </HStack>
                  <HStack>
                    {o.isCustomProvider && Fider.session.user.isAdministrator && (
                      <>
                        <Button onClick={this.edit.bind(this, o.provider)} size="small">
                          <Icon sprite={IconPencilAlt} />
                          <span>
                            <Trans id="admin.authentication.edit">Edit</Trans>
                          </span>
                        </Button>
                        <Button onClick={this.startTest.bind(this, o.provider)} size="small">
                          <Icon sprite={IconPlay} />
                          <span>
                            <Trans id="admin.authentication.test">Test</Trans>
                          </span>
                        </Button>
                      </>
                    )}
                    {!o.isCustomProvider && o.clientID && Fider.session.user.isAdministrator && (
                      <Toggle
                        field={`provider-${o.provider}`}
                        label={
                          o.isEnabled
                            ? t({ id: "admin.authentication.enabled", message: "Enabled" })
                            : t({ id: "admin.authentication.disabled", message: "Disabled" })
                        }
                        disabled={cantDisable && o.isEnabled}
                        active={o.isEnabled}
                        onToggle={this.toggleSystemProvider.bind(this, o)}
                      />
                    )}
                    {!o.isCustomProvider && !o.clientID && (
                      <span className="text-muted">
                        <Trans id="admin.authentication.notconfigured">Not configured</Trans>
                      </span>
                    )}
                  </HStack>
                </HStack>
                {o.isCustomProvider && (
                  <>
                    <div className="text-xs block my-1">{o.isEnabled ? enabled : disabled}</div>
                    <span className="text-muted">
                      <strong>
                        <Trans id="admin.authentication.clientid">Client ID:</Trans>
                      </strong>{" "}
                      {o.clientID} <br />
                      <strong>
                        <Trans id="admin.authentication.callbackurl">Callback URL:</Trans>
                      </strong>{" "}
                      {o.callbackURL}
                    </span>
                  </>
                )}
              </div>
            ))}
            <div>
              {Fider.session.user.isAdministrator && (
                <Button variant="secondary" onClick={this.addNew}>
                  <Trans id="admin.authentication.add">Add new</Trans>
                </Button>
              )}
            </div>
          </VStack>
        </div>
      </VStack>
    )
  }
}
