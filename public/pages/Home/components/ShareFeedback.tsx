import "./ShareFeedback.scss"

import React, { useEffect, useRef, useState } from "react"
import { SignInControl } from "@fider/components/common/SignInControl"
import { Modal, CloseIcon, Form, Button, Input, LegalFooter } from "@fider/components/common"
import { useFider } from "@fider/hooks"
import { Trans } from "@lingui/react/macro"
import { actions, Failure, querystring, cache } from "@fider/services"
import { plainText } from "@fider/services/markdown"
import { i18n } from "@lingui/core"
import { Tag } from "@fider/models"
import { SimilarPosts } from "../components/SimilarPosts"
import { TagsSelect } from "@fider/components/common/TagsSelect"
import CommentEditor from "@fider/components/common/form/CommentEditor"
import {
  CACHE_KEYS,
  clearCache,
  clearCachedDescription,
  getCachedDescription,
  getCachedTags,
  getCachedTitle,
  setCachedDescription,
  setCachedTags,
  setCachedTitle,
  setPostPending,
} from "./PostCache"
import { useAttachments } from "@fider/hooks/useAttachments"

interface ShareFeedbackProps {
  isOpen: boolean
  placeholder: string
  onClose: () => void
  tags: Tag[]
}

export const ShareFeedback: React.FC<ShareFeedbackProps> = (props) => {
  const fider = useFider()
  const { isOpen, onClose } = props
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose
  const [submitting, setSubmitting] = useState(false)
  const submittingRef = useRef(false)

  const getTagsCachedValue = (): Tag[] => {
    if (!canEditTags) {
      return []
    }

    const cacheValue = getCachedTags()
    const urlValue = querystring.get("tags")
    const combined = [...cacheValue, ...urlValue.split(",")]
    const tagsAsStrings = Array.from(new Set(combined.map((s) => s.trim()).filter((s) => s.length > 0)))

    return props.tags.filter((tag) => tagsAsStrings.includes(tag.slug))
  }

  const getTitleManuallyEditedValue = (): boolean => {
    // If the cached title deviates from the description, it means the user manually edited it
    return getCachedTitle() !== getCachedDescription()
  }

  const canEditTags = fider.settings.postWithTags && props.tags.length > 0

  const descriptionTemplate = fider.session.tenant.descriptionTemplate || ""
  const hasCachedDraft = getCachedDescription().trim() !== ""
  const prefillTemplate = !hasCachedDraft && descriptionTemplate !== ""

  const [title, setTitle] = useState(getCachedTitle())
  const [description, setDescription] = useState(prefillTemplate ? descriptionTemplate : getCachedDescription())
  const { attachments, handleImageUploaded, getImageSrc, clearAttachments } = useAttachments({
    cacheKey: CACHE_KEYS.ATTACHMENT,
    useLocalStorage: true,
    maxAttachments: 3,
  })
  const [tags, setTags] = useState(getTagsCachedValue())
  const [error, setError] = useState<Failure | undefined>(undefined)
  const titleRef = useRef<HTMLInputElement>()
  const editorRef = useRef<HTMLDivElement>(null)
  const [titleManuallyEdited, setTitleManuallyEdited] = useState(prefillTemplate ? true : getTitleManuallyEditedValue())
  const [isInitialMount, setIsInitialMount] = useState(true)

  useEffect(() => {
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
    if (isOpen && editorRef.current) {
      // Small delay to ensure modal is fully rendered
      const frame = window.requestAnimationFrame(() => {
        // Focus the editor
        const editorContent = editorRef.current?.querySelector(".ProseMirror")
        if (editorContent) {
          ;(editorContent as HTMLElement).focus()
        }
      })
      return () => window.cancelAnimationFrame(frame)
    }
  }, [isOpen])

  // Handlers for post input changes
  const handleTitleChange = (value: string, isManualEdit = true) => {
    setTitle(value)
    setCachedTitle(value)
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

  const handleTagsChanged = (newTags: Tag[]) => {
    if (submittingRef.current) return
    setCachedTags(newTags.map((tag) => tag.slug))
    setTags(newTags)
  }

  const handleDescriptionChange = (value: string) => {
    // If the description is emptied (e.g. the prefilled template is deleted),
    // remove it from the cache so reopening the modal prefills the template again
    // instead of restoring an empty draft.
    if (value.trim() === "") {
      clearCachedDescription()
    } else {
      setCachedDescription(value)
    }
    setDescription(value)
  }

  const onSubmitFeedback = () => {
    setPostPending(true)
  }

  const clearError = () => setError(undefined)

  const finaliseFeedback = async () => {
    if (!title || submittingRef.current) return
    submittingRef.current = true
    setSubmitting(true)
    try {
      const result = await actions.createPost(
        title,
        description,
        attachments,
        tags.map((tag) => tag.slug)
      )
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

  const showSubmitButton = title.replace(/\s+/g, " ").trim().length > 9

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
              <div ref={editorRef} className="mb-4">
                <CommentEditor
                  field="description"
                  onChange={handleDescriptionChange}
                  onFocus={handleEditorFocus}
                  initialValue={description}
                  disabled={fider.isReadOnly || submitting}
                  maxAttachments={3}
                  maxImageSizeKB={5 * 1024}
                  placeholder={i18n._({
                    id: "newpost.modal.description.placeholder",
                    message: "Tell us about it. Explain it fully, don't hold back, the more information the better.",
                  })}
                  onImageUploaded={handleImageUploaded}
                  onGetImageSrc={getImageSrc}
                />
              </div>
              <SimilarPosts title={title} tags={props.tags} />
              <Input
                field="title"
                inputRef={titleRef}
                maxLength={255}
                label={i18n._({ id: "newpost.modal.title.label", message: "Give your idea a title" })}
                value={title}
                disabled={fider.isReadOnly || submitting}
                onChange={handleTitleChange}
                onKeyDown={handleKeyDown}
                placeholder={i18n._({ id: "newpost.modal.title.placeholder", message: "Something short and snappy, sum it up in a few words" })}
              />
              {canEditTags && (
                <div className="c-form-field">
                  <label>
                    <Trans id="label.tags">Tags</Trans>
                  </label>
                  <fieldset className="c-share-feedback__tags" disabled={submitting}>
                    <TagsSelect tags={props.tags} selectionChanged={handleTagsChanged} selected={tags} alwaysEditing={true} canEdit={!submitting} />
                  </fieldset>
                </div>
              )}
            </Form>
          </div>
        </div>
        {/* For unauthenticated users, always show the sign-in control */}
        {!fider.session.isAuthenticated ? (
          <div className="c-share-feedback__content">
            <div className="c-share-feedback-signin">
              <h2 className="text-title text-center mb-4">
                <Trans id="newpost.modal.submit">Submit your idea</Trans>
              </h2>
              <SignInControl onSubmit={onSubmitFeedback} onSignedIn={onSignedIn} redirectTo="/" />
            </div>
          </div>
        ) : (
          /* For authenticated users, only show the submit button container when title is long enough */
          showSubmitButton && (
            <div className="c-share-feedback__content">
              <div className="c-share-feedback-signin">
                <div className="flex justify-center">
                  <Button variant="primary" disabled={submitting} onClick={finaliseFeedback}>
                    <Trans id="newpost.modal.submit">Submit your idea</Trans>
                  </Button>
                </div>
              </div>
            </div>
          )
        )}
        {!fider.session.isAuthenticated ? <LegalFooter /> : null}
      </Modal.Content>
    </Modal.Window>
  )
}
