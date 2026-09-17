import React, { useState, useEffect } from "react"
import { Icon } from "@fider/components"
import { useFider } from "@fider/hooks"
import CheckCircle from "@fider/assets/images/heroicons-check-circle.svg"
import { i18n } from "@lingui/core"

export const ModerationIndicator = () => {
  const fider = useFider()
  const [count, setCount] = useState(0)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchCount = async () => {
      try {
        const response = await fetch("/_api/admin/moderation/count")
        if (response.ok) {
          const data = await response.json()
          setCount(data.count || 0)
        }
      } catch (error) {
        console.error("Failed to fetch moderation count:", error)
      } finally {
        setLoading(false)
      }
    }

    // Only fetch if user is admin/collaborator and moderation is enabled
    if ((fider.session.user.isAdministrator || fider.session.user.isCollaborator) && fider.session.tenant.isModerationEnabled) {
      fetchCount()
    } else {
      setLoading(false)
    }
  }, [fider.session.user, fider.session.tenant.isModerationEnabled])

  // Don't show if user is not admin/collaborator or moderation is disabled
  if (!fider.session.user.isAdministrator && !fider.session.user.isCollaborator) {
    return null
  }

  if (!fider.session.tenant.isModerationEnabled) {
    return null
  }

  if (loading) {
    return null
  }

  if (count > 0) {
    const label = i18n._({ id: "workspace.moderation.pending", message: "{count} items awaiting review", values: { count } })
    return (
      <a href="/admin/moderation" className="c-workspace__moderation" title={label} aria-label={label}>
        <Icon width="16" height="16" sprite={CheckCircle} />
        <span aria-hidden="true">{count > 99 ? "99+" : count}</span>
      </a>
    )
  } else {
    return <></>
  }
}
