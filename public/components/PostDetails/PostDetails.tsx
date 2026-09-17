import "./PostDetails.scss"
import { isValidPostTitle, normalizePostTitle } from "@fider/services/postTitle"

import React, { useState, useEffect, useCallback, useRef } from "react"

import { Comment, Post, Tag, CurrentUser, PostStatus } from "@fider/models"
import { actions, cache, clearUrlHash, Failure, Fider, notify, timeAgo, copyToClipboard, navigator } from "@fider/services"
import IconDuplicate from "@fider/assets/images/heroicons-duplicate.svg"
import { i18n } from "@lingui/core"
import IconRSS from "@fider/assets/images/heroicons-rss.svg"
import IconPencil from "@fider/assets/images/heroicons-pencil-alt.svg"
import IconChat from "@fider/assets/images/heroicons-chat-alt-2.svg"

import { ResponseDetails, Button, UserName, Moment, Markdown, Input, Form, Icon, Avatar, RSSModal, ResponseLozenge } from "@fider/components"
import { CommentInput } from "@fider/pages/ShowPost/components/CommentInput"
import { ShowComment } from "@fider/pages/ShowPost/components/ShowComment"
import CommentEditor from "@fider/components/common/form/CommentEditor"

import IconX from "@fider/assets/images/heroicons-x.svg"
import IconThumbsUp from "@fider/assets/images/heroicons-thumbsup.svg"
import IconTrash from "@fider/assets/images/heroicons-trash.svg"
import { HStack, VStack } from "@fider/components/layout"
import { Trans } from "@lingui/react/macro"
import { DeletePostModal } from "@fider/pages/ShowPost/components/DeletePostModal"
import { ResponseModal } from "@fider/pages/ShowPost/components/ResponseModal"
import { TagsPanel } from "@fider/pages/ShowPost/components/TagsPanel"
import { ActionButton } from "@fider/pages/ShowPost/components/ActionButton"
import { t } from "@lingui/macro"
import { useFider } from "@fider/hooks"
import { useAttachments } from "@fider/hooks/useAttachments"
import { FollowButton } from "@fider/pages/ShowPost/components/FollowButton"

interface PostDetailsProps {
  postNumber: number
  onDataChanged?: () => void
  onDeleted?: () => void | Promise<void>
  onCloseGuardChange?: (guard: (() => boolean) | null) => void
  // Optional initial data for SSR
  initialPost?: Post
  initialSubscribed?: boolean
  initialComments?: Comment[]
  initialTags?: Tag[]
  initialAttachments?: string[]
}

const oneHour = 3600
const canEditPost = (user: CurrentUser, post: Post) => {
  if (user.isCollaborator) {
    return true
  }

  return user.id === post.user.id && timeAgo(post.createdAt) <= oneHour
}

const PostMetaInfo = ({ post, locale }: { post: Post; locale: string }) => (
  <HStack spacing={2} align="center">
    <Avatar user={post.user} size="small" />
    <div className="text-sm text-gray-600">
      <Trans id="showpost.postedby">Posted by</Trans> <UserName user={post.user} />
    </div>
    <span className="text-sm text-gray-400">•</span>
    <Moment className="text-sm text-gray-600" locale={locale} date={post.createdAt} />
    <span className="text-sm text-gray-400">•</span>
    <ResponseLozenge status={post.status} response={post.response} size="xsmall" />
  </HStack>
)

type LoadError = "unauthenticated" | "forbidden" | "missing" | "network"

class DetailReadError extends Error {
  constructor(public status: number) {
    super(`Unable to read record (${status})`)
  }
}

async function readDetail<T>(url: string, signal: AbortSignal): Promise<T> {
  const response = await fetch(url, { signal, credentials: "same-origin", headers: { Accept: "application/json" } })
  if (!response.ok) throw new DetailReadError(response.status)
  return response.json()
}

// A new record gets a separate component lifetime, including its editor and attachments.
export const PostDetails: React.FC<PostDetailsProps> = (props) => <PostDetailsContent key={props.postNumber} {...props} />

