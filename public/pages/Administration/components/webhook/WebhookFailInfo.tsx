import "./WebhookFailInfo.scss"

import { i18n } from "@lingui/core"
import { Trans } from "@lingui/react/macro"
import React from "react"
import { WebhookTriggerResult } from "@fider/models"
import { Button, Modal } from "@fider/components"

import { VStack } from "@fider/components/layout"
import { HoverInfo } from "@fider/components/common/HoverInfo"
import { WebhookProperties } from "@fider/pages/Administration/components/webhook/WebhookProperties"

interface WebhookFailInfoProps {
  result: WebhookTriggerResult
  isModalOpen: boolean
  onModalOpen: () => void
  onModalClose: () => void
}

interface InfoPropertyProps {
  value: string | number
  name: string
  info: string
  multiline?: boolean
}

const InfoProperty = (props: InfoPropertyProps) => {
  const name = props.name
  return props.value ? (
    <div>
      <h3 className="text-title mb-1">
        {props.name}
        <HoverInfo text={props.info} />
      </h3>
      {props.multiline ? <pre>{props.value}</pre> : <p>{props.value}</p>}
    </div>
  ) : (
    <div className="text-muted">
      <Trans id="admin.webhooks.failure.unavailable">
        <span className="text-bold">{name}</span> information is not available.
      </Trans>
    </div>
  )
}

export const WebhookFailInfo = (props: WebhookFailInfoProps) => {
  return (
    <>
      <HoverInfo text={i18n._({ id: "admin.webhooks.failure.show", message: "Click to show failure details" })} onClick={props.onModalOpen} />
      <Modal.Window isOpen={props.isModalOpen} onClose={props.onModalClose} size="large">
        <Modal.Header>{i18n._({ id: "admin.webhooks.failure.title", message: "Webhook trigger failure details" })}</Modal.Header>
        <Modal.Content>
          <VStack className="c-webhook-failinfo" spacing={4} divide>
            <InfoProperty
              value={props.result.message}
              name={i18n._({ id: "admin.webhooks.failure.message", message: "Message" })}
              info={i18n._({ id: "admin.webhooks.failure.message.help", message: "Generic information about where it failed" })}
            />
            <InfoProperty
              value={props.result.error}
              name={i18n._({ id: "admin.webhooks.failure.error", message: "Error" })}
              info={i18n._({ id: "admin.webhooks.failure.error.help", message: "Detailed information about what failed" })}
              multiline
            />
            <InfoProperty
              value={props.result.url}
              name={i18n._({ id: "admin.webhooks.url", message: "URL" })}
              info={i18n._({ id: "admin.webhooks.failure.url.help", message: "Parsed URL where the request has been made" })}
            />
            <InfoProperty
              value={props.result.content}
              name={i18n._({ id: "admin.webhooks.content", message: "Content" })}
              info={i18n._({ id: "admin.webhooks.failure.content.help", message: "Parsed content that was sent as request body" })}
              multiline
            />
            <InfoProperty
              value={props.result.status_code}
              name={i18n._({ id: "admin.webhooks.failure.status", message: "Status code" })}
              info={i18n._({ id: "admin.webhooks.failure.status.help", message: "HTTP response status code of the request" })}
            />
            <div>
              <h3 className="text-title mb-1">
                {i18n._({ id: "admin.webhooks.properties", message: "Properties" })}
                <HoverInfo text={i18n._({ id: "admin.webhooks.failure.properties.help", message: "Properties used when parsing URL and content" })} />
              </h3>
              <WebhookProperties
                properties={props.result.props}
                propsName={i18n._({ id: "admin.webhooks.property.name", message: "Property name" })}
                valueName={i18n._({ id: "admin.webhooks.property.resolved", message: "Resolved value" })}
              />
            </div>
          </VStack>
        </Modal.Content>
        <Modal.Footer>
          <Button variant="tertiary" onClick={props.onModalClose}>
            {i18n._({ id: "admin.webhooks.close", message: "Close" })}
          </Button>
        </Modal.Footer>
      </Modal.Window>
    </>
  )
}
