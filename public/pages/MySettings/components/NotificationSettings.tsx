import React, { useState } from "react"
import { UserSettings } from "@fider/models"
import { Toggle, Field } from "@fider/components"
import { HStack, VStack } from "@fider/components/layout"
import { i18n } from "@lingui/core"
import { Trans } from "@lingui/react/macro"

interface NotificationSettingsProps {
  userSettings: UserSettings
  settingsChanged: (settings: UserSettings) => void
}

const notificationKeys = ["event_notification_new_post", "event_notification_new_comment", "event_notification_mention", "event_notification_change_status"]

// Keep the historical in-app preference while dropping all retired channel bits.
export const normalizeNotificationSettings = (settings: UserSettings): UserSettings => {
  const normalized = { ...settings }
  notificationKeys.forEach((key) => {
    if (key in normalized) normalized[key] = (parseInt(normalized[key], 10) & 1).toString()
  })
  return normalized
}

export const NotificationSettings = (props: NotificationSettingsProps) => {
  const [userSettings, setUserSettings] = useState(() => normalizeNotificationSettings(props.userSettings))
  const toggle = (key: string, active: boolean) => {
    const nextSettings = { ...userSettings, [key]: active ? "1" : "0" }
    setUserSettings(nextSettings)
    props.settingsChanged(nextSettings)
  }
  const events = [
    { key: notificationKeys[0], label: i18n._({ id: "mysettings.notification.event.newpost", message: "New Post" }) },
    { key: notificationKeys[1], label: i18n._({ id: "mysettings.notification.event.discussion", message: "New Comments" }) },
    { key: notificationKeys[2], label: i18n._({ id: "mysettings.notification.event.mention", message: "Mentions" }) },
    { key: notificationKeys[3], label: i18n._({ id: "mysettings.notification.event.statuschanged", message: "Status Changed" }) },
  ]

  return (
    <Field label={i18n._({ id: "label.notifications", message: "Notifications" })}>
      <p className="text-muted mb-6">
        <Trans id="mysettings.notification.title">Choose the events to receive an in-app notification for.</Trans>
      </p>
      <div className="notifications-settings mt-4">
        <VStack spacing={4} divide={true} className="rounded">
          {events.map(({ key, label }) => (
            <HStack key={key} spacing={6} justify="between">
              <span>{label}</span>
              <Toggle active={userSettings[key] === "1"} ariaLabel={label} onToggle={(active) => toggle(key, active)} />
            </HStack>
          ))}
        </VStack>
      </div>
    </Field>
  )
}
