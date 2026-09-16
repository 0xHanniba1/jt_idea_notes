import React, { useState, useEffect, useRef } from "react"
import { Input } from "./Input"
import { Form } from "./Form"
import { Failure } from "@fider/services"
import { Trans } from "@lingui/react/macro"
import { i18n } from "@lingui/core"
import { isValidUrl, normalizeUrl } from "@fider/services/url"
import { useAllowedSchemesRegex } from "@fider/hooks"
import { Modal } from "../Modal"

interface LinkInsertModalProps {
  isOpen: boolean
  onClose: () => void
  onInsertLink: (text: string, url: string) => void
  selectedText?: string
}

const LinkInsertModal = ({ isOpen, onClose, onInsertLink, selectedText = "" }: LinkInsertModalProps) => {
  const [text, setText] = useState("")
  const [url, setUrl] = useState("")
  const [error, setError] = useState<Failure | undefined>(undefined)
  const textInputRef = useRef<HTMLInputElement>(null)
  const allowedSchemes = useAllowedSchemesRegex()

  // Keep translated descriptors literal so Lingui can extract both validation messages.
  const createError = (field: string, message: string) => ({ field, message })

  const handleSubmit = () => {
    // Clear previous errors
    setError(undefined)

    // Custom validation
    const errorItems: { field?: string; message: string }[] = []

    if (!text.trim()) {
      errorItems.push(createError("text", i18n._({ id: "linkmodal.text.required", message: "Text is required" })))
    }

    // Validate URL against allowed schemes
    if (!isValidUrl(url, allowedSchemes)) {
      errorItems.push(createError("url", i18n._({ id: "linkmodal.url.invalid", message: "Please enter a valid URL or crypto address" })))
    }

    if (errorItems.length > 0) {
      setError({ errors: errorItems })
      return
    }

    // Form is valid, handle submission
    const finalUrl = normalizeUrl(url)
    onInsertLink(text.trim(), finalUrl)
    setText("")
    setUrl("")
    onClose()
  }

  const handleClose = () => {
    setText("")
    setUrl("")
    setError(undefined)
    onClose()
  }

  // Focus management and prefill text
  useEffect(() => {
    if (isOpen) {
      // Prefill with the highlighted text when the user clicked the link button
      setText(selectedText)
      if (textInputRef.current) {
        textInputRef.current.focus()
      }
    }
  }, [isOpen, selectedText])

  if (!isOpen) return null

  return (
    <Modal.Window isOpen={isOpen} onClose={handleClose} center={false}>
      <Modal.Header>
        <h3>
          <Trans id="linkmodal.title">Insert Link</Trans>
        </h3>
      </Modal.Header>
      <Modal.Content>
        <Form error={error}>
          <Input
            field="text"
            label={i18n._({ id: "linkmodal.text.label", message: "Text to display" })}
            value={text}
            onChange={setText}
            placeholder={i18n._({ id: "linkmodal.text.placeholder", message: "Enter link text" })}
            inputRef={textInputRef}
          />
          <Input
            field="url"
            label={i18n._({ id: "linkmodal.url.label", message: "URL" })}
            value={url}
            onChange={setUrl}
            placeholder={i18n._({ id: "linkmodal.url.placeholder", message: "https://example.com" })}
          />
        </Form>
      </Modal.Content>
      <Modal.Footer>
        <div style={{ display: "flex", gap: "8px" }}>
          <button type="button" onClick={handleClose} className="c-button c-button--secondary">
            <Trans id="action.cancel">Cancel</Trans>
          </button>
          <button type="button" onClick={handleSubmit} className="c-button c-button--primary">
            <Trans id="linkmodal.insert">Insert Link</Trans>
          </button>
        </div>
      </Modal.Footer>
    </Modal.Window>
  )
}

export default LinkInsertModal
