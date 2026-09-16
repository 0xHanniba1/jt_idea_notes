import "./PostDetailsOverlay.scss"

import React, { ReactNode, useId } from "react"
import { Modal, CloseIcon } from "../common/Modal"
import { i18n } from "@lingui/core"

interface PostDetailsOverlayProps {
  children: ReactNode
  onClose: () => void
  title?: string
}

export const PostDetailsOverlay: React.FC<PostDetailsOverlayProps> = ({ children, onClose, title }) => {
  const titleId = useId()
  return (
    <Modal.Window isOpen onClose={onClose} size="drawer" center={false} className="post-details-overlay__panel" ariaLabelledBy={titleId}>
      <div className="post-details-overlay__header">
        <h2 id={titleId}>{title || i18n._({ id: "postdetails.heading", message: "Idea details" })}</h2>
        <CloseIcon closeModal={onClose} />
      </div>
      <div className="post-details-overlay__content">{children}</div>
    </Modal.Window>
  )
}
