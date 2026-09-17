import { DangerZone } from "./components/DangerZone"
import React from "react"

import { Form, Button, PageTitle, Input, Select, SelectOption, ImageUploader, Header } from "@fider/components"
import { UserSettings, UserAvatarType, ImageUpload } from "@fider/models"
import { Failure, actions, Fider } from "@fider/services"
import { NotificationSettings, normalizeNotificationSettings } from "./components/NotificationSettings"
import { PasswordChangeForm } from "@fider/components/common/PasswordChangeForm"
import { i18n } from "@lingui/core"
import { Trans } from "@lingui/react/macro"

interface MySettingsPageState {
  name: string
  avatar?: ImageUpload
  avatarType: UserAvatarType
  error?: Failure
  userSettings: UserSettings
}

interface MySettingsPageProps {
  userSettings: UserSettings
}

export default class MySettingsPage extends React.Component<MySettingsPageProps, MySettingsPageState> {
  constructor(props: MySettingsPageProps) {
    super(props)
    this.state = {
      avatarType: Fider.session.user.avatarType === UserAvatarType.Custom ? UserAvatarType.Custom : UserAvatarType.Letter,
      name: Fider.session.user.name,
      userSettings: normalizeNotificationSettings(this.props.userSettings),
    }
  }

  private confirm = async () => {
    const result = await actions.updateUserSettings({
      name: this.state.name,
      avatarType: this.state.avatarType,
      avatar: this.state.avatar,
      settings: this.state.userSettings,
    })
    if (result.ok) {
      location.reload()
    } else if (result.error) {
      this.setState({ error: result.error })
    }
  }

  private avatarTypeChanged = (opt?: SelectOption) => {
    if (opt) this.setState({ avatarType: opt.value as UserAvatarType })
  }
  private setName = (name: string) => this.setState({ name })
  private setNotificationSettings = (userSettings: UserSettings) => this.setState({ userSettings })
  private setAvatar = (avatar: ImageUpload): void => this.setState({ avatar })

  public render() {
    return (
      <Header title={i18n._({ id: "mysettings.page.title", message: "Settings" })}>
        <div id="p-my-settings" className="page container">
          <PageTitle
            title={i18n._({ id: "mysettings.page.title", message: "Settings" })}
            subtitle={i18n._({ id: "mysettings.page.subtitle", message: "Manage your profile settings" })}
          />
          <div className="w-max-7xl">
            <Form error={this.state.error}>
              <Input
                field="username"
                label={i18n._({ id: "auth.username", message: "Username" })}
                value={Fider.session.user.username}
                readOnly
                autoComplete="username"
              >
                <p className="text-muted mt-1">
                  <Trans id="accounts.username.readonly">Your username is used to sign in and cannot be changed.</Trans>
                </p>
              </Input>
              <Input
                label={i18n._({ id: "accounts.nickname", message: "Nickname" })}
                field="name"
                value={this.state.name}
                maxLength={100}
                onChange={this.setName}
              >
                <p className="text-muted mt-1">
                  <Trans id="accounts.nickname.help">Shown on your records and comments. Changing it does not change your username.</Trans>
                </p>
              </Input>
              <Select
                label={i18n._({ id: "label.avatar", message: "Avatar" })}
                field="avatarType"
                defaultValue={this.state.avatarType}
                options={[
                  { label: i18n._({ id: "label.letter", message: "Letter" }), value: UserAvatarType.Letter },
                  { label: i18n._({ id: "label.custom", message: "Custom" }), value: UserAvatarType.Custom },
                ]}
                onChange={this.avatarTypeChanged}
              >
                {this.state.avatarType === UserAvatarType.Letter && (
                  <p className="text-muted">
                    <Trans id="mysettings.message.avatar.letter">A letter avatar based on your initials is generated for you.</Trans>
                  </p>
                )}
                {this.state.avatarType === UserAvatarType.Custom && (
                  <ImageUploader field="avatar" onChange={this.setAvatar} bkey={Fider.session.user.avatarBlobKey}>
                    <p className="text-muted">
                      <Trans id="mysettings.message.avatar.custom">
                        We accept JPG, GIF and PNG images, smaller than 100KB and with an aspect ratio of 1:1 with minimum dimensions of 50x50 pixels.
                      </Trans>
                    </p>
                  </ImageUploader>
                )}
              </Select>
              <NotificationSettings userSettings={this.state.userSettings} settingsChanged={this.setNotificationSettings} />
              <Button variant="primary" onClick={this.confirm}>
                <Trans id="action.save">Save</Trans>
              </Button>
            </Form>
            <section className="mt-8">
              <h2 className="text-title mb-3">
                <Trans id="auth.password.change">Change password</Trans>
              </h2>
              <PasswordChangeForm username={Fider.session.user.username} />
            </section>
            <div className="mt-8">
              <DangerZone />
            </div>
          </div>
        </div>
      </Header>
    )
  }
}
