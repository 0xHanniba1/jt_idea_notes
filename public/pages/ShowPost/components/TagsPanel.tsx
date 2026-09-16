import React, { useState, useEffect, useRef } from "react"
import { Post, Tag } from "@fider/models"
import { actions, notify } from "@fider/services"
import { useFider } from "@fider/hooks"
import { t } from "@lingui/core/macro"
import { TagsSelect } from "@fider/components/common/TagsSelect"

export interface TagsPanelProps {
  onDataChanged?: () => void | Promise<void>
  post: Post
  tags: Tag[]
}

export const TagsPanel = (props: TagsPanelProps) => {
  const fider = useFider()
  const canEdit = fider.session.isAuthenticated && fider.session.user.isCollaborator && props.tags.length > 0

  const [assignedTags, setAssignedTags] = useState(props.tags.filter((t) => props.post.tags.indexOf(t.slug) >= 0))

  const saving = useRef(false)
  useEffect(() => {
    setAssignedTags(props.tags.filter((tag) => props.post.tags.includes(tag.slug)))
  }, [props.tags, props.post.tags])

  const assignOrUnassignTag = async (tags: Tag[]) => {
    if (saving.current) return
    saving.current = true
    try {
      const results = await Promise.all([
        ...tags.filter((tag) => !assignedTags.some((assigned) => assigned.slug === tag.slug)).map((tag) => actions.assignTag(tag.slug, props.post.number)),
        ...assignedTags.filter((tag) => !tags.some((assigned) => assigned.slug === tag.slug)).map((tag) => actions.unassignTag(tag.slug, props.post.number)),
      ])
      if (results.every((result) => result.ok)) setAssignedTags(tags)
      else notify.error(t({ id: "showpost.action.failed", message: "Unable to save. Please check your connection and try again." }))
      // A partial success still changes server state. Refresh from the server rather than inventing the final selection.
      if (results.some((result) => result.ok)) await props.onDataChanged?.()
    } catch {
      notify.error(t({ id: "showpost.action.failed", message: "Unable to save. Please check your connection and try again." }))
      await props.onDataChanged?.()
    } finally {
      saving.current = false
    }
  }

  return <TagsSelect tags={props.tags} selected={assignedTags} canEdit={canEdit} selectionChanged={assignOrUnassignTag} asLinks />
}
