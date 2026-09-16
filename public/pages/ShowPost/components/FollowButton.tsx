import React, { useState, useEffect } from "react"
import { actions, notify } from "@fider/services"
import { useFider } from "@fider/hooks"
import IconPlus from "@fider/assets/images/heroicons-plus.svg"
import IconCheck from "@fider/assets/images/heroicons-check.svg"
import { t } from "@lingui/core/macro"
import { Trans } from "@lingui/react/macro"
import { Post } from "@fider/models"
import { ActionButton } from "./ActionButton"

export interface NotificationsPanelProps {
  post: Post
  subscribed: boolean
}

export const FollowButton = (props: NotificationsPanelProps) => {
  const fider = useFider()
  const [subscribed, setSubscribed] = useState(props.subscribed)
  const [submitting, setSubmitting] = useState(false)
  useEffect(() => setSubscribed(props.subscribed), [props.post.number, props.subscribed])

  const subscribeOrUnsubscribe = async () => {
    if (submitting) return
    const action = subscribed ? actions.unsubscribe : actions.subscribe
    setSubmitting(true)
    try {
      const response = await action(props.post.number)
      if (response.ok) setSubscribed(!subscribed)
    } catch {
      notify.error(t({ id: "showpost.action.failed", message: "Unable to save. Please check your connection and try again." }))
    } finally {
      setSubmitting(false)
    }
  }

  if (!fider.session.isAuthenticated) {
    return null
  }

  return subscribed ? (
    <ActionButton icon={IconCheck} onClick={subscribeOrUnsubscribe} disabled={fider.isReadOnly || submitting}>
      <Trans id="label.following">Following</Trans>
    </ActionButton>
  ) : (
    <ActionButton icon={IconPlus} onClick={subscribeOrUnsubscribe} disabled={fider.isReadOnly || submitting}>
      <Trans id="label.follow">Follow</Trans>
    </ActionButton>
  )
}
