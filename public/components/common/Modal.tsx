import "./Modal.scss"

import React, { createContext, useContext, useEffect, useId, useRef } from "react"
import ReactDOM from "react-dom"
import { classSet } from "@fider/services"
import { Icon } from "./Icon"
import { i18n } from "@lingui/core"
import IconX from "@fider/assets/images/heroicons-x.svg"
import { registerModal } from "./modal-stack"

interface ModalWindowProps {
  children?: React.ReactNode
  className?: string
  isOpen: boolean
  size?: "small" | "large" | "fluid" | "fullscreen" | "drawer"
  canClose?: boolean
  center?: boolean
  ariaLabel?: string
  ariaLabelledBy?: string
  onClose: () => void
}

interface ModalFooterProps {
  align?: "left" | "center" | "right"
  children?: React.ReactNode
}

const HeaderIdContext = createContext<string | undefined>(undefined)

const ModalWindow: React.FunctionComponent<ModalWindowProps> = ({ size = "small", canClose = true, center = true, ...props }) => {
  const headingId = useId()
  const element = useRef<HTMLDivElement>(null)
  const backdrop = useRef<HTMLDivElement>(null)
  const closeRef = useRef<() => void>(() => undefined)
  closeRef.current = () => {
    if (canClose) props.onClose()
  }
  const root = typeof document === "undefined" ? null : document.getElementById("root-modal")

  useEffect(() => {
    if (!props.isOpen || !element.current || !backdrop.current) return
    const header = element.current.querySelector(".c-modal-header")
    if (!props.ariaLabel && !props.ariaLabelledBy && header) {
      element.current.setAttribute("aria-labelledby", header.id)
      element.current.removeAttribute("aria-label")
    }
    return registerModal(element.current, backdrop.current, () => closeRef.current())
  }, [props.isOpen, root, props.ariaLabel, props.ariaLabelledBy])

  if (!props.isOpen || !root) return null

  const className = classSet({
    "c-modal-window": true,
    [`${props.className}`]: !!props.className,
    "c-modal-window--center": center,
    [`c-modal-window--${size}`]: true,
  })

  const dimmerClassName = classSet({
    "c-modal-dimmer": true,
    "c-modal-dimmer--drawer": size === "drawer",
  })

  return ReactDOM.createPortal(
    <HeaderIdContext.Provider value={headingId}>
      <div ref={backdrop} className={dimmerClassName} onClick={() => closeRef.current()}>
        <div className="c-modal-scroller">
          <div
            ref={element}
            className={className}
            data-testid="modal"
            role="dialog"
            aria-modal="true"
            aria-label={props.ariaLabelledBy ? undefined : props.ariaLabel || i18n._({ id: "modal.dialog", message: "Dialog" })}
            aria-labelledby={props.ariaLabelledBy}
            tabIndex={-1}
            onClick={(event) => event.stopPropagation()}
          >
            {props.children}
          </div>
        </div>
      </div>
    </HeaderIdContext.Provider>,
    root
  )
}
const Header = (props: { children: React.ReactNode }) => (
  <div id={useContext(HeaderIdContext)} className="c-modal-header">
    {props.children}
  </div>
)
const Content = (props: { children: React.ReactNode }) => <div className="c-modal-content">{props.children}</div>
const Footer = (props: ModalFooterProps) => {
  const align = props.align || "right"
  const className = classSet({
    "c-modal-footer": true,
    [`c-modal-footer--${align}`]: true,
  })
  return <div className={className}>{props.children}</div>
}

export const CloseIcon = ({ closeModal }: { closeModal: () => void }) => (
  <button
    type="button"
    onClick={closeModal}
    className="c-modal-closeicon"
    aria-label={i18n._({ id: "action.close", message: "Close" })}
    data-modal-initial-focus
  >
    <Icon sprite={IconX} height="18" width="18" />
  </button>
)

export const Modal = {
  Window: ModalWindow,
  Header,
  Content,
  Footer,
}
