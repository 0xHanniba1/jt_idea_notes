import "./Avatar.scss"

import React, { useState } from "react"
import { UserRole } from "@fider/models"

interface AvatarProps {
  user: {
    role?: UserRole
    avatarURL: string
    name: string
  }
  size?: "small" | "normal" | "large"
}

export const Avatar = (props: AvatarProps) => {
  const size = props.size === "small" ? "h-6 w-6" : props.size === "large" ? "h-11 w-11" : "h-8 w-8"
  const [failedURL, setFailedURL] = useState<string>()
  const url = props.user.avatarURL
  if (!url || url.includes("/static/avatars/letter/") || failedURL === url) {
    return (
      <span role="img" aria-label={props.user.name} className={`c-avatar c-avatar--initial ${size}`}>
        {Array.from(props.user.name.trim())[0] || "?"}
      </span>
    )
  }
  return <img className={`c-avatar ${size}`} alt={props.user.name} src={`${url}${url.includes("?") ? "&" : "?"}size=50`} onError={() => setFailedURL(url)} />
}
