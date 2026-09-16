import React, { useState } from "react"
import { PostStatus, Post } from "@fider/models"
import { actions, navigator, Failure } from "@fider/services"
import { Form, Modal, Button, TextArea } from "@fider/components"
import { useFider } from "@fider/hooks"
import { i18n } from "@lingui/core"
import { t } from "@lingui/core/macro"
import { Trans } from "@lingui/react/macro"

interface DeletePostModalProps {
  post: Post
  showModal: boolean
  onModalClose: () => void
  onDeleted?: () => void | Promise<void>
}

export const DeletePostModal = (props: DeletePostModalProps) => {
  const fider = useFider()
  const [text, setText] = useState("")
  const [error, setError] = useState<Failure>()
  const [submitting, setSubmitting] = useState(false)

  const handleDelete = async () => {
    if (submitting) return
    setSubmitting(true)
    setError(undefined)
    try {
      const response = await actions.deletePost(props.post.number, text)
      if (response.ok) {
        props.onModalClose()
        if (props.onDeleted) await props.onDeleted()
        else navigator.goHome()
      } else {
        setError(response.error)
      }
    } catch {
      setError({ errors: [{ message: t({ id: "showpost.action.failed", message: "Unable to save. Please check your connection and try again." }) }] })
    } finally {
      setSubmitting(false)
    }
  }

  const status = PostStatus.Get(props.post.status)
  if (!fider.session.isAuthenticated || !fider.session.user.isAdministrator || status.closed) {
    return null
  }

  const modal = (
    <Modal.Window isOpen={props.showModal} onClose={props.onModalClose} canClose={!submitting} center={false} size="large">
      <Modal.Header>
        <Trans id="action.delete">Delete</Trans>
      </Modal.Header>
      <Modal.Content>
        <Form error={error}>
          <TextArea
            field="text"
            onChange={setText}
            value={text}
            disabled={submitting}
            placeholder={i18n._({ id: "showpost.moderationpanel.text.placeholder", message: "Why are you deleting this post? (optional)" })}
          >
            <span className="text-muted">
              <Trans id="showpost.moderationpanel.text.help">
                This operation <strong>cannot</strong> be undone.
              </Trans>
            </span>
          </TextArea>
        </Form>
      </Modal.Content>

      <Modal.Footer>
        <Button variant="danger" onClick={handleDelete} disabled={submitting}>
          <Trans id="action.delete">Delete</Trans>
        </Button>
        <Button variant="tertiary" onClick={props.onModalClose} disabled={submitting}>
          <Trans id="action.cancel">Cancel</Trans>
        </Button>
      </Modal.Footer>
    </Modal.Window>
  )

  return modal
}
