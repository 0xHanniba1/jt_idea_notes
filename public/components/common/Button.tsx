import "./Button.scss"

import React, { useEffect, useRef, useState } from "react"
import { classSet } from "@fider/services"

interface ButtonProps {
  children?: React.ReactNode
  className?: string
  ariaLabel?: string
  disabled?: boolean
  href?: string
  rel?: "nofollow"
  target?: "_self" | "_blank" | "_parent" | "_top"
  type?: "button" | "submit"
  variant?: "primary" | "danger" | "secondary" | "tertiary" | "link"
  size?: "small" | "default" | "large" | "no-padding"
  style?: React.CSSProperties
  onClick?: (event: ButtonClickEvent) => Promise<any> | void
}

export class ButtonClickEvent {
  private shouldEnable = true
  public preventEnable(): void {
    this.shouldEnable = false
  }
  public canEnable(): boolean {
    return this.shouldEnable
  }
}

export const Button: React.FC<ButtonProps> = ({ size = "default", variant = "secondary", type = "button", ...props }) => {
  const [clicked, setClicked] = useState(false)
  const unmountedContainer = useRef(true)

  useEffect(() => {
    unmountedContainer.current = false
    return () => {
      unmountedContainer.current = true
    }
  }, [])

  const className = classSet({
    "c-button": true,
    [`c-button--${size}`]: size,
    [`c-button--${variant}`]: variant,
    "c-button--loading": clicked,
    "c-button--disabled": clicked || props.disabled,
    [props.className || ""]: props.className,
  })

  let buttonContent: JSX.Element
  const onClickProp = props.onClick

  if (props.href) {
    buttonContent = (
      <a
        href={props.href}
        rel={props.rel}
        target={props.target}
        className={className}
        style={props.style}
        aria-label={props.ariaLabel}
        aria-disabled={props.disabled || undefined}
        tabIndex={props.disabled ? -1 : undefined}
        onClick={props.disabled ? (event) => event.preventDefault() : undefined}
      >
        {props.children}
      </a>
    )
  } else if (onClickProp) {
    const onClick = async (e?: React.SyntheticEvent<HTMLElement>) => {
      if (e) {
        e.preventDefault()
        e.stopPropagation()
      }

      if (clicked || props.disabled) {
        return
      }

      const event = new ButtonClickEvent()
      setClicked(true)

      try {
        await onClickProp(event)
      } finally {
        if (!unmountedContainer.current && event.canEnable()) {
          setClicked(false)
        }
      }
    }

    buttonContent = (
      <button
        type={type}
        className={className}
        onClick={onClick}
        style={props.style}
        disabled={clicked || props.disabled}
        aria-busy={clicked || undefined}
        aria-label={props.ariaLabel}
      >
        {props.children}
      </button>
    )
  } else {
    buttonContent = (
      <button type={type} className={className} style={props.style} disabled={props.disabled} aria-label={props.ariaLabel}>
        {props.children}
      </button>
    )
  }

  return buttonContent
}
