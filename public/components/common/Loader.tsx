import "./Loader.scss"

import { i18n } from "@lingui/core"
import React, { useState } from "react"
import { useTimeout } from "@fider/hooks"
import { classSet } from "@fider/services"

interface LoaderProps {
  text?: string
  className?: string
}

export function Loader(props: LoaderProps) {
  const [show, setShow] = useState(false)

  useTimeout(() => {
    setShow(true)
  }, 500)

  const className = classSet({
    "c-loader": true,
    [props.className || ""]: props.className,
  })

  return show ? (
    <div className={className} role="status" aria-label={props.text || i18n._({ id: "label.loading", message: "Loading" })}>
      <div className="c-loader__spinner" aria-hidden="true" />
      {props.text && <span className="c-loader__text">{props.text}</span>}
    </div>
  ) : null
}
