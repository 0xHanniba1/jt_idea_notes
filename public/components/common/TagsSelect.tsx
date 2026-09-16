import React, { KeyboardEvent as ReactKeyboardEvent, useEffect, useId, useRef, useState } from "react"
import { Tag } from "@fider/models"
import { sortTags } from "@fider/services"
import { Button, ShowTag } from "@fider/components"
import { useFider } from "@fider/hooks"

import { HStack, VStack } from "@fider/components/layout"
import { Trans } from "@lingui/react/macro"
import { i18n } from "@lingui/core"

import "./TagsSelect.scss"

export interface TagsSelectProps {
  tags: Tag[]
  selected: Tag[]
  selectionChanged: (selected: Tag[]) => void
  canEdit: boolean
  asLinks?: boolean
  // If true, you always see the tags edit box, rather than having to put the tags list into "edit mode"
  alwaysEditing?: boolean
}

export const TagsSelect = (props: TagsSelectProps) => {
  const fider = useFider()
  const [isEditing, setIsEditing] = useState(false)
  const [query, setQuery] = useState("")
  const [activeIndex, setActiveIndex] = useState(0)
  const [above, setAbove] = useState(false)
  const listId = useId()
  const containerRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLElement | null>(null)

  const dropdownRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const assignOrUnassignTag = async (tag: Tag) => {
    const assigned = props.selected.some((item) => item.id === tag.id)
    const next = assigned ? props.selected.filter((item) => item.id !== tag.id) : props.selected.concat(tag)
    props.selectionChanged(next)
  }

  const onSubtitleClick = () => {
    if (props.canEdit) {
      triggerRef.current = document.activeElement as HTMLElement
      setIsEditing(!isEditing)
      // Immediately focus on the input element when editing starts
      if (inputRef.current) {
        inputRef.current.focus()
      }
      setQuery("")
    }
  }

  const handleOptionClick = (tag: Tag) => {
    assignOrUnassignTag(tag)
    // Keep focus on the input element after selection
    if (inputRef.current) {
      inputRef.current.focus()
    }
  }

  const filteredOptions = sortTags(
    props.tags.filter((option) => option.name.toLowerCase().includes(query.toLowerCase()) && !props.selected.some((tag) => tag.slug === option.slug))
  )

  const handleEsc = (event: ReactKeyboardEvent) => {
    if (event.nativeEvent.isComposing || event.key !== "Escape" || !isEditing) return
    event.preventDefault()
    event.stopPropagation()
    setIsEditing(false)
    requestAnimationFrame(() => {
      if (triggerRef.current?.isConnected) triggerRef.current.focus()
      else containerRef.current?.querySelector<HTMLElement>("button")?.focus()
    })
  }

  const onInputKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (event.nativeEvent.isComposing) return
    if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key) && filteredOptions.length) {
      event.preventDefault()
      const next =
        event.key === "Home"
          ? 0
          : event.key === "End"
          ? filteredOptions.length - 1
          : event.key === "ArrowDown"
          ? (activeIndex + 1) % filteredOptions.length
          : (activeIndex - 1 + filteredOptions.length) % filteredOptions.length
      setActiveIndex(next)
      document.getElementById(`${listId}-${next}`)?.scrollIntoView?.({ block: "nearest" })
    } else if (event.key === "Enter" && filteredOptions[activeIndex]) {
      event.preventDefault()
      handleOptionClick(filteredOptions[activeIndex])
      setActiveIndex(0)
    }
  }

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsEditing(false)
      }
    }

    document.addEventListener("mousedown", handleClickOutside)
    return () => {
      document.removeEventListener("mousedown", handleClickOutside)
    }
  }, [])

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus()
      const rect = dropdownRef.current?.getBoundingClientRect()
      if (rect) setAbove(window.innerHeight - rect.bottom < 280 && rect.top > window.innerHeight - rect.bottom)
    }
  }, [isEditing])

  if (!props.canEdit && props.selected.length === 0) {
    return null
  }

  const viewModeTagsList = (
    <div className="c-tags-select__container">
      <div className="c-tags-select__list">
        {props.selected.length > 0 && sortTags(props.selected).map((tag) => <ShowTag key={tag.id} tag={tag} link={props.asLinks} />)}
        {props.canEdit && (
          <div>
            <Button variant={"link"} size={"no-padding"} onClick={onSubtitleClick}>
              {props.selected.length ? <Trans id="label.edittags">Edit tags</Trans> : <Trans id="label.addtags">Add tags...</Trans>}
            </Button>
          </div>
        )}
      </div>
    </div>
  )

  // Dynamic multiselect dropdown for tags selection
  const editTagsList = props.tags.length > 0 && (
    <div
      className="c-tags-select__container"
      ref={dropdownRef}
      onKeyDown={handleEsc}
      onClick={props.canEdit && !isEditing ? onSubtitleClick : undefined}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node)) setIsEditing(false)
      }}
    >
      <div className="c-tags-select__selected-container">
        {props.canEdit && (
          <Button className="text-gray-600" variant={"link"} size={"no-padding"} onClick={onSubtitleClick}>
            <Trans id="label.addtags">Add tags...</Trans>
          </Button>
        )}
        {sortTags(props.selected).map((tag) => (
          <div key={tag.id} className="c-tags-select__selected-item">
            <ShowTag tag={tag} />
            <button
              type="button"
              disabled={!props.canEdit}
              onClick={() => handleOptionClick(tag)}
              className="c-tags-select__remove-button"
              aria-label={`${i18n._({ id: "action.remove", message: "Remove" })}: ${tag.name}`}
            >
              ×
            </button>
          </div>
        ))}
      </div>

      {/* Dropdown options after items are filtered */}
      {isEditing && (
        <div className="c-tags-select__options" data-side={above ? "top" : "bottom"}>
          {/* Search box to enter query string */}
          <input
            type="text"
            value={query}
            ref={inputRef}
            onChange={(e) => {
              setQuery(e.target.value)
              setActiveIndex(0)
            }}
            role="combobox"
            aria-label={i18n._({ id: "label.searchtags", message: "Search tags..." })}
            aria-expanded={true}
            aria-controls={listId}
            aria-activedescendant={filteredOptions[activeIndex] ? `${listId}-${activeIndex}` : undefined}
            className="c-input c-tags-select__search-input"
            placeholder={i18n._({ id: "label.searchtags", message: "Search tags..." })}
            onKeyDown={onInputKeyDown}
          />
          <div role="listbox" id={listId} aria-label={i18n._({ id: "label.tags", message: "Tags" })}>
            {filteredOptions.length > 0 ? (
              filteredOptions.map((tag, index) => (
                <div
                  key={tag.id}
                  id={`${listId}-${index}`}
                  role="option"
                  aria-selected={index === activeIndex}
                  className="c-tags-select__option"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => handleOptionClick(tag)}
                >
                  <ShowTag tag={tag} />
                </div>
              ))
            ) : (
              <div className="c-tags-select__no-options">
                <Trans id="labels.notagsavailable">No tags available</Trans>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )

  if (fider.isReadOnly) {
    return (
      <VStack>
        <HStack spacing={2} className="text-category">
          <Trans id="label.tags">Tags</Trans>
        </HStack>
        {viewModeTagsList}
      </VStack>
    )
  }

  return (
    <div ref={containerRef} className="c-tags-select">
      <HStack spacing={2} align="center" className="text-primary-base text-xs">
        {isEditing || props.alwaysEditing ? editTagsList : viewModeTagsList}
      </HStack>
    </div>
  )
}
