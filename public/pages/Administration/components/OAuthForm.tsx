import { t } from "@lingui/core/macro"
import { Trans } from "@lingui/react/macro"

import React, { useState } from "react"
import { OAuthConfig, OAuthConfigStatus, ImageUpload } from "@fider/models"
import { Failure, actions } from "@fider/services"
import { Form, Button, Input, SocialSignInButton, Field, ImageUploader, Toggle } from "@fider/components"
import { useFider } from "@fider/hooks"
import { HStack } from "@fider/components/layout"

interface OAuthFormProps {
  config?: OAuthConfig
  onCancel: () => void
  cantDisable: boolean
}

export const OAuthForm: React.FC<OAuthFormProps> = (props) => {
  const fider = useFider()
  const [provider] = useState((props.config && props.config.provider) || "")
  const [displayName, setDisplayName] = useState((props.config && props.config.displayName) || "")
  const [enabled, setEnabled] = useState((props.config && props.config.status === OAuthConfigStatus.Enabled) || false)
  const [isTrusted, setTrusted] = useState((props.config && props.config.isTrusted) || false)
  const [clientID, setClientID] = useState((props.config && props.config.clientID) || "")
  const [clientSecret, setClientSecret] = useState((props.config && props.config.clientSecret) || "")
  const [clientSecretEnabled, setClientSecretEnabled] = useState(!props.config)
  const [authorizeURL, setAuthorizeURL] = useState((props.config && props.config.authorizeURL) || "")
  const [tokenURL, setTokenURL] = useState((props.config && props.config.tokenURL) || "")
  const [profileURL, setProfileURL] = useState((props.config && props.config.profileURL) || "")
  const [scope, setScope] = useState((props.config && props.config.scope) || "")
  const [jsonUserIDPath, setJSONUserIDPath] = useState((props.config && props.config.jsonUserIDPath) || "")
  const [jsonUserNamePath, setJSONUserNamePath] = useState((props.config && props.config.jsonUserNamePath) || "")
  const [jsonUserEmailPath, setJSONUserEmailPath] = useState((props.config && props.config.jsonUserEmailPath) || "")
  const [jsonUserRolesPath, setJSONUserRolesPath] = useState((props.config && props.config.jsonUserRolesPath) || "")
  const [allowedRoles, setAllowedRoles] = useState((props.config && props.config.allowedRoles) || "")
  const [logo, setLogo] = useState<ImageUpload | undefined>()
  const [logoURL, setLogoURL] = useState<string | undefined>()
  const [logoBlobKey, setLogoBlobKey] = useState((props.config && props.config.logoBlobKey) || "")
  const [error, setError] = useState<Failure | undefined>()

  const handleSave = async () => {
    const result = await actions.saveOAuthConfig({
      provider,
      status: enabled ? OAuthConfigStatus.Enabled : OAuthConfigStatus.Disabled,
      isTrusted,
      displayName,
      clientID,
      clientSecret: clientSecretEnabled ? clientSecret : "",
      authorizeURL,
      tokenURL,
      profileURL,
      scope,
      jsonUserIDPath,
      jsonUserNamePath,
      jsonUserEmailPath,
      jsonUserRolesPath,
      allowedRoles,
      logo,
    })
    if (result.ok) {
      location.reload()
    } else {
      setError(result.error)
    }
  }

  const handleLogoChange = (newLogo: ImageUpload, instanceID: string, previewURL: string) => {
    setLogo(newLogo)
    setLogoURL(previewURL)
    setLogoBlobKey("")
  }

  const handleCancel = async () => {
    props.onCancel()
  }

  const enableClientSecret = () => {
    setClientSecret("")
    setClientSecretEnabled(true)
  }

  const providerName = props.config?.displayName
  const title = props.config
    ? t({ id: "admin.oauth.edittitle", message: `OAuth Provider: ${providerName}` })
    : t({ id: "admin.oauth.newtitle", message: "New OAuth Provider" })
  return (
    <>
      <h2 className="text-title mb-2">{title}</h2>
      <Form error={error}>
        <div className="grid grid-cols-4 gap-4">
          <Input
            className="col-span-3"
            field="displayName"
            label={t({ id: "admin.oauth.displayname", message: "Display Name" })}
            maxLength={50}
            value={displayName}
            disabled={!fider.session.user.isAdministrator}
            onChange={setDisplayName}
          />
          <Field className="flex flex-y" label={t({ id: "admin.oauth.preview", message: "Button Preview" })}>
            <SocialSignInButton
              option={{ displayName: displayName || t({ id: "admin.oauth.previewname", message: "Provider" }), provider, logoBlobKey, logoURL }}
            />
          </Field>
        </div>

        <ImageUploader
          label={t({ id: "admin.oauth.logo", message: "Logo" })}
          field="logo"
          bkey={logoBlobKey}
          disabled={!fider.session.user.isAdministrator}
          onChange={handleLogoChange}
        >
          <p className="text-muted">
            <Trans id="admin.oauth.logohelp">
              We accept JPG, GIF and PNG images, smaller than 50KB and with an aspect ratio of 1:1 with minimum dimensions of 24x24 pixels.
            </Trans>
          </p>
        </ImageUploader>

        <Input
          field="clientID"
          label={t({ id: "admin.oauth.clientid", message: "Client ID" })}
          maxLength={100}
          value={clientID}
          disabled={!fider.session.user.isAdministrator}
          onChange={setClientID}
        />

        <Input
          field="clientSecret"
          label={t({ id: "admin.oauth.clientsecret", message: "Client Secret" })}
          maxLength={500}
          value={clientSecret}
          disabled={!clientSecretEnabled}
          onChange={setClientSecret}
          afterLabel={
            !clientSecretEnabled ? (
              <>
                <span className="text-muted">
                  <Trans id="admin.oauth.secrethidden">Hidden for security reasons.</Trans>
                </span>
                <span className="text-link text-normal text-xs ml-1" onClick={enableClientSecret}>
                  <Trans id="admin.oauth.changesecret">Change</Trans>
                </span>
              </>
            ) : undefined
          }
        />
        <Input
          field="authorizeURL"
          label={t({ id: "admin.oauth.authorizeurl", message: "Authorize URL" })}
          maxLength={300}
          value={authorizeURL}
          disabled={!fider.session.user.isAdministrator}
          onChange={setAuthorizeURL}
        />
        <Input
          field="tokenURL"
          label={t({ id: "admin.oauth.tokenurl", message: "Token URL" })}
          maxLength={300}
          value={tokenURL}
          disabled={!fider.session.user.isAdministrator}
          onChange={setTokenURL}
        />

        <Input
          field="scope"
          label={t({ id: "admin.oauth.scope", message: "Scope" })}
          maxLength={100}
          value={scope}
          disabled={!fider.session.user.isAdministrator}
          onChange={setScope}
        >
          <p className="text-muted">
            <Trans id="admin.oauth.scopehelp">
              Only request the scopes required to read the user <strong>id</strong>, <strong>name</strong> and <strong>email</strong>. Separate multiple scopes
              with spaces.
            </Trans>
          </p>
        </Input>

        <h3 className="text-title mt-8 mb-2">
          <Trans id="admin.oauth.profile">User Profile</Trans>
        </h3>
        <p className="text-muted">
          <Trans id="admin.oauth.profilehelp">This section is used to configure how Fider will fetch user after the authentication process.</Trans>
        </p>

        <Input
          field="profileURL"
          label={t({ id: "admin.oauth.profileurl", message: "Profile API URL" })}
          maxLength={300}
          value={profileURL}
          disabled={!fider.session.user.isAdministrator}
          onChange={setProfileURL}
        >
          <p className="text-muted">
            <Trans id="admin.oauth.profileurlhelp">
              The URL to fetch the authenticated user info. If empty, Fider will try to parse the user info from the Access Token.
            </Trans>
          </p>
        </Input>

        <h3 className="text-title mt-8 mb-2">
          <Trans id="admin.oauth.jsonpath">JSON Path</Trans>
        </h3>
        <p>
          <Trans id="admin.oauth.jsonpathhelp">
            Learn more about{" "}
            <a rel="noopener" className="text-link" target="_blank" href="https://docs.fider.io/configuring-oauth#configuring-the-json-paths">
              configuring JSON paths
            </a>
            .
          </Trans>
        </p>

        <div className="grid grid-cols-4 gap-4">
          <Input
            field="jsonUserIDPath"
            label={t({ id: "admin.oauth.useridpath", message: "ID" })}
            maxLength={100}
            value={jsonUserIDPath}
            disabled={!fider.session.user.isAdministrator}
            onChange={setJSONUserIDPath}
          >
            <p className="text-muted">
              <Trans id="admin.oauth.uniqueid">Make sure it&apos;s unique. </Trans>
            </p>
          </Input>
          <Input
            field="jsonUserNamePath"
            label={t({ id: "admin.oauth.usernamepath", message: "Name" })}
            maxLength={100}
            value={jsonUserNamePath}
            disabled={!fider.session.user.isAdministrator}
            onChange={setJSONUserNamePath}
          >
            <p className="text-muted">
              <Trans id="admin.oauth.recommended">
                Optional, but <strong>highly</strong> recommended.
              </Trans>
            </p>
          </Input>
          <Input
            field="jsonUserEmailPath"
            label={t({ id: "admin.oauth.useremailpath", message: "Email" })}
            maxLength={100}
            value={jsonUserEmailPath}
            disabled={!fider.session.user.isAdministrator}
            onChange={setJSONUserEmailPath}
          >
            <p className="text-muted">
              <Trans id="admin.oauth.recommended">
                Optional, but <strong>highly</strong> recommended.
              </Trans>
            </p>
          </Input>
          <Input
            field="jsonUserRolesPath"
            label={t({ id: "admin.oauth.userrolespath", message: "Roles" })}
            maxLength={100}
            value={jsonUserRolesPath}
            disabled={!fider.session.user.isAdministrator}
            onChange={setJSONUserRolesPath}
          >
            <p className="text-muted">
              <Trans id="admin.oauth.rolespathhelp">Optional. JSON path to extract roles from the provider profile.</Trans>
            </p>
          </Input>
        </div>

        <Input
          field="allowedRoles"
          label={t({ id: "admin.oauth.allowedroles", message: "Allowed Roles" })}
          maxLength={500}
          value={allowedRoles}
          disabled={!fider.session.user.isAdministrator}
          onChange={setAllowedRoles}
        >
          <p className="text-muted">
            <Trans id="admin.oauth.allowedroleshelp">
              Optional. List allowed roles separated by commas, for example <strong>ROLE_ADMIN,ROLE_TEACHER</strong>. This restriction applies only when a roles
              JSON path is also configured. Leave empty to allow all roles. Site administrators and collaborators are exempt from this restriction.
            </Trans>
          </p>
        </Input>

        <Field label={t({ id: "admin.oauth.trusted", message: "Trusted Source" })}>
          <Toggle
            field="isTrusted"
            active={isTrusted}
            onToggle={setTrusted}
            label={isTrusted ? t({ id: "admin.oauth.yes", message: "Yes" }) : t({ id: "admin.oauth.no", message: "No" })}
          />
          <p className="text-muted mt-1">
            <Trans id="admin.oauth.trustedsite">
              This setting only applies to private sites. This site is currently{" "}
              <strong>
                {fider.session.tenant.isPrivate ? t({ id: "admin.oauth.private", message: "Private" }) : t({ id: "admin.oauth.public", message: "Public" })}
              </strong>
              .
            </Trans>
          </p>
          <p className="text-muted">
            <Trans id="admin.oauth.trustedhelp">
              If enabled, new users authenticated by this provider can join a private site without an invitation, subject to any configured role restrictions.
              Use this only with your organization’s identity provider, such as Okta, Microsoft AD or Google Workspace. Do not enable it for public identity
              providers such as Facebook or Twitter.
            </Trans>
          </p>
        </Field>

        <Field label={t({ id: "admin.oauth.status", message: "Status" })}>
          <Toggle
            field="status"
            disabled={props.cantDisable}
            active={enabled}
            onToggle={setEnabled}
            label={enabled ? t({ id: "admin.oauth.enabled", message: "Enabled" }) : t({ id: "admin.oauth.disabled", message: "Disabled" })}
          />
          <div className="mt-1">
            {enabled ? (
              <>
                {props.cantDisable && (
                  <p className="text-muted my-1">
                    <Trans id="admin.oauth.requireemail">You need to enable email authentication if you want to disable all OAuth providers.</Trans>
                  </p>
                )}
                <p className="text-muted mt-1">
                  <Trans id="admin.oauth.enabledhelp">
                    This provider will be shown as a sign-in option. Keep it disabled until you have tested it. The Test button is available after you save this
                    configuration.
                  </Trans>
                </p>
              </>
            ) : (
              <p className="text-muted">
                <Trans id="admin.oauth.disabledhelp">Users won&apos;t be able to sign in with this Provider.</Trans>
              </p>
            )}
          </div>
        </Field>

        <HStack className="mt-2">
          <Button variant="primary" onClick={handleSave}>
            <Trans id="admin.oauth.save">Save</Trans>
          </Button>
          <Button variant="tertiary" onClick={handleCancel}>
            <Trans id="admin.oauth.cancel">Cancel</Trans>
          </Button>
        </HStack>
      </Form>
    </>
  )
}
