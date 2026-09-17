import { i18n } from "@lingui/core"
import { Trans } from "@lingui/react/macro"
import React from "react"
import { Form, Field } from "@fider/components"
import { AdminBasePage } from "@fider/pages/Administration/components/AdminBasePage"

export default class PrivacySettingsPage extends AdminBasePage<any, any> {
  public id = "p-admin-privacy"
  public name = "privacy"
  public title = i18n._({ id: "admin.privacy.title", message: "Access permissions" })
  public subtitle = i18n._({ id: "admin.privacy.subtitle", message: "Manage access to the internal workspace" })

  public content() {
    return (
      <Form>
        <Field label={i18n._({ id: "accounts.internal.title", message: "Internal members only" })}>
          <p className="text-muted">
            <Trans id="accounts.internal.help">
              Only members with administrator-created accounts and passwords can access this site. Public access and self-registration are disabled.
            </Trans>
          </p>
          <p className="text-muted mt-2">
            <Trans id="accounts.internal.feeds">Public feeds are disabled to protect internal content.</Trans>
          </p>
        </Field>
      </Form>
    )
  }
}
