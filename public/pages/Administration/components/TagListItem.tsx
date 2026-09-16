import { i18n } from "@lingui/core"
import { Trans } from "@lingui/react/macro"
import React, { useState } from "react"
import { Tag } from "@fider/models"
import { ShowTag, Button, Icon } from "@fider/components"
import { TagFormState, TagForm } from "./TagForm"
import { actions, Failure } from "@fider/services"
import { useFider } from "@fider/hooks"

import IconX from "@fider/assets/images/heroicons-x.svg"
import IconPencilAlt from "@fider/assets/images/heroicons-pencil-alt.svg"
import { VStack } from "@fider/components/layout"

interface TagListItemProps {
  tag: Tag
  gridTemplateColumns: string
  isLast?: boolean
  onTagEdited: (tag: Tag) => void
  onTagDeleted: (tag: Tag) => void
}

export const TagListItem = (props: TagListItemProps) => {
  const fider = useFider()
  const [tag] = useState(props.tag)
  const [state, setState] = useState<"view" | "edit" | "delete">("view")

  const startDelete = async () => setState("delete")
  const startEdit = async () => setState("edit")
  const resetState = async () => setState("view")

  const deleteTag = async () => {
    const result = await actions.deleteTag(tag.slug)
    if (result.ok) {
      resetState()
      props.onTagDeleted(tag)
    }
  }

  const updateTag = async (data: TagFormState): Promise<Failure | undefined> => {
    const result = await actions.updateTag(tag.slug, data.name, data.color, data.isPublic)
    if (result.ok) {
      tag.name = result.data.name
      tag.slug = result.data.slug
      tag.color = result.data.color
      tag.isPublic = result.data.isPublic

      resetState()
      props.onTagEdited(tag)
    } else {
      return result.error
    }
  }

  const rowClass = `border-b border-gray-200 py-4 px-4 bg-white ${props.isLast ? "rounded-md-b" : ""}`

  if (state === "delete") {
    return (
      <div className={rowClass}>
        <VStack spacing={2}>
          <div>
            <b>{i18n._({ id: "admin.tags.delete.confirm", message: "Are you sure?" })}</b>{" "}
            <span>
              <Trans id="admin.tags.delete.help">
                The tag <ShowTag tag={tag} /> will be removed from all posts.
              </Trans>
            </span>
          </div>
          <div>
            <Button variant="danger" onClick={deleteTag}>
              {i18n._({ id: "admin.tags.delete", message: "Delete tag" })}
            </Button>
            <Button onClick={resetState} variant="tertiary">
              {i18n._({ id: "admin.tags.cancel", message: "Cancel" })}
            </Button>
          </div>
        </VStack>
      </div>
    )
  }

  if (state === "edit") {
    return (
      <div className={rowClass}>
        <TagForm name={props.tag.name} color={props.tag.color} isPublic={props.tag.isPublic} onSave={updateTag} onCancel={resetState} />
      </div>
    )
  }

  return (
    <div className={`c-tag-row ${rowClass} grid gap-4 flex-items-center hover`} style={{ gridTemplateColumns: props.gridTemplateColumns }}>
      <div>
        <ShowTag tag={tag} link />
      </div>
      <div>
        {tag.isPublic ? (
          <span className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded">{i18n._({ id: "admin.tags.public", message: "Public" })}</span>
        ) : (
          <span className="text-xs bg-gray-200 text-gray-800 px-2 py-1 rounded">{i18n._({ id: "admin.tags.private", message: "Private" })}</span>
        )}
      </div>
      <div className="c-tag-row__actions flex justify-end flex-wrap gap-2">
        {fider.session.user.isAdministrator && (
          <>
            <Button size="small" onClick={startEdit}>
              <Icon sprite={IconPencilAlt} />
              <span>{i18n._({ id: "admin.tags.edit", message: "Edit" })}</span>
            </Button>
            <Button size="small" onClick={startDelete}>
              <Icon sprite={IconX} />
              <span>{i18n._({ id: "admin.tags.delete.action", message: "Delete" })}</span>
            </Button>
          </>
        )}
      </div>
    </div>
  )
}
