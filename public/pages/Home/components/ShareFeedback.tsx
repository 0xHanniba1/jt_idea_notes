import "./ShareFeedback.scss"
import { isValidPostTitle, normalizePostTitle } from "@fider/services/postTitle"

import React, { useEffect, useRef, useState } from "react"
import { SignInControl } from "@fider/components/common/SignInControl"
import { Modal, CloseIcon, Form, Button, Input, LegalFooter } from "@fider/components/common"
import { useFider } from "@fider/hooks"
import { Trans } from "@lingui/react/macro"
import { actions, Failure, cache } from "@fider/services"
import { plainText } from "@fider/services/markdown"
import { i18n } from "@lingui/core"
import { Tag } from "@fider/models"
import { SimilarPosts } from "../components/SimilarPosts"
import CommentEditor from "@fider/components/common/form/CommentEditor"
import { clearCache, setPostPending } from "./PostCache"
import { useAttachments } from "@fider/hooks/useAttachments"

interface ShareFeedbackProps {
  isOpen: boolean
  placeholder: string
  onClose: () => void
  tags: Tag[]
}

export const ShareFeedback: React.FC<ShareFeedbackProps> = (props) => (props.isOpen ? <ShareFeedbackForm {...props} /> : null)

// Each opening owns a fresh form, including the editor and its attachments.
const ShareFeedbackForm: React.FC<ShareFeedbackProps> = (props) => {
  const fider = useFider()
  const { isOpen, onClose } = props
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose
  const [submitting, setSubmitting] = useState(false)
  const submittingRef = useRef(false)

  const [title, setTitle] = useState("")
  const [description, setDescription] = useState("")
  const { attachments, handleImageUploaded, getImageSrc, clearAttachments } = useAttachments({ maxAttachments: 3 })
  const [error, setError] = useState<Failure | undefined>(undefined)
  const titleRef = useRef<HTMLInputElement>()
  const [titleManuallyEdited, setTitleManuallyEdited] = useState(false)
  const [isInitialMount, setIsInitialMount] = useState(true)

  useEffect(() => {
    clearCache() // Discard legacy drafts persisted by earlier versions.
    setIsInitialMount(false)
  }, [])

  // Keep this entry stable while inputs or the parent render. Other history
  // fields belong to the surrounding page/drawer and must remain intact.
  useEffect(() => {
    if (!isOpen) return
    const owner = `new-post-${Date.now()}`
    window.history.pushState({ ...window.history.state, modalOpen: true, newPostOwner: owner }, "", window.location.href)
    const handlePopState = () => {
      if (window.history.state?.newPostOwner === owner) return
      // Keep the form mounted until its request settles, including browser Back.
      // The owned entry remains immediately ahead in history.
      if (submittingRef.current) window.history.forward()
      else onCloseRef.current()
    }
    window.addEventListener("popstate", handlePopState)
    return () => window.removeEventListener("popstate", handlePopState)
  }, [isOpen])

  const handleClose = () => {
    if (submittingRef.current) return
    if (window.history.state?.modalOpen && window.history.state?.newPostOwner) window.history.back()
    else onCloseRef.current()
  }

  useEffect(() => {
    if (!titleManuallyEdited && !isInitialMount && !description.startsWith("![](fider-image:attachments")) {
      // Find newline in the original markdown content for truncation
      let newlineIndex = Math.min(description.indexOf("\n"), 80)
      if (newlineIndex == -1) {
        newlineIndex = 80
      }

      // Get the truncated markdown content and convert to plain text
      const truncatedMarkdown = description.substring(0, newlineIndex)
      const autoTitle = plainText(truncatedMarkdown)

      handleTitleChange(autoTitle, false)
    }
  }, [description, titleManuallyEdited])

  useEffect(() => {
    if (!isOpen) return
    const frame = window.requestAnimationFrame(() => titleRef.current?.focus())
    return () => window.cancelAnimationFrame(frame)
  }, [isOpen])

  // Handlers for post input changes
  const handleTitleChange = (value: string, isManualEdit = true) => {
    setTitle(value)
    // If this is a manual edit (not auto-generated from description),
    // mark the title as manually edited so we stop auto-populating.
    // Once the user has touched the title we keep it manually edited even
    // if they clear it, otherwise clearing would re-trigger auto-population
    // from the description.
    if (isManualEdit) {
      setTitleManuallyEdited(true)
    }
  }

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault()
    }
  }

  const handleDescriptionChange = (value: string) => setDescription(value)

  const onSubmitFeedback = () => {
    setPostPending(true)
  }

  const clearError = () => setError(undefined)
  const hasValidTitle = isValidPostTitle(title)

  const finaliseFeedback = async () => {
    if (!hasValidTitle || fider.isReadOnly || submittingRef.current) return
    submittingRef.current = true
    setSubmitting(true)
    try {
      const result = await actions.createPost(normalizePostTitle(title), description, attachments, [])
      if (result.ok) {
        clearError()
        clearCache()
        clearAttachments()
        cache.session.set(result.data.isApproved ? "POST_CREATED_SUCCESS" : "POST_CREATED_MODERATION", "true")
        location.href = `/posts/${result.data.number}/${result.data.slug}`
      } else if (result.error) setError(result.error)
    } catch {
      setError({
        errors: [{ message: i18n._({ id: "newpost.save.failed", message: "Unable to save your idea. Your draft is still here; please try again." }) }],
      })
    } finally {
      submittingRef.current = false
      setSubmitting(false)
    }
  }

  const onSignedIn = () => finaliseFeedback()

  const handleEditorFocus = () => {
    // This function is called when the editor is focused
    // We don't need to do anything special here
  }

  return (
    <Modal.Window
      ariaLabel={i18n._({ id: "newpost.modal.title", message: "Share your idea..." })}
      className="c-share-feedback"
      isOpen={isOpen}
      onClose={handleClose}
      size="large"
      center={false}
      canClose={!submitting}
    >
      <Modal.Header>
        <div className="flex flex-items-center justify-end">{!submitting && <CloseIcon closeModal={handleClose} />}</div>
      </Modal.Header>
      <Modal.Content>
        <div className="c-share-feedback__content mb-4">
          <h1 className="text-large pb-4">
            <Trans id="newpost.modal.title">Share your idea...</Trans>
          </h1>
          <div className="c-share-feedback-form">
            <Form error={error}>
              <Input
                field="title"
                inputRef={titleRef}
                label={i18n._({ id: "label.title", message: "Title" })}
                value={title}
                disabled={fider.isReadOnly || submitting}
                onChange={handleTitleChange}
                onKeyDown={handleKeyDown}
              />
              <div className="mb-4">
                <CommentEditor
                  field="description"
                  onChange={handleDescriptionChange}
                  onFocus={handleEditorFocus}
                  initialValue={description}
                  disabled={fider.isReadOnly || submitting}
                  maxAttachments={3}
                  maxImageSizeKB={5 * 1024}
                  placeholder=""
                  onImageUploaded={handleImageUploaded}
                  onGetImageSrc={getImageSrc}
                />
              </div>
              <SimilarPosts title={title} tags={props.tags} />
            </Form>
          </div>
        </div>
        {/* For unauthenticated users, always show the sign-in control */}
        {!fider.session.isAuthenticated ? (
          <div className="c-share-feedback__content">
            <div className="c-share-feedback-signin">
              <h2 className="text-title text-center mb-4">
                <Trans id="action.publish">Publish</Trans>
              </h2>
              <SignInControl onSubmit={onSubmitFeedback} onSignedIn={onSignedIn} redirectTo="/" />
            </div>
          </div>
        ) : (
          <div className="c-share-feedback__content">
            <div className="c-share-feedback-signin">
              <div className="flex justify-center">
                <Button variant="primary" disabled={!hasValidTitle || fider.isReadOnly || submitting} onClick={finaliseFeedback}>
                  <Trans id="action.publish">Publish</Trans>
                </Button>
              </div>
            </div>
          </div>
        )}
        {!fider.session.isAuthenticated ? <LegalFooter /> : null}
      </Modal.Content>
    </Modal.Window>
  )
}
