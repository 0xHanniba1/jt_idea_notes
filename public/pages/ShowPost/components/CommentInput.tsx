import React, { useCallback, useState, useEffect } from "react"

import { Post } from "@fider/models"
import { Avatar, Button, Form } from "@fider/components"
import { SignInModal } from "@fider/components"

import { cache, actions, Failure, Fider } from "@fider/services"
import { HStack } from "@fider/components/layout"
import { i18n } from "@lingui/core"
import { t } from "@lingui/core/macro"
import { Trans } from "@lingui/react/macro"

import { useFider } from "@fider/hooks"
import { useAttachments } from "@fider/hooks/useAttachments"
import CommentEditor from "@fider/components/common/form/CommentEditor"

interface CommentInputProps {
  post: Post
  onSubmitted?: () => void | Promise<void>
}

const CACHE_TITLE_KEY = "CommentInput-Comment-Title-"
const CACHE_ATTACHMENTS_KEY = "CommentInput-Comment-Attachments-"

export const CommentInput = (props: CommentInputProps) => {
  const getCacheKey = (cachePrefix: string) => `${cachePrefix}${props.post.id}`

  const getContentFromCache = () => {
    return cache.session.get(getCacheKey(CACHE_TITLE_KEY))
  }

  const COMMENT_MAX_LENGTH = 4000

  const fider = useFider()
  const [isSignInModalOpen, setIsSignInModalOpen] = useState(false)
  const [error, setError] = useState<Failure | undefined>(undefined)
  const [isClient, setIsClient] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [editorVersion, setEditorVersion] = useState(0)
  const [contentLength, setContentLength] = useState((cache.session.get(`${CACHE_TITLE_KEY}${props.post.id}`) ?? "").length)

  // Use the attachments hook
  const { attachments, handleImageUploaded, getImageSrc, clearAttachments } = useAttachments({
    cacheKey: getCacheKey(CACHE_ATTACHMENTS_KEY),
    maxAttachments: 2,
  })

  // Check if we're running on the client after component mounts
  useEffect(() => {
    setIsClient(true)
  }, [])

  const hideModal = () => setIsSignInModalOpen(false)
  const clearError = () => setError(undefined)

  const submit = async () => {
    if (submitting) return
    clearError()
    setSubmitting(true)
    try {
      const result = await actions.createComment(props.post.number, getContentFromCache() || "", attachments)
      if (result.ok) {
        clearAttachments()
        cache.session.remove(getCacheKey(CACHE_TITLE_KEY))
        setContentLength(0)
        setEditorVersion((version) => version + 1)
        if (props.onSubmitted) await props.onSubmitted()
        else location.reload()
      } else {
        setError(result.error)
      }
    } catch {
      setError({ errors: [{ message: t({ id: "showpost.action.failed", message: "Unable to save. Please check your connection and try again." }) }] })
    } finally {
      setSubmitting(false)
    }
  }

  const editorFocused = () => {
    if (!fider.session.isAuthenticated) {
      setIsSignInModalOpen(true)
    }
  }

  const commentChanged = useCallback(
    (value: string): void => {
      cache.session.set(getCacheKey(CACHE_TITLE_KEY), value)
      setContentLength(value.length)
    },
    [props.post.id]
  )

  const isOverLimit = contentLength > COMMENT_MAX_LENGTH

  return (
    <>
      <SignInModal isOpen={isSignInModalOpen} onClose={hideModal} />
      <HStack spacing={4} className="c-comment-input" align="start">
        {Fider.session.isAuthenticated && <Avatar user={Fider.session.user} size="large" />}
        <div className="c-comment-input-card">
          <Form error={error}>
            {isClient ? (
              <>
                <CommentEditor
                  key={editorVersion}
                  field="content"
                  disabled={!Fider.session.isAuthenticated || submitting}
                  onChange={commentChanged}
                  onFocus={editorFocused}
                  initialValue={getContentFromCache()}
                  placeholder={i18n._({ id: "showpost.commentinput.placeholder", message: "Leave a comment" })}
                  maxAttachments={2}
                  maxImageSizeKB={5 * 1024}
                  maxLength={COMMENT_MAX_LENGTH}
                  onGetImageSrc={getImageSrc}
                  onImageUploaded={handleImageUploaded}
                />

                <Button
                  disabled={!fider.session.isAuthenticated || isOverLimit || submitting || contentLength === 0}
                  variant="primary"
                  onClick={submit}
                  className="mt-4"
                >
                  <Trans id="action.postcomment">Post</Trans>
                </Button>
              </>
            ) : (
              <div className="comment-input-placeholder p-2">{i18n._({ id: "showpost.commentinput.placeholder", message: "Leave a comment" })}</div>
            )}
          </Form>
        </div>
      </HStack>
    </>
  )
}
