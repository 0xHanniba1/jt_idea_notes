import { i18n } from "@lingui/core"
import { Trans } from "@lingui/react/macro"
import React from "react"
import { Toggle, Form, Field } from "@fider/components"
import { actions, notify, Fider } from "@fider/services"
import { AdminBasePage } from "@fider/pages/Administration/components/AdminBasePage"

export interface PrivacySettingsPageState {
  isPrivate: boolean
  isFeedEnabled: boolean
  isModerationEnabled: boolean
}

export default class PrivacySettingsPage extends AdminBasePage<any, PrivacySettingsPageState> {
  public id = "p-admin-privacy"
  public name = "privacy"
  public title = i18n._({ id: "admin.privacy.title", message: "Access permissions" })
  public subtitle = i18n._({ id: "admin.privacy.subtitle", message: "Manage site access, feeds and content moderation" })

  constructor(props: any) {
    super(props)

    this.state = {
      isPrivate: true,
      isFeedEnabled: false,
      isModerationEnabled: Fider.session.tenant.isModerationEnabled,
    }
  }

  private updatePrivacySettings = async (isPrivate: boolean, isFeedEnabled: boolean, isModerationEnabled?: boolean) => {
    this.setState(
      {
        isPrivate,
        isFeedEnabled: isPrivate ? false : isFeedEnabled, // Disable feed if site is private
        isModerationEnabled: isModerationEnabled !== undefined ? isModerationEnabled : this.state.isModerationEnabled,
      },
      async () => {
        const response = await actions.updateTenantPrivacy(this.state)
        if (response.ok) {
          notify.success(i18n._({ id: "admin.privacy.saved", message: "Your access settings have been saved." }))
        }
      }
    )
  }

  private moderationToggle = async (enabled: boolean) => {
    this.updatePrivacySettings(this.state.isPrivate, this.state.isFeedEnabled, enabled)
  }

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
        {Fider.session.tenant.isPro && (
          <Field label={i18n._({ id: "admin.privacy.moderation.label", message: "Content moderation" })}>
            <Toggle disabled={!Fider.session.user.isAdministrator} active={this.state.isModerationEnabled} onToggle={this.moderationToggle} />
            <p className="text-muted mt-1">
              <Trans id="admin.privacy.moderation.help">
                When enabled, new posts and comments from regular members who are not trusted require administrator approval before being visible to other
                users. <br /> Authors can see their own content while it is pending review.
              </Trans>
            </p>
          </Field>
        )}
      </Form>
    )
  }
}
