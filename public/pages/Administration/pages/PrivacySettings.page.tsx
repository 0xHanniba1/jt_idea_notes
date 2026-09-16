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
      isPrivate: Fider.session.tenant.isPrivate,
      isFeedEnabled: Fider.session.tenant.isFeedEnabled,
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

  private privacyToggle = async (active: boolean) => {
    this.updatePrivacySettings(active, this.state.isFeedEnabled)
  }

  private atomFeedToggle = async (enabled: boolean) => {
    this.updatePrivacySettings(this.state.isPrivate, enabled)
  }

  private moderationToggle = async (enabled: boolean) => {
    this.updatePrivacySettings(this.state.isPrivate, this.state.isFeedEnabled, enabled)
  }

  public content() {
    return (
      <Form>
        <Field label={i18n._({ id: "admin.privacy.private.label", message: "Private site" })}>
          <Toggle disabled={!Fider.session.user.isAdministrator} active={this.state.isPrivate} onToggle={this.privacyToggle} />
          <p className="text-muted mt-1">
            <Trans id="admin.privacy.private.help">
              A private site prevents unauthenticated users from viewing or interacting with its content. <br /> When enabled, only already registered users,
              invited users and users from trusted OAuth providers will have access to this site. The feed feature is disabled.
            </Trans>
          </p>
        </Field>
        <Field label={i18n._({ id: "admin.privacy.feed.label", message: "ATOM feed" })}>
          <Toggle disabled={!Fider.session.user.isAdministrator || this.state.isPrivate} active={this.state.isFeedEnabled} onToggle={this.atomFeedToggle} />
          <p className="text-muted mt-1">
            <Trans id="admin.privacy.feed.help">
              This feature lets users access this site via a feed reader. <br /> When enabled, posts and comments are available in ATOM format. Feed links and
              autodiscovery metadata are included on the site.
            </Trans>
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
