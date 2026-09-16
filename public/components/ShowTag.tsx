import "./ShowTag.scss"

import React from "react"
import { Tag } from "@fider/models"
import { classSet } from "@fider/services"
import EyeSlash from "@fider/assets/images/heroicons-eyeslash.svg"
import { Icon } from "./common"

interface TagProps {
  tag: Tag
  circular?: boolean
  link?: boolean
}

// const textColor = (color: string) => {
//   const components = getRGB(color)
//   const bgDelta = components.R * 0.299 + components.G * 0.587 + components.B * 0.114
//   return bgDelta > 140 ? "#333" : "#fff"
// }

export const ShowTag = (props: TagProps) => {
  const className = classSet({
    "c-tag": true,
    "c-tag--circular": props.circular === true,
  })

  const content = (
    <>
      <span style={{ backgroundColor: `#${props.tag.color}` }} />
      {!props.tag.isPublic && !props.circular && <Icon height="14" width="14" sprite={EyeSlash} className="mr-1" />}
      {props.circular ? "" : props.tag.name || "Tag"}
    </>
  )
  const title = `${props.tag.name}${props.tag.isPublic ? "" : " (Private)"}`
  // Read-only tags can live inside record links and listbox options.
  // Only explicitly linked tags create their own navigation target.
  return props.link && props.tag.slug ? (
    <a href={`/?tags=${encodeURIComponent(props.tag.slug)}`} title={title} className={className}>
      {content}
    </a>
  ) : (
    <span title={title} className={className}>
      {content}
    </span>
  )
}
