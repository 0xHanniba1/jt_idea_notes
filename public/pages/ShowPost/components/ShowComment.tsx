import React, { useEffect, useRef, useState } from "react"
import { Comment, Post } from "@fider/models"
import { Reactions, Avatar, UserName, Moment, Form, Button, Markdown, Modal, Dropdown, Icon } from "@fider/components"
import { HStack } from "@fider/components/layout"
import { formatDate, Failure, actions, notify, copyToClipboard, classSet, clearUrlHash } from "@fider/services"
import { useFider } from "@fider/hooks"
import IconDotsHorizontal from "@fider/assets/images/heroicons-dots-horizontal.svg"
import { t } from "@lingui/core/macro"
import { Trans } from "@lingui/react/macro"
import CommentEditor from "@fider/components/common/form/CommentEditor"
import { useAttachments } from "@fider/hooks/useAttachments"

import "./ShowComment.scss"

interface ShowCommentProps {
  post: Post
  comment: Comment
  highlighted?: boolean
  onToggleReaction?: () => void
  onDataChanged?: () => void | Promise<void>
}

export const ShowComment = (props: ShowCommentProps) => {
  const fider = useFider()
  const node = useRef<HTMLDivElement | null>(null)
  const [isEditing, setIsEditing] = useState(false)
  const [newContent, setNewContent] = useState<string>(props.comment.content)
  const [isDeleteConfirmationModalOpen, setIsDeleteConfirmationModalOpen] = useState(false)
  const { attachments, handleImageUploaded, getImageSrc, clearAttachments } = useAttachments({
    maxAttachments: 2,
  })
  const [localReactionCounts, setLocalReactionCounts] = useState(props.comment.reactionCounts)
  const emojiSelectorRef = useRef<HTMLDivElement>(null)

  const [error, setError] = useState<Failure>()
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    setLocalReactionCounts(props.comment.reactionCounts)
  }, [props.comment.reactionCounts])

  const mutationFailed = () =>
    setError({ errors: [{ message: t({ id: "showpost.action.failed", message: "Unable to save. Please check your connection and try again." }) }] })
  const changed = async () => {
    if (props.onDataChanged) await props.onDataChanged()
    else location.reload()
  }

  const handleClick = (e: MouseEvent) => {
    if (node.current == null || !node.current.contains(e.target as Node)) {
      clearUrlHash()
    }
  }

  useEffect(() => {
    if (props.highlighted) {
      document.addEventListener("mousedown", handleClick)
      return () => {
        document.removeEventListener("mousedown", handleClick)
      }
    }
  }, [props.highlighted])

  const canEditComment = (): boolean => {
    if (fider.session.isAuthenticated) {
      return fider.session.user.isCollaborator || props.comment.user.id === fider.session.user.id
    }
    return false
  }

  const clearError = () => setError(undefined)

  const cancelEdit = async () => {
    setIsEditing(false)
    setNewContent(props.comment.content)
    clearAttachments()
    clearError()
  }

  const saveEdit = async () => {
    if (submitting) return
    setSubmitting(true)
    clearError()
    try {
      const response = await actions.updateComment(props.post.number, props.comment.id, newContent, attachments)
      if (response.ok) {
        setIsEditing(false)
        clearAttachments()
        await changed()
      } else {
        setError(response.error)
      }
    } catch {
      mutationFailed()
    } finally {
      setSubmitting(false)
    }
  }

  const closeModal = () => setIsDeleteConfirmationModalOpen(false)

  const deleteComment = async () => {
    if (submitting) return
    setSubmitting(true)
    clearError()
    try {
      const response = await actions.deleteComment(props.post.number, props.comment.id)
      if (response.ok) {
        closeModal()
        await changed()
      } else setError(response.error)
    } catch {
      mutationFailed()
    } finally {
      setSubmitting(false)
    }
  }

  const toggleReaction = async (emoji: string) => {
    if (submitting) return
    setSubmitting(true)
    try {
      const response = await actions.toggleCommentReaction(props.post.number, props.comment.id, emoji)
      if (response.ok) {
        const added = response.data.added
        setLocalReactionCounts((prevCounts) => {
          const newCounts = [...(prevCounts ?? [])]
          const reactionIndex = newCounts.findIndex((r) => r.emoji === emoji)
          if (reactionIndex !== -1) {
            const newCount = added ? newCounts[reactionIndex].count + 1 : newCounts[reactionIndex].count - 1
            if (newCount === 0) newCounts.splice(reactionIndex, 1)
            else newCounts[reactionIndex] = { ...newCounts[reactionIndex], count: newCount, includesMe: added }
          } else if (added) newCounts.push({ emoji, count: 1, includesMe: true })
          return newCounts
        })
        props.onToggleReaction?.()
      } else setError(response.error)
    } catch {
      mutationFailed()
    } finally {
      setSubmitting(false)
    }
  }

  const onActionSelected = (action: string) => () => {
    if (action === "copylink") {
      const hash = `#comment-${props.comment.id}`
      if (window.history.state?.jtPostOverlay?.kind === "post") {
        window.history.replaceState(window.history.state, "", `${location.pathname}${location.search}${hash}`)
        window.dispatchEvent(new HashChangeEvent("hashchange"))
      } else {
        window.location.hash = hash
      }
      copyToClipboard(window.location.href).then(
        () => notify.success(t({ id: "showpost.comment.copylink.success", message: "Successfully copied comment link to clipboard" })),
        () => notify.error(t({ id: "showpost.comment.copylink.error", message: "Could not copy comment link, please copy page URL" }))
      )
    } else if (action === "edit") {
      setNewContent(props.comment.content)
      clearAttachments()
      setIsEditing(true)
      clearError()
    } else if (action === "delete") {
      setIsDeleteConfirmationModalOpen(true)
    }
  }

  const modal = () => {
    return (
      <Modal.Window isOpen={isDeleteConfirmationModalOpen} onClose={closeModal} canClose={!submitting} center={false} size="small">
        <Modal.Header>
          <Trans id="modal.deletecomment.header">Delete Comment</Trans>
        </Modal.Header>
        <Modal.Content>
          <Form error={error}>
            <p>
              <Trans id="modal.deletecomment.text">
                This process is irreversible. <strong>Are you sure?</strong>
              </Trans>
            </p>
          </Form>
        </Modal.Content>

        <Modal.Footer>
          <Button variant="danger" onClick={deleteComment} disabled={submitting}>
            <Trans id="action.delete">Delete</Trans>
          </Button>
          <Button variant="tertiary" onClick={closeModal} disabled={submitting}>
            <Trans id="action.cancel">Cancel</Trans>
          </Button>
        </Modal.Footer>
      </Modal.Window>
    )
  }

  const comment = props.comment

  const editedMetadata = !!comment.editedAt && !!comment.editedBy && (
    <span data-tooltip={`This comment has been edited by ${comment.editedBy.name} on ${formatDate(fider.currentLocale, comment.editedAt)}`}>· edited</span>
  )

  const classList = classSet({
    "c-comment__content": true,
    "c-comment__content--highlighted": props.highlighted,
  })

  return (
    <div id={`comment-${comment.id}`} className="c-comment">
      {modal()}
      <HStack spacing={4} align="start">
        <Avatar user={comment.user} size="large" />
        <div ref={node} className={`c-comment__card ${classList}`}>
          <div className="mb-1">
            <HStack justify="between">
              <HStack>
                <UserName user={comment.user} /> <span className="text-sm text-gray-400">•</span>
                <div className="text-xs">
                  <Moment locale={fider.currentLocale} date={comment.createdAt} /> {editedMetadata}
                </div>
              </HStack>
              {!isEditing && (
                <Dropdown position="left" renderHandle={<Icon sprite={IconDotsHorizontal} width="16" height="16" />}>
                  <Dropdown.ListItem onClick={onActionSelected("copylink")}>
                    <Trans id="action.copylink">Copy link</Trans>
                  </Dropdown.ListItem>
                  {canEditComment() && (
                    <>
                      <Dropdown.Divider />
                      <Dropdown.ListItem onClick={onActionSelected("edit")}>
                        <Trans id="action.edit">Edit</Trans>
                      </Dropdown.ListItem>
                      <Dropdown.ListItem onClick={onActionSelected("delete")} className="text-red-700">
                        <Trans id="action.delete">Delete</Trans>
                      </Dropdown.ListItem>
                    </>
                  )}
                </Dropdown>
              )}
            </HStack>
          </div>
          <div>
            {isEditing ? (
              <Form error={error}>
                <CommentEditor
                  field="content"
                  disabled={!fider.session.isAuthenticated || submitting}
                  initialValue={newContent}
                  onChange={setNewContent}
                  placeholder={comment.content}
                  maxAttachments={2}
                  maxImageSizeKB={5 * 1024}
                  maxLength={4000}
                  onGetImageSrc={getImageSrc}
                  onImageUploaded={handleImageUploaded}
                />
                <div className="mt-2">
                  <Button size="small" onClick={saveEdit} variant="primary" disabled={newContent.length > 4000 || submitting}>
                    <Trans id="action.save">Save</Trans>
                  </Button>
                  <Button variant="tertiary" size="small" onClick={cancelEdit} disabled={submitting}>
                    <Trans id="action.cancel">Cancel</Trans>
                  </Button>
                </div>
              </Form>
            ) : (
              <>
                {error && !isDeleteConfirmationModalOpen && <Form error={error} />}
                <Markdown text={comment.content} style="full" />

                <Reactions reactions={localReactionCounts} emojiSelectorRef={emojiSelectorRef} toggleReaction={toggleReaction} />
              </>
            )}
          </div>
        </div>
      </HStack>
    </div>
  )
}