const PostDetailsContent: React.FC<PostDetailsProps> = (props) => {
  const [post, setPost] = useState<Post | null>(props.initialPost || null)
  const [subscribed, setSubscribed] = useState(props.initialSubscribed || false)
  const [comments, setComments] = useState<Comment[]>(props.initialComments || [])
  const [tags, setTags] = useState<Tag[]>(props.initialTags || [])
  const [loading, setLoading] = useState(!props.initialPost)
  const [commentsLoaded, setCommentsLoaded] = useState(!!props.initialPost)
  const [loadError, setLoadError] = useState<LoadError>()
  const [editMode, setEditMode] = useState(false)
  const [saving, setSaving] = useState(false)
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [isRSSModalOpen, setIsRSSModalOpen] = useState(false)
  const [showResponseModal, setShowResponseModal] = useState(false)
  const [newTitle, setNewTitle] = useState(post?.title || "")
  const [newDescription, setNewDescription] = useState(post?.description || "")
  const { attachments, handleImageUploaded, getImageSrc, clearAttachments } = useAttachments({ maxAttachments: 3 })
  const [highlightedComment, setHighlightedComment] = useState<number>()
  const [error, setError] = useState<Failure>()
  const fider = useFider()
  const mounted = useRef(true)
  const request = useRef<AbortController>()
  const securityExit = useRef(false)
  const editing = useRef(editMode)
  editing.current = editMode
  const hasUnsavedChanges = editMode && !!post && (newTitle !== post.title || newDescription !== post.description || attachments.length > 0)
  const dirty = useRef(false)
  dirty.current = hasUnsavedChanges || saving
  const guardCallback = useRef(props.onCloseGuardChange)
  guardCallback.current = props.onCloseGuardChange

  const confirmLeave = useCallback(() => {
    if (securityExit.current || !dirty.current) return true
    if (saving) return false
    const confirmed = window.confirm(t({ id: "showpost.edit.discard", message: "Discard your unsaved changes? Cancel to keep editing." }))
    if (confirmed) dirty.current = false
    return confirmed
  }, [saving])

  useEffect(() => {
    props.onCloseGuardChange?.(hasUnsavedChanges || saving ? confirmLeave : null)
    return () => props.onCloseGuardChange?.(null)
  }, [hasUnsavedChanges, saving, confirmLeave, props.onCloseGuardChange])

  useEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (securityExit.current || !dirty.current) return
      event.preventDefault()
      event.returnValue = ""
    }
    const followLink = (event: MouseEvent) => {
      const link = (event.target as Element).closest?.("a[href]") as HTMLAnchorElement | null
      if (
        !link ||
        event.defaultPrevented ||
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey ||
        link.target === "_blank" ||
        link.hasAttribute("download")
      )
        return
      const destination = new URL(link.href, window.location.href)
      if (destination.pathname === "/signout") {
        securityExit.current = true
        guardCallback.current?.(null)
        return
      }
      if (destination.origin === location.origin && destination.pathname === location.pathname && destination.search === location.search) return
      if (!confirmLeave()) {
        event.preventDefault()
        event.stopPropagation()
      } else {
        // The click has already confirmed leaving; avoid a second native unload prompt.
        dirty.current = false
      }
    }
    window.addEventListener("beforeunload", beforeUnload)
    document.addEventListener("click", followLink, true)
    return () => {
      window.removeEventListener("beforeunload", beforeUnload)
      document.removeEventListener("click", followLink, true)
    }
  }, [confirmLeave])

  const revokeAccess = useCallback(
    (status: number) => {
      securityExit.current = true
      dirty.current = false
      guardCallback.current?.(null)
      request.current?.abort()
      setPost(null)
      setComments([])
      setTags([])
      setSubscribed(false)
      setNewTitle("")
      setNewDescription("")
      clearAttachments()
      setEditMode(false)
      setShowDeleteModal(false)
      setShowResponseModal(false)
      setIsRSSModalOpen(false)
      setLoading(false)
      setLoadError(status === 401 ? "unauthenticated" : "forbidden")
    },
    [clearAttachments]
  )

  const loadDetails = useCallback(async () => {
    request.current?.abort()
    const controller = new AbortController()
    request.current = controller
    setLoading(true)
    setLoadError(undefined)
    try {
      const [nextPost, nextComments, nextTags, subscription] = await Promise.all([
        readDetail<Post>(`/api/v1/posts/${props.postNumber}`, controller.signal),
        readDetail<Comment[]>(`/api/v1/posts/${props.postNumber}/comments`, controller.signal),
        readDetail<Tag[]>("/api/v1/tags", controller.signal),
        fider.session.isAuthenticated
          ? readDetail<{ subscribed: boolean }>(`/api/v1/posts/${props.postNumber}/subscription`, controller.signal)
          : Promise.resolve({ subscribed: false }),
      ])
      if (!mounted.current || controller.signal.aborted) return
      if (nextPost.number !== props.postNumber || !Array.isArray(nextComments) || !Array.isArray(nextTags)) throw new Error("Invalid record response")
      securityExit.current = false
      setPost(nextPost)
      setComments(nextComments)
      setCommentsLoaded(true)
      setTags(nextTags)
      setSubscribed(subscription.subscribed)
      if (!editing.current) {
        setNewTitle(nextPost.title)
        setNewDescription(nextPost.description)
      }
    } catch (failure) {
      if (!mounted.current || controller.signal.aborted) return
      const status = failure instanceof DetailReadError ? failure.status : 0
      if (status === 401 || status === 403) {
        revokeAccess(status)
        if (status === 401 && fider.session.isAuthenticated) {
          const redirect = encodeURIComponent(window.location.pathname + window.location.search)
          window.location.href = `/signin?redirect=${redirect}`
        }
      } else {
        setLoadError(status === 404 ? "missing" : "network")
        if (status === 404) {
          dirty.current = false
          guardCallback.current?.(null)
          setPost(null)
          setComments([])
          setEditMode(false)
        }
      }
    } finally {
      if (mounted.current && request.current === controller) setLoading(false)
    }
  }, [props.postNumber, fider.session.isAuthenticated, revokeAccess])

  useEffect(() => {
    mounted.current = true
    if (!props.initialPost) void loadDetails()
    const accessDenied = (event: Event) => revokeAccess((event as CustomEvent<{ status: number }>).detail.status)
    window.addEventListener("fider:access-denied", accessDenied)
    return () => {
      mounted.current = false
      request.current?.abort()
      guardCallback.current?.(null)
      window.removeEventListener("fider:access-denied", accessDenied)
    }
  }, [props.initialPost, loadDetails, revokeAccess])

  const handleHashChange = useCallback(
    (e?: Event) => {
      if (!commentsLoaded || loadError) return
      const hash = window.location.hash
      const result = /#comment-([0-9]+)/.exec(hash)

      let newHighlightedComment
      if (result === null) {
        newHighlightedComment = undefined
      } else {
        const id = parseInt(result[1])
        if (comments.map((comment) => comment.id).includes(id)) {
          newHighlightedComment = id
          document.getElementById(`comment-${id}`)?.scrollIntoView({ block: "nearest" })
        } else {
          if (e?.cancelable) {
            e.preventDefault()
          } else {
            clearUrlHash(true)
          }
          notify.error(<Trans id="showpost.comment.unknownhighlighted">Unknown comment ID #{id}</Trans>)
          newHighlightedComment = undefined
        }
      }
      setHighlightedComment(newHighlightedComment)
    },
    [comments, commentsLoaded, loadError]
  )

  useEffect(() => {
    handleHashChange()
    window.addEventListener("hashchange", handleHashChange)
    return () => {
      window.removeEventListener("hashchange", handleHashChange)
    }
  }, [handleHashChange])

  useEffect(() => {
    const showSuccess = cache.session.get("POST_CREATED_SUCCESS")
    const showModeration = cache.session.get("POST_CREATED_MODERATION")
    const showCommentModeration = cache.session.get("COMMENT_CREATED_MODERATION")

    if (showSuccess) {
      cache.session.remove("POST_CREATED_SUCCESS")
      notify.success(t({ id: "mysettings.notification.event.newpostcreated", message: "Your idea has been added 👍" }))
    }

    if (showModeration) {
      cache.session.remove("POST_CREATED_MODERATION")
      notify.success(t({ id: "showpost.moderation.postsuccess", message: "Your idea is awaiting moderation 📝" }))
    }

    if (showCommentModeration) {
      cache.session.remove("COMMENT_CREATED_MODERATION")
      notify.success(t({ id: "showpost.moderation.commentsuccess", message: "Your comment is awaiting moderation 📝" }))
    }
  }, [])

  const handleDataChanged = async () => {
    if (!mounted.current || securityExit.current) return
    props.onDataChanged?.()
    await loadDetails()
  }

  const handleResponded = async () => {
    setShowResponseModal(false)
    await handleDataChanged()
  }

  const handleDeleted = async () => {
    if (!mounted.current) return
    dirty.current = false
    guardCallback.current?.(null)
    if (props.onDeleted) await props.onDeleted()
    else navigator.goHome()
  }

  const saveChanges = async () => {
    if (!post || saving || Fider.isReadOnly || !isValidPostTitle(newTitle)) return
    setSaving(true)
    setError(undefined)
    try {
      const result = await actions.updatePost(post.number, normalizePostTitle(newTitle), newDescription, attachments)
      if (!mounted.current || securityExit.current) return
      if (result.ok) {
        dirty.current = false
        guardCallback.current?.(null)
        setEditMode(false)
        editing.current = false
        clearAttachments()
        setPost({ ...post, title: normalizePostTitle(newTitle), description: newDescription })
        notify.success(<Trans id="showpost.save.success">Post updated successfully</Trans>)
        await handleDataChanged()
      } else {
        setError(result.error)
      }
    } catch {
      if (mounted.current)
        setError({ errors: [{ message: t({ id: "showpost.action.failed", message: "Unable to save. Please check your connection and try again." }) }] })
    } finally {
      if (mounted.current) setSaving(false)
    }
  }

  const canDeletePost = () => {
    if (!post) return false
    const status = PostStatus.Get(post.status)
    if (!Fider.session.isAuthenticated || !Fider.session.user.isAdministrator || status.closed) {
      return false
    }
    return true
  }

  const cancelEdit = () => {
    if (!confirmLeave()) return
    setError(undefined)
    setEditMode(false)
    clearAttachments()
    setNewTitle(post?.title || "")
    setNewDescription(post?.description || "")
  }

  const startEdit = () => {
    setNewTitle(post?.title || "")
    setNewDescription(post?.description || "")
    setError(undefined)
    clearAttachments()
    setEditMode(true)
  }

  const handleDescriptionChange = (value: string) => {
    setNewDescription(value)
  }

  const moderatePost = async (approve: boolean) => {
    if (!post || saving || Fider.isReadOnly || !isValidPostTitle(newTitle)) return
    setSaving(true)
    try {
      const result = await (approve ? actions.approvePost(post.id) : actions.declinePost(post.id))
      if (!mounted.current || securityExit.current) return
      if (result.ok) {
        if (approve) {
          notify.success(<Trans id="showpost.moderation.approved">Post approved successfully</Trans>)
          await handleDataChanged()
        } else {
          notify.success(<Trans id="showpost.moderation.declined">Post declined successfully</Trans>)
          await handleDeleted()
        }
      } else {
        notify.error(
          approve ? (
            <Trans id="showpost.moderation.approveerror">Failed to approve post</Trans>
          ) : (
            <Trans id="showpost.moderation.declineerror">Failed to decline post</Trans>
          )
        )
      }
    } catch {
      notify.error(t({ id: "showpost.action.failed", message: "Unable to save. Please check your connection and try again." }))
    } finally {
      if (mounted.current) setSaving(false)
    }
  }
  const handleApprovePost = () => moderatePost(true)
  const handleDeclinePost = () => moderatePost(false)

  const onActionSelected = (action: "copy" | "delete" | "status" | "feed" | "edit") => () => {
    if (action === "copy") {
      copyToClipboard(window.location.href).then(
        () => notify.success(<Trans id="showpost.copylink.success">Link copied to clipboard</Trans>),
        () => notify.error(<Trans id="showpost.copylink.error">Could not copy the link. Please copy the page URL.</Trans>)
      )
    } else if (action === "delete") {
      setShowDeleteModal(true)
    } else if (action === "status") {
      setShowResponseModal(true)
    } else if (action === "edit") {
      startEdit()
    } else if (action == "feed") {
      setIsRSSModalOpen(true)
    }
  }

  const hideRSSModal = () => setIsRSSModalOpen(false)

  const loadFailure = loadError && (
    <div className="p-show-post__error" role="alert">
      <p>
        {loadError === "unauthenticated" && <Trans id="showpost.error.unauthenticated">Please sign in again to view this record.</Trans>}
        {loadError === "forbidden" && <Trans id="showpost.error.forbidden">You do not have access to this record.</Trans>}
        {loadError === "missing" && <Trans id="showpost.error.missing">This record no longer exists.</Trans>}
        {loadError === "network" && <Trans id="showpost.error.network">Could not load this record. Please try again.</Trans>}
      </p>
      {loadError === "unauthenticated" ? (
        <Button href={`/signin?redirect=${encodeURIComponent(`/posts/${props.postNumber}`)}`}>
          <Trans id="action.signin">Sign in</Trans>
        </Button>
      ) : loadError === "network" ? (
        <Button onClick={loadDetails} disabled={loading}>
          <Trans id="action.retry">Retry</Trans>
        </Button>
      ) : null}
    </div>
  )

  if (!post) {
    return (
      <div className="p-show-post">
        {loadFailure || (
          <div className="p-show-post__loading" role="status">
            <Trans id="showpost.loading">Loading...</Trans>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="p-show-post" aria-busy={loading}>
      {loadFailure}
      <div className="p-show-post__main-col">
        {/* Post Card */}
        <div className="p-show-post__post-card">
          {/* Title and Meta */}
          <VStack spacing={4}>
            {/* Title */}
            {editMode ? (
              <Form error={error}>
                <Input field="title" ariaLabel={i18n._({ id: "label.title", message: "Title" })} value={newTitle} onChange={setNewTitle} disabled={saving} />
              </Form>
            ) : (
              <h1 className="p-show-post__title">{post.title}</h1>
            )}

            {/* Posted by info with status */}
            {!editMode && (
              <div className="p-show-post__meta">
                <PostMetaInfo post={post} locale={fider.currentLocale} />
              </div>
            )}
          </VStack>

          {/* Moderation status banner for unapproved posts */}
          {!editMode && !post.isApproved && (
            <div>
              {fider.session.isAuthenticated && (
                <div className="text-muted text-sm p-3 bg-yellow-50 rounded-md mt-2 border-yellow-500">
                  <Trans id="showpost.moderation.awaiting">Awaiting moderation.</Trans>
                </div>
              )}

              {/* Admin moderation buttons */}
              {fider.session.isAuthenticated && fider.session.showModerationControls && fider.session.user.isCollaborator && (
                <div className="p-3 bg-blue-50 rounded border-l-4 border-blue-500 mt-4">
                  <div className="mb-2 text-sm font-medium text-blue-800">
                    <Trans id="showpost.moderation.admin.title">Moderation</Trans>
                  </div>
                  <div className="text-sm text-blue-700 mb-3">
                    <Trans id="showpost.moderation.admin.description">This idea needs your approval before being published</Trans>
                  </div>
                  <HStack spacing={2}>
                    <Button variant="primary" size="small" onClick={handleApprovePost} disabled={saving}>
                      <Trans id="action.publish">Publish</Trans>
                    </Button>
                    <Button variant="danger" size="small" onClick={handleDeclinePost} disabled={saving}>
                      <Trans id="action.delete">Delete</Trans>
                    </Button>
                  </HStack>
                </div>
              )}
            </div>
          )}

          {/* Description - Full width */}
          {!editMode ? (
            <div className="p-show-post__description-section">
              {post.description && <Markdown className="p-show-post__description" text={post.description} style="full" />}
              {!post.description && (
                <em className="text-muted">
                  <Trans id="showpost.message.nodescription">No description provided.</Trans>
                </em>
              )}
            </div>
          ) : (
            <div className="p-show-post__description-section">
              <Form error={error}>
                <CommentEditor
                  field="description"
                  onChange={handleDescriptionChange}
                  initialValue={newDescription}
                  disabled={saving}
                  maxAttachments={3}
                  maxImageSizeKB={5 * 1024}
                  placeholder={i18n._({
                    id: "newpost.modal.description.placeholder",
                    message: "Tell us about it. Explain it fully, don't hold back, the more information the better.",
                  })}
                  onImageUploaded={handleImageUploaded}
                  onGetImageSrc={getImageSrc}
                />
              </Form>
            </div>
          )}

          {tags.length >= 1 && (
            <div className="p-show-post__tags">
              <TagsPanel post={post} tags={tags} onDataChanged={handleDataChanged} />
            </div>
          )}

          {/* Edit Mode Actions */}
          {editMode && (
            <HStack className="mt-6">
              <Button variant="primary" onClick={saveChanges} disabled={Fider.isReadOnly || saving || !isValidPostTitle(newTitle)}>
                <Icon sprite={IconThumbsUp} />{" "}
                <span>
                  <Trans id="action.save">Save</Trans>
                </span>
              </Button>
              <Button onClick={cancelEdit} disabled={Fider.isReadOnly || saving}>
                <Icon sprite={IconX} />
                <span>
                  <Trans id="action.cancel">Cancel</Trans>
                </span>
              </Button>
            </HStack>
          )}

          {/* Bottom Action Bar */}
          {!editMode && (
            <div className="p-show-post__actions">
              <HStack spacing={0} align="center" className="flex-wrap gap-2">
                <ActionButton icon={IconDuplicate} onClick={onActionSelected("copy")}>
                  <Trans id="action.copylink">Copy link</Trans>
                </ActionButton>

                {Fider.session.isAuthenticated && canEditPost(Fider.session.user, post) && (
                  <ActionButton icon={IconPencil} onClick={onActionSelected("edit")}>
                    <Trans id="action.edit">Edit</Trans>
                  </ActionButton>
                )}

                {Fider.session.isAuthenticated && Fider.session.user.isCollaborator && (
                  <ActionButton icon={IconChat} onClick={onActionSelected("status")}>
                    <Trans id="action.respond">Update Status</Trans>
                  </ActionButton>
                )}

                {Fider.session.tenant.isFeedEnabled && (
                  <ActionButton icon={IconRSS} onClick={onActionSelected("feed")}>
                    <Trans id="action.commentsfeed">Comment Feed</Trans>
                  </ActionButton>
                )}

                {canDeletePost() && (
                  <ActionButton icon={IconTrash} onClick={onActionSelected("delete")} variant="danger">
                    <Trans id="action.delete">Delete</Trans>
                  </ActionButton>
                )}

                <div className="flex-grow" />

                <FollowButton post={post} subscribed={subscribed} />
              </HStack>
            </div>
          )}
        </div>

        {/* Discussion Section */}
        <div className="p-show-post__discussion-section">
          {/* Discussion Header */}
          <HStack className="p-show-post__discussion-header" align="center" spacing={4}>
            <h2 className="p-show-post__discussion-title">
              <Trans id="label.discussion">Discussion</Trans>
            </h2>
            <div className="p-show-post__discussion-count">{comments.length}</div>
          </HStack>

          {/* Comment Input at top */}
          <CommentInput post={post} onSubmitted={handleDataChanged} />

          {/* Response Details - First discussion item */}
          {post.response && <ResponseDetails status={post.status} response={post.response} />}

          {/* Comments List */}
          {comments.length > 0 && (
            <VStack spacing={4}>
              {comments.map((c) => (
                <ShowComment key={c.id} post={post} comment={c} highlighted={highlightedComment === c.id} onDataChanged={handleDataChanged} />
              ))}
            </VStack>
          )}
        </div>
      </div>

      {/* Modals */}
      <RSSModal isOpen={isRSSModalOpen} onClose={hideRSSModal} url={`${fider.settings.baseURL}/feed/posts/${post.number}.atom`} />
      <DeletePostModal onModalClose={() => setShowDeleteModal(false)} showModal={showDeleteModal} post={post} onDeleted={handleDeleted} />
      {Fider.session.isAuthenticated && Fider.session.user.isCollaborator && (
        <ResponseModal
          key={`${post.number}-${showResponseModal}`}
          onCloseModal={() => setShowResponseModal(false)}
          showModal={showResponseModal}
          post={post}
          onResponded={handleResponded}
        />
      )}
    </div>
  )
}
