import { t } from "@lingui/core/macro"
import { Trans } from "@lingui/react/macro"

import React from "react"
import { navigator } from "@fider/services"
import { Icon } from "@fider/components"

import IconXCircle from "@fider/assets/images/heroicons-x-circle.svg"
import IconCheckCircle from "@fider/assets/images/heroicons-check-circle.svg"
import IconExclamation from "@fider/assets/images/heroicons-exclamation.svg"
import { HStack, VStack } from "@fider/components/layout"

interface OAuthEchoPageProps {
  err: string | undefined
  body: string
  profile: {
    id: string
    name: string
    email: string
    roles: string[]
  }
  configuredRolesPath: string
  configuredAllowedRoles: string
}

const ok = <Icon sprite={IconCheckCircle} className="h-4 text-green-500" />
const error = <Icon sprite={IconXCircle} className="h-4 text-red-500" />
const warn = <Icon sprite={IconExclamation} className="h-4 text-yellow-500" />

export default class OAuthEchoPage extends React.Component<OAuthEchoPageProps, any> {
  public componentDidMount() {
    navigator.replaceState("/")
  }

  private renderError() {
    return (
      <>
        <h5 className="text-display">
          <Trans id="admin.oauthecho.error">Error</Trans>
        </h5>
        <pre>{this.props.err}</pre>
      </>
    )
  }

  private renderParseResult() {
    const idOk = this.props.profile && this.props.profile.id !== ""
    const nameOk = this.props.profile && this.props.profile.name !== "Anonymous"
    const emailOk = this.props.profile && this.props.profile.email !== ""
    const hasRoles = this.props.profile && this.props.profile.roles && this.props.profile.roles.length > 0

    const { configuredRolesPath, configuredAllowedRoles } = this.props
    const roleCheckConfigured = configuredRolesPath && configuredAllowedRoles
    let roleCheckPasses = true
    if (roleCheckConfigured && this.props.profile) {
      const allowed = configuredAllowedRoles
        .split(",")
        .map((r) => r.trim())
        .filter((r) => r !== "")
      roleCheckPasses = allowed.length === 0 || (this.props.profile.roles || []).some((r) => allowed.includes(r.trim()))
    }

    let responseBody = ""
    try {
      responseBody = JSON.stringify(JSON.parse(this.props.body), null, "  ")
    } catch {
      responseBody = this.props.body
    }

    return (
      <>
        <h5 className="text-display mb-2">
          <Trans id="admin.oauthecho.rawbody">Raw Body</Trans>
        </h5>
        <pre>{responseBody}</pre>
        <h5 className="text-display mb-2 mt-8">
          <Trans id="admin.oauthecho.parsedprofile">Parsed Profile</Trans>
        </h5>
        <VStack divide={true} spacing={2}>
          <VStack>
            <HStack>
              {idOk ? ok : error}
              <strong>
                <Trans id="admin.oauthecho.userid">ID:</Trans>
              </strong>{" "}
              <span>{this.props.profile && this.props.profile.id}</span>
            </HStack>
            {!idOk && (
              <span className="text-muted">
                <Trans id="admin.oauthecho.idrequired">ID is required. If not found, users will see an error during sign in process.</Trans>
              </span>
            )}
          </VStack>
          <VStack>
            <HStack>
              {nameOk ? ok : warn}
              <strong>
                <Trans id="admin.oauthecho.username">Name:</Trans>
              </strong>{" "}
              <span>{this.props.profile && this.props.profile.name}</span>
            </HStack>
            {!nameOk && (
              <span className="text-muted">
                <Trans id="admin.oauthecho.namefallback">
                  If no name is found, new users will be assigned the default name <strong>Anonymous</strong>.
                </Trans>
              </span>
            )}
          </VStack>
          <VStack>
            <HStack>
              {emailOk ? ok : warn}
              <strong>
                <Trans id="admin.oauthecho.email">Email:</Trans>
              </strong>{" "}
              {this.props.profile && this.props.profile.email}
            </HStack>
            {!emailOk && (
              <span className="text-muted">
                <Trans id="admin.oauthecho.emailhelp">
                  Email is optional, but highly recommended. If invalid or not found, new users will not receive email notifications.
                </Trans>
              </span>
            )}
          </VStack>
          <VStack>
            <HStack>
              {hasRoles ? ok : warn}
              <strong>
                <Trans id="admin.oauthecho.roles">Roles:</Trans>
              </strong>{" "}
              {hasRoles ? this.props.profile.roles.join(", ") : t({ id: "admin.oauthecho.noroles", message: "(none)" })}
            </HStack>
            <span className="text-muted">
              <Trans id="admin.oauthecho.roleshelp">
                Roles are optional. When a roles JSON path and <strong>Allowed Roles</strong> are both configured, they are used to restrict sign-in access.
              </Trans>
            </span>
          </VStack>
          {roleCheckConfigured && (
            <VStack>
              <HStack>
                {roleCheckPasses ? ok : error}
                <strong>
                  <Trans id="admin.oauthecho.rolecheck">Role check:</Trans>
                </strong>{" "}
                {roleCheckPasses ? (
                  <span className="text-green-700">
                    <Trans id="admin.oauthecho.passed">Pass</Trans>
                  </span>
                ) : (
                  <span className="text-red-700">
                    <Trans id="admin.oauthecho.failed">
                      Failed: users will be redirected to /access-denied, except existing site administrators and collaborators.
                    </Trans>
                  </span>
                )}
              </HStack>
              <span className="text-muted">
                <Trans id="admin.oauthecho.rolesconfiguration">
                  Configured roles path: <strong>{configuredRolesPath}</strong> · Allowed roles: <strong>{configuredAllowedRoles}</strong>
                </Trans>
              </span>
            </VStack>
          )}
        </VStack>
      </>
    )
  }

  public render() {
    return (
      <div id="p-oauth-echo" className="page container">
        {this.props.err ? this.renderError() : this.renderParseResult()}
      </div>
    )
  }
}
