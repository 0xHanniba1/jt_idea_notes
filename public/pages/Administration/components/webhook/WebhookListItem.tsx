import "./WebhookListItem.scss"

import { i18n } from "@lingui/core"
import { Trans } from "@lingui/react/macro"
import React, { useState } from "react"
import { Webhook, WebhookStatus, WebhookTriggerResult, WebhookType } from "@fider/models"
import { Button, Icon } from "@fider/components"
import { actions, notify } from "@fider/services"

import IconX from "@fider/assets/images/heroicons-x.svg"
import IconPencilAlt from "@fider/assets/images/heroicons-pencil-alt.svg"
import IconPlay from "@fider/assets/images/heroicons-play.svg"
import IconCheckCircle from "@fider/assets/images/heroicons-check-circle.svg"
import IconXCircle from "@fider/assets/images/heroicons-x-circle.svg"
import IconExclamation from "@fider/assets/images/heroicons-exclamation.svg"
import { HStack, VStack } from "@fider/components/layout"
import { WebhookFailInfo } from "./WebhookFailInfo"

interface WebhookListItemProps {
  webhook: Webhook
  editWebhook: (webhook: Webhook) => void
  onWebhookDeleted: (webhook: Webhook) => void
  onWebhookFailed: (webhook: Webhook) => void
}

interface WebhookIconProps {
  status: WebhookStatus
}

const WebhookIcon = (props: WebhookIconProps) => {
  let text, icon, statusClass
  switch (props.status) {
    case WebhookStatus.ENABLED:
      text = i18n._({ id: "admin.webhooks.enabled", message: "Enabled" })
      statusClass = "enabled"
      icon = IconCheckCircle
      break
    case WebhookStatus.DISABLED:
      text = i18n._({ id: "admin.webhooks.disabled", message: "Disabled" })
      statusClass = "disabled"
      icon = IconXCircle
      break
    case WebhookStatus.FAILED:
      text = i18n._({ id: "admin.webhooks.status.failed", message: "Failed" })
      statusClass = "failed"
      icon = IconExclamation
  }
  return (
    <div data-tooltip={text}>
      <Icon width="23" height="23" className={`c-webhook-listitem__icon c-webhook-listitem__icon--${statusClass}`} sprite={icon} />
    </div>
  )
}

export const WebhookListItem = (props: WebhookListItemProps) => {
  const [deleting, setDeleting] = useState(false)
  const [triggerResult, setTriggerResult] = useState<WebhookTriggerResult | undefined>(undefined)
  const [isFailInfoModalOpen, setIsFailInfoModalOpen] = useState(false)

  const showFailInfoModal = () => setIsFailInfoModalOpen(true)
  const hideFailInfoModal = () => setIsFailInfoModalOpen(false)

  const deleteWebhook = async () => {
    const result = await actions.deleteWebhook(props.webhook.id)
    if (result.ok) {
      setDeleting(false)
      props.onWebhookDeleted(props.webhook)
    }
  }

  const getWebhookType = (type: WebhookType) => {
    switch (type) {
      case WebhookType.CHANGE_STATUS:
        return i18n._({ id: "admin.webhooks.event.changestatus", message: "Change Status" })
      case WebhookType.NEW_COMMENT:
        return i18n._({ id: "admin.webhooks.event.newcomment", message: "New Comment" })
      case WebhookType.DELETE_POST:
        return i18n._({ id: "admin.webhooks.event.deletepost", message: "Delete Post" })
      case WebhookType.NEW_POST:
        return i18n._({ id: "admin.webhooks.event.newpost", message: "New Post" })
    }
  }

  const testWebhook = async () => {
    const result = await actions.testWebhook(props.webhook.id)
    setTriggerResult(result.data)
    if (result.ok && result.data.success) {
      notify.success(i18n._({ id: "admin.webhooks.test.success", message: "Successfully triggered webhook" }))
    } else {
      notify.error(result.data.message)
      props.onWebhookFailed(props.webhook)
    }
  }

  const renderDeleteMode = () => {
    const id = props.webhook.id
    const name = props.webhook.name
    return (
      <VStack spacing={2}>
        <div>
          <b>{i18n._({ id: "admin.webhooks.delete.confirm", message: "Are you sure?" })}</b>{" "}
          <span>
            <Trans id="admin.webhooks.delete.help">
              Webhook #{id} &quot;{name}&quot; will be permanently deleted. You can also <b>disable</b> it to keep its configuration.
            </Trans>
          </span>
        </div>
        <div>
          <Button variant="danger" onClick={deleteWebhook}>
            {i18n._({ id: "admin.webhooks.delete", message: "Delete webhook" })}
          </Button>
          <Button onClick={() => setDeleting(false)} variant="tertiary">
            {i18n._({ id: "admin.webhooks.cancel", message: "Cancel" })}
          </Button>
        </div>
      </VStack>
    )
  }

  const renderViewMode = () => {
    return (
      <HStack justify="between">
        <HStack>
          <WebhookIcon status={props.webhook.status} />
          <h3 className="text-body nowrap">
            <span className="text-muted">#{props.webhook.id}</span>
            <span className="text-bold px-2">{getWebhookType(props.webhook.type)}</span> - {props.webhook.name}
          </h3>
          {triggerResult?.success === false && (
            <WebhookFailInfo result={triggerResult} isModalOpen={isFailInfoModalOpen} onModalOpen={showFailInfoModal} onModalClose={hideFailInfoModal} />
          )}
        </HStack>
        <HStack>
          <Button size="small" onClick={testWebhook}>
            <Icon sprite={IconPlay} />
            <span>{i18n._({ id: "admin.webhooks.test", message: "Test" })}</span>
          </Button>
          <Button size="small" onClick={() => props.editWebhook(props.webhook)}>
            <Icon sprite={IconPencilAlt} />
            <span>{i18n._({ id: "admin.webhooks.edit", message: "Edit" })}</span>
          </Button>
          <Button size="small" onClick={() => setDeleting(true)}>
            <Icon sprite={IconX} />
            <span>{i18n._({ id: "admin.webhooks.delete.action", message: "Delete" })}</span>
          </Button>
        </HStack>
      </HStack>
    )
  }

  return deleting ? renderDeleteMode() : renderViewMode()
}
