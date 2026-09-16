import { i18n } from "@lingui/core"
import { Trans } from "@lingui/react/macro"
import React from "react"

import { TextArea, Form, Button } from "@fider/components"
import { Failure, actions, Fider } from "@fider/services"
import { AdminBasePage } from "../components/AdminBasePage"

interface AdvancedSettingsPageProps {
  customCSS: string
  allowedSchemes: string
}

interface AdvancedSettingsPageState {
  customCSS: string
  allowedSchemes: string
  error?: Failure
}

export default class AdvancedSettingsPage extends AdminBasePage<AdvancedSettingsPageProps, AdvancedSettingsPageState> {
  public id = "p-admin-advanced"
  public name = "advanced"
  public title = i18n._({ id: "admin.advanced.title", message: "Advanced" })
  public subtitle = i18n._({ id: "admin.advanced.subtitle", message: "Manage your site settings" })

  constructor(props: AdvancedSettingsPageProps) {
    super(props)

    this.state = {
      customCSS: this.props.customCSS,
      allowedSchemes: this.props.allowedSchemes,
    }
  }

  private setCustomCSS = (customCSS: string): void => {
    this.setState({ customCSS })
  }

  private setAllowedSchemes = (allowedSchemes: string): void => {
    this.setState({ allowedSchemes })
  }

  private handleSave = async (): Promise<void> => {
    const result = await actions.updateTenantAdvancedSettings(this.state.customCSS, this.state.allowedSchemes)
    if (result.ok) {
      location.reload()
    } else {
      this.setState({ error: result.error })
    }
  }

  public content() {
    return (
      <Form error={this.state.error}>
        <TextArea
          field="customCSS"
          label={i18n._({ id: "admin.advanced.css.label", message: "Custom CSS" })}
          disabled={!Fider.session.user.isAdministrator}
          minRows={10}
          value={this.state.customCSS}
          onChange={this.setCustomCSS}
        >
          <p className="text-muted">
            <Trans id="admin.advanced.css.help">
              Custom CSS allows you to change the site appearance and apply your own branding.
              <br />
              This feature requires a basic understanding of <a href="https://developer.mozilla.org/en-US/docs/Learn/CSS">CSS</a>.
            </Trans>
          </p>
          <p className="text-muted">
            <Trans id="admin.advanced.css.caution">Custom CSS may affect the site layout after software updates. To reduce conflicts:</Trans>
          </p>
          <ul className="text-muted">
            <li>
              <Trans id="admin.advanced.css.selectors">
                <strong>Avoid nested selectors</strong>: HTML structure may change in future updates, which can cause some CSS rules to stop working.
              </Trans>
            </li>
            <li>
              <Trans id="admin.advanced.css.simple">
                <strong>Keep it simple</strong>: Customize only what is essential.
              </Trans>
            </li>
          </ul>
        </TextArea>

        {Fider.settings.allowAllowedSchemes && (
          <TextArea
            field="allowedSchemes"
            label={i18n._({ id: "admin.advanced.schemes.label", message: "Allowed URL schemes" })}
            disabled={!Fider.session.user.isAdministrator}
            minRows={3}
            value={this.state.allowedSchemes}
            onChange={this.setAllowedSchemes}
          >
            <p className="text-muted">
              <Trans id="admin.advanced.schemes.help">
                By default, uncommon URL schemes are forbidden in links.
                <br />
                To allow links to Monero or Bitcoin addresses, add <code>^monero:[48]</code> or <code>^bitcoin:(1|3|bc1)</code> here.
              </Trans>
            </p>
            <p className="text-muted">
              <Trans id="admin.advanced.schemes.rules">
                Enter one regular expression per line to match link addresses. <code>^javascript</code> is always rejected.
              </Trans>
            </p>
          </TextArea>
        )}

        {Fider.session.user.isAdministrator && (
          <div className="field">
            <Button variant="primary" onClick={this.handleSave}>
              <Trans id="action.save">Save</Trans>
            </Button>
          </div>
        )}
      </Form>
    )
  }
}
