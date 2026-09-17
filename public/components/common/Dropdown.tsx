import "./Dropdown.scss"

import React, { createContext, useContext, useEffect, useId, useRef, useState } from "react"
import { i18n } from "@lingui/core"
import { classSet } from "@fider/services"
import { Icon } from "@fider/components/common/Icon"

interface DropdownListItemProps {
  href?: string
  type?: string
  onClick?: () => void
  className?: string
  children: React.ReactNode
  icon?: SpriteSymbol
  checked?: boolean
  checkType?: "radio" | "checkbox"
  disabled?: boolean
}

const DropdownContext = createContext<{ close(restoreFocus?: boolean): void } | null>(null)
DropdownContext.displayName = "DropdownContext"

const ListItem = (props: DropdownListItemProps) => {
  const ctx = useContext(DropdownContext)
  const handleClick = (event: React.MouseEvent) => {
    if (props.disabled) {
      event.preventDefault()
      return
    }
    props.onClick?.()
    ctx?.close(!props.href)
  }
  const common = {
    className: `c-dropdown__listitem ${props.className || ""}`,
    role: props.checked !== undefined ? (props.checkType === "checkbox" ? "menuitemcheckbox" : "menuitemradio") : "menuitem",
    "aria-checked": props.checked,
    "aria-disabled": props.disabled || undefined,
    tabIndex: -1,
    onClick: handleClick,
  }
  const content = (
    <>
      {props.icon && <Icon sprite={props.icon} width="16" height="16" />}
      {props.children}
    </>
  )
  return props.href ? (
    <a {...common} href={props.href}>
      {content}
    </a>
  ) : (
    <button {...common} type="button" disabled={props.disabled}>
      {content}
    </button>
  )
}

const Divider = () => <hr className="c-dropdown__divider" role="separator" />

interface DropdownProps {
  triggerId?: string
  ariaInvalid?: boolean
  ariaDescribedBy?: string
  typeAhead?: boolean
  disabled?: boolean
  renderHandle: JSX.Element
  position?: "left" | "right"
  onToggled?: (isOpen: boolean) => void
  children: React.ReactNode
  wide?: boolean
  fullsceenSm?: boolean
  ariaLabel?: string
  contentRole?: "menu" | "dialog"
}

