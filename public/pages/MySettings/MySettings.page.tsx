import "./MySettings.page.scss"
import React, { useRef, useState } from "react"
import { Form, Button, Input, Header } from "@fider/components"
import { UserSettings, UserAvatarType, ImageUpload, UserRole } from "@fider/models"
import { Failure, actions, Fider } from "@fider/services"
import { NotificationSettings, normalizeNotificationSettings } from "./components/NotificationSettings"
import { PasswordChangeForm } from "@fider/components/common/PasswordChangeForm"
import { ProfileAvatar } from "./components/ProfileAvatar"
import { i18n } from "@lingui/core"

interface MySettingsPageProps {
  userSettings: UserSettings
}
const saveFailure = (): Failure => ({ errors: [{ message: i18n._({ id: "profile.save.failed", message: "Unable to save changes. Please try again." }) }] })

export default function MySettingsPage(props: MySettingsPageProps) {
  const [user, setUser] = useState({ ...Fider.session.user })
  const [name, setName] = useState(user.name)
  const [settings, setSettings] = useState(() => normalizeNotificationSettings(props.userSettings))
  const [profileError, setProfileError] = useState<Failure>()
  const [notificationError, setNotificationError] = useState<Failure>()
  const [profileNotice, setProfileNotice] = useState("")
  const [notificationNotice, setNotificationNotice] = useState("")
  const [profileBusy, setProfileBusy] = useState(false)
  const [notificationBusy, setNotificationBusy] = useState(false)
  const profilePending = useRef(false),
    notificationPending = useRef(false)
  const applyUser = (patch: Partial<typeof user>) => {
    Object.assign(Fider.session.user, patch)
    setUser((current) => ({ ...current, ...patch }))
  }
  const saveProfile = async (event: React.FormEvent) => {
    event.preventDefault()
    if (profilePending.current) return
    profilePending.current = true
    setProfileBusy(true)
    setProfileError(undefined)
    setProfileNotice("")
    try {
      const result = await actions.updateProfileName(name)
      if (result.ok) {
        applyUser({ name: result.data.name })
        setName(result.data.name)
        setProfileNotice(i18n._({ id: "profile.saved", message: "Profile saved." }))
      } else setProfileError(result.error || saveFailure())
    } catch {
      setProfileError(saveFailure())
    } finally {
      profilePending.current = false
      setProfileBusy(false)
    }
  }
  const saveNotifications = async (event: React.FormEvent) => {
    event.preventDefault()
    if (notificationPending.current) return
    notificationPending.current = true
    setNotificationBusy(true)
    setNotificationError(undefined)
    setNotificationNotice("")
    try {
      const result = await actions.updateNotificationSettings(settings)
      if (result.ok) setNotificationNotice(i18n._({ id: "profile.notifications.saved", message: "Notification preferences saved." }))
      else setNotificationError(result.error || saveFailure())
    } catch {
      setNotificationError(saveFailure())
    } finally {
      notificationPending.current = false
      setNotificationBusy(false)
    }
  }
  const saveAvatar = async (avatar: ImageUpload, avatarType: UserAvatarType) => {
    const result = await actions.updateProfileAvatar(avatar, avatarType)
    if (!result.ok) throw new Error(result.error?.errors?.map((error) => error.message).join(" ") || saveFailure().errors?.[0].message)
    applyUser(result.data)
  }
  const role =
    user.role === UserRole.Administrator
      ? i18n._({ id: "workspace.role.administrator", message: "Administrator" })
      : user.role === UserRole.Collaborator
      ? i18n._({ id: "workspace.role.collaborator", message: "Collaborator" })
      : i18n._({ id: "workspace.role.member", message: "Member" })
  return (
    <Header title={i18n._({ id: "mysettings.page.title", message: "Settings" })}>
      <div id="p-my-settings" className="page p-my-settings">
        <h1 className="p-my-settings__heading">{i18n._({ id: "mysettings.page.title", message: "Settings" })}</h1>
        <div className="p-my-settings__grid">
          <section className="p-my-settings__panel" aria-labelledby="profile-details-title">
            <h2 id="profile-details-title">{i18n._({ id: "profile.details", message: "Personal profile" })}</h2>
            <ProfileAvatar
              name={user.name}
              avatarURL={user.avatarURL}
              hasAvatar={user.avatarType === UserAvatarType.Custom && !!user.avatarBlobKey}
              onSave={saveAvatar}
            />
            <Form error={profileError} onSubmit={saveProfile}>
              <Input field="username" label={i18n._({ id: "auth.username", message: "Username" })} value={user.username} readOnly autoComplete="username">
                <p className="text-muted mt-1">
                  {i18n._({ id: "accounts.username.readonly", message: "Your username is used to sign in and cannot be changed." })}
                </p>
              </Input>
              <Input field="role" label={i18n._({ id: "label.role", message: "Role" })} value={role} readOnly />
              <Input
                field="name"
                label={i18n._({ id: "accounts.nickname", message: "Nickname" })}
                value={name}
                maxLength={100}
                disabled={profileBusy}
                onChange={(value) => {
                  setName(value)
                  setProfileNotice("")
                }}
              />
              {profileNotice && (
                <p className="p-my-settings__notice" role="status">
                  {profileNotice}
                </p>
              )}
              <Button type="submit" variant="primary" disabled={profileBusy}>
                {i18n._({ id: "profile.save", message: "Save profile" })}
              </Button>
            </Form>
          </section>
          <div className="p-my-settings__secondary">
            <section className="p-my-settings__panel" aria-labelledby="profile-password-title">
              <h2 id="profile-password-title">{i18n._({ id: "profile.password", message: "Login password" })}</h2>
              <PasswordChangeForm username={user.username} hideUsername />
            </section>
            <section className="p-my-settings__panel" aria-labelledby="profile-notifications-title">
              <h2 id="profile-notifications-title">{i18n._({ id: "profile.notifications", message: "In-app notifications" })}</h2>
              <Form error={notificationError} onSubmit={saveNotifications}>
                <fieldset disabled={notificationBusy}>
                  <NotificationSettings
                    userSettings={settings}
                    hideHeading
                    settingsChanged={(value) => {
                      setSettings(value)
                      setNotificationNotice("")
                    }}
                  />
                </fieldset>
                {notificationNotice && (
                  <p className="p-my-settings__notice" role="status">
                    {notificationNotice}
                  </p>
                )}
                <Button type="submit" variant="primary" disabled={notificationBusy}>
                  {i18n._({ id: "profile.notifications.save", message: "Save notifications" })}
                </Button>
              </Form>
            </section>
          </div>
        </div>
      </div>
    </Header>
  )
}
