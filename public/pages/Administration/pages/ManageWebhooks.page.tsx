import { i18n } from "@lingui/core"
import { Trans } from "@lingui/react/macro"
import React, { useState } from "react"
import { Button } from "@fider/components"

import { Webhook, WebhookData, WebhookStatus } from "@fider/models"
import { actions, Failure } from "@fider/services"
import { AdminPageContainer } from "../components/AdminBasePage"
import { WebhookForm } from "../components/webhook/WebhookForm"
import { WebhookListItem } from "../components/webhook/WebhookListItem"
import { VStack } from "@fider/components/layout"

interface ManageWebhooksPageProps {
  webhooks: Webhook[]
}

const webhookSorter = (w1: Webhook, w2: Webhook) => {
  if (w1.name < w2.name) {
    return -1
  } else if (w1.name > w2.name) {
    return 1
  }
  return 0
}

interface WebhooksListProps {
  list: JSX.Element[]
}

const WebhooksList = (props: WebhooksListProps) => {
  return (
    <div>
      <h2 className="text-display mb-4">{i18n._({ id: "admin.webhooks.list.title", message: "My Webhooks" })}</h2>
      <VStack spacing={4} divide>
        {props.list.length === 0 ? (
          <p className="text-muted">{i18n._({ id: "admin.webhooks.empty", message: "There aren\u2019t any webhooks yet." })}</p>
        ) : (
          props.list
        )}
      </VStack>
    </div>
  )
}

const ManageWebhooksPage = (props: ManageWebhooksPageProps) => {
  const [isAdding, setIsAdding] = useState(false)
  const [allWebhooks, setAllWebhooks] = useState(props.webhooks.sort(webhookSorter))
  const [editing, setEditing] = useState<Webhook>()

  const sortWebhooks = () => setAllWebhooks(allWebhooks.sort(webhookSorter))

  const addNew = () => {
    setIsAdding(true)
    setEditing(undefined)
  }
  const cancelAdd = () => setIsAdding(false)

  const saveNewWebhook = async (data: WebhookData): Promise<Failure | undefined> => {
    const result = await actions.createWebhook(data)
    if (result.ok) {
      setIsAdding(false)
      setAllWebhooks(allWebhooks.concat({ id: result.data.id, ...data }).sort(webhookSorter))
    } else {
      return result.error
    }
  }

  const startWebhookEditing = (webhook: Webhook) => {
    setIsAdding(false)
    setEditing(webhook)
  }
  const cancelEdit = () => setEditing(undefined)

  const handleWebhookDeleted = (webhook: Webhook) => {
    const idx = allWebhooks.indexOf(webhook)
    setAllWebhooks(allWebhooks.filter((_, i) => i !== idx))
  }

  const handleWebhookEdited = async (data: WebhookData): Promise<Failure | undefined> => {
    const webhook = editing
    if (webhook === undefined) return // impossible
    const result = await actions.updateWebhook(webhook.id, data)
    if (result.ok) {
      webhook.name = data.name
      webhook.type = data.type
      webhook.status = data.status === WebhookStatus.FAILED ? WebhookStatus.DISABLED : data.status
      webhook.url = data.url
      webhook.content = data.content
      webhook.http_method = data.http_method
      webhook.http_headers = data.http_headers

      setEditing(undefined)
      sortWebhooks()
    } else {
      return result.error
    }
  }

  const handleWebhookFailed = (webhook: Webhook) => {
    webhook.status = WebhookStatus.FAILED
    sortWebhooks()
  }

  const getWebhookItems = () => {
    return allWebhooks.map((w) => {
      return (
        <WebhookListItem
          key={w.id}
          webhook={w}
          onWebhookDeleted={handleWebhookDeleted}
          editWebhook={startWebhookEditing}
          onWebhookFailed={handleWebhookFailed}
        />
      )
    })
  }

  const render = (content: JSX.Element) => (
    <AdminPageContainer
      id="p-admin-webhooks"
      name="webhooks"
      title={i18n._({ id: "admin.webhooks.title", message: "Webhooks" })}
      subtitle={i18n._({ id: "admin.webhooks.subtitle", message: "Manage your site webhooks" })}
    >
      {content}
    </AdminPageContainer>
  )

  if (isAdding) {
    return render(<WebhookForm onSave={saveNewWebhook} onCancel={cancelAdd} />)
  }

  if (editing) {
    return render(<WebhookForm onSave={handleWebhookEdited} onCancel={cancelEdit} webhook={editing} />)
  }

  return render(
    <VStack spacing={8}>
      <p>
        <Trans id="admin.webhooks.description">
          Use webhooks to integrate this site with applications such as Slack, Discord, and Zapier.{" "}
          <a className="text-link" href="https://docs.fider.io/using-webhooks" target="_blank" rel="noopener">
            Learn more in the documentation
          </a>
          .
        </Trans>
      </p>
      <WebhooksList list={getWebhookItems()} />
      <div>
        <Button variant="secondary" onClick={addNew}>
          {i18n._({ id: "admin.webhooks.add", message: "Add new webhook" })}
        </Button>
      </div>
    </VStack>
  )
}

export default ManageWebhooksPage