export const Dropdown = (props: DropdownProps) => {
  const contentRole = props.contentRole || "menu"
  const ariaLabel = props.ariaLabel || (props.renderHandle.type === Icon ? i18n._({ id: "action.moreoptions", message: "More options" }) : undefined)
  const node = useRef<HTMLDivElement>(null)
  const handle = useRef<HTMLButtonElement>(null)
  const list = useRef<HTMLDivElement>(null)
  const initialFocus = useRef<"first" | "last" | null>(null)
  const searchText = useRef({ text: "", time: 0 })
  const id = useId()
  const [isOpen, setIsOpen] = useState(false)
  const [above, setAbove] = useState(false)
  const onToggled = useRef(props.onToggled)
  onToggled.current = props.onToggled

  const changeToggleState = (open: boolean) => {
    setIsOpen(open)
    onToggled.current?.(open)
  }
  const close = (restoreFocus = false) => {
    changeToggleState(false)
    if (restoreFocus) handle.current?.focus()
  }
  const items = () =>
    Array.from(
      list.current?.querySelectorAll<HTMLElement>(
        contentRole === "menu" ? '[role^="menuitem"]:not([aria-disabled="true"])' : 'a[href], button:not(:disabled), input:not(:disabled), [tabindex="0"]'
      ) || []
    )

  useEffect(() => {
    if (!isOpen) return
    const positionMenu = () => {
      const rect = handle.current?.getBoundingClientRect()
      if (rect && list.current) setAbove(window.innerHeight - rect.bottom < list.current.scrollHeight + 12 && rect.top > window.innerHeight - rect.bottom)
    }
    positionMenu()
    if (initialFocus.current) {
      const available = items()
      const search = list.current?.querySelector<HTMLInputElement>("input")
      if (search && initialFocus.current === "first") search.focus()
      else available[initialFocus.current === "last" ? available.length - 1 : 0]?.focus()
      initialFocus.current = null
    }
    const dismiss = (event: MouseEvent | FocusEvent) => {
      if (!node.current?.contains(event.target as Node)) close()
    }
    document.addEventListener("mousedown", dismiss)
    document.addEventListener("focusin", dismiss)
    window.addEventListener("resize", positionMenu)
    return () => {
      document.removeEventListener("mousedown", dismiss)
      document.removeEventListener("focusin", dismiss)
      window.removeEventListener("resize", positionMenu)
    }
  }, [isOpen])

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (props.disabled || event.nativeEvent.isComposing) return
    if (event.key === "Tab" && isOpen) {
      // A menu uses roving focus; Tab exits from its trigger's place in the
      // page order. Returning focus before the native Tab step also lets an
      // enclosing modal compute its first/last targets correctly.
      close(true)
      return
    }
    if (event.key === "Escape" && isOpen) {
      event.preventDefault()
      event.stopPropagation()
      close(true)
      return
    }
    // Editable content inside a custom dropdown retains its normal cursor keys.
    const target = event.target as HTMLElement
    if (target.matches("textarea, [contenteditable=true]") || (target.matches("input") && ["Home", "End"].includes(event.key))) return
    if (props.typeAhead && isOpen && event.key.length === 1 && event.key !== " " && !event.ctrlKey && !event.metaKey && !event.altKey) {
      const now = Date.now()
      const text = (now - searchText.current.time < 700 ? searchText.current.text : "") + event.key.toLocaleLowerCase()
      searchText.current = { text, time: now }
      const available = items()
      const current = available.indexOf(document.activeElement as HTMLElement)
      const repeated = Array.from(text).every((char) => char === text[0])
      const prefix = repeated ? text[0] : text
      const ordered = repeated ? [...available.slice(current + 1), ...available.slice(0, current + 1)] : available
      ordered.find((item) => item.textContent?.trim().toLocaleLowerCase().startsWith(prefix))?.focus()
      event.preventDefault()
      event.stopPropagation()
      return
    }
    if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return
    if (contentRole === "dialog" && isOpen) return
    event.preventDefault()
    event.stopPropagation()
    if (!isOpen) {
      initialFocus.current = event.key === "ArrowUp" || event.key === "End" ? "last" : "first"
      changeToggleState(true)
      return
    }
    const available = items()
    const current = available.indexOf(document.activeElement as HTMLElement)
    const next =
      event.key === "Home"
        ? 0
        : event.key === "End"
        ? available.length - 1
        : event.key === "ArrowDown"
        ? (current + 1) % available.length
        : current < 0
        ? available.length - 1
        : (current - 1 + available.length) % available.length
    available[next]?.focus()
  }

  const listClassName = classSet({
    "c-dropdown__list": true,
    "c-dropdown__list--wide": props.wide,
    "c-dropdown__list--fullscreen-small": props.fullsceenSm,
    "c-dropdown__list--left": props.position === "left",
  })

  return (
    <DropdownContext.Provider value={{ close }}>
      <div ref={node} className="c-dropdown" onKeyDown={onKeyDown}>
        <button
          ref={handle}
          id={props.triggerId}
          type="button"
          className="c-dropdown__handle"
          disabled={props.disabled}
          aria-label={ariaLabel}
          aria-invalid={props.ariaInvalid || undefined}
          aria-describedby={props.ariaDescribedBy}
          aria-haspopup={contentRole}
          aria-expanded={isOpen}
          aria-controls={isOpen ? id : undefined}
          onClick={() => {
            initialFocus.current = !isOpen ? "first" : null
            changeToggleState(!isOpen)
          }}
        >
          {props.renderHandle}
        </button>
        {isOpen && (
          <div ref={list} id={id} role={contentRole} aria-label={ariaLabel} className={listClassName} data-side={above ? "top" : "bottom"}>
            {props.children}
          </div>
        )}
      </div>
    </DropdownContext.Provider>
  )
}

Dropdown.ListItem = ListItem
Dropdown.Divider = Divider
