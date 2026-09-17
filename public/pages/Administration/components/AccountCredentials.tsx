import React, { useState } from "react"
import { i18n } from "@lingui/core"
import { Trans } from "@lingui/react/macro"
import { Button, CloseIcon, Input, Modal } from "@fider/components"

export interface AccountSecret {
  username: string
  password: string
}

// Kept only in the mounted page; never written to storage, URLs, or notifications.
export const AccountCredentials = ({ secret, onClose }: { secret: AccountSecret; onClose: () => void }) => {
  const [copied, setCopied] = useState(false)
  const [copyFailed, setCopyFailed] = useState(false)
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(
        `${i18n._({ id: "auth.username", message: "Username" })}: ${secret.username}\n${i18n._({ id: "accounts.temporary", message: "Temporary password" })}: ${
          secret.password
        }`
      )
      setCopied(true)
      setCopyFailed(false)
    } catch {
      setCopyFailed(true)
    }
  }
  return (
    <Modal.Window isOpen onClose={onClose} ariaLabel={i18n._({ id: "accounts.credentials.title", message: "Temporary sign-in details" })}>
      <Modal.Header>
        <div className="flex flex-items-center justify-between">
          <Trans id="accounts.credentials.title">Temporary sign-in details</Trans>
          <CloseIcon closeModal={onClose} />
        </div>
      </Modal.Header>
      <Modal.Content>
        <p className="text-muted mb-4">
          <Trans id="accounts.credentials.help">
            Save these details and share them securely with the member. This password is shown only once and disappears when this dialog is closed. The member
            must change it at the next sign-in.
          </Trans>
        </p>
        <Input field="credential-username" label={i18n._({ id: "auth.username", message: "Username" })} value={secret.username} readOnly autoComplete="off" />
        <Input
          field="credential-password"
          label={i18n._({ id: "accounts.temporary", message: "Temporary password" })}
          value={secret.password}
          readOnly
          autoComplete="off"
        />
        {copyFailed && (
          <p role="alert" className="text-muted">
            <Trans id="accounts.credentials.copyfailed">Unable to copy automatically. Select and copy the details manually.</Trans>
          </p>
        )}
        <div className="flex gap-2 mt-4 flex-wrap">
          <Button onClick={copy}>
            {copied ? <Trans id="action.copied">Copied</Trans> : <Trans id="accounts.credentials.copy">Copy username and password</Trans>}
          </Button>
          <Button variant="primary" onClick={onClose}>
            <Trans id="accounts.credentials.close">Saved, close</Trans>
          </Button>
        </div>
      </Modal.Content>
    </Modal.Window>
  )
}
