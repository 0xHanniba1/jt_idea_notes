import React, { useRef, useState } from "react"
import { Button, CloseIcon, Form, Input, Modal, Select } from "@fider/components"
import { PasswordInput } from "@fider/components/common/form/PasswordInput"
import { ManagedUser, UserRole, UserStatus } from "@fider/models"
import { actions, Failure } from "@fider/services"
import { authenticationFailure, validatePassword, validateUsername } from "@fider/services/password-auth"
import { i18n } from "@lingui/core"
import { Trans } from "@lingui/react/macro"

export type AccountOperation = "create" | "initialize" | "reset" | "restore" | "deactivate"

export const accountOperationLabel = (operation: AccountOperation): string => {
  switch (operation) {
    case "create":
      return i18n._({ id: "accounts.create", message: "Create account" })
    case "initialize":
      return i18n._({ id: "accounts.initialize", message: "Enable password sign-in" })
    case "reset":
      return i18n._({ id: "accounts.reset", message: "Reset password" })
    case "restore":
      return i18n._({ id: "accounts.restore", message: "Restore account" })
    case "deactivate":
      return i18n._({ id: "accounts.deactivate", message: "Deactivate account" })
  }
}

interface AccountModalProps {
  operation: AccountOperation
  user?: ManagedUser
  onClose: () => void
  onSaved: () => void
}

// Mounted only while open: closing/success unmounts all temporary credentials.
export const AccountModal = (props: AccountModalProps) => {
  const [username, setUsername] = useState("")
  const [name, setName] = useState("")
  const [password, setPassword] = useState("")
  const [role, setRole] = useState(UserRole.Visitor)
  const [error, setError] = useState<Failure>()
  const [busy, setBusy] = useState(false)
  const pending = useRef(false)
  const { operation, user } = props
  const needsUsername = operation === "create" || operation === "initialize"
  const title = accountOperationLabel(operation)

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (pending.current) return
    const errors = [...(needsUsername ? validateUsername(username) : []), ...(operation !== "deactivate" ? validatePassword(password) : [])]
    if (operation === "create" && !name.trim())
      errors.push({ field: "name", message: i18n._({ id: "accounts.name.required", message: "Enter the member's name." }) })
    if (errors.length) {
      setError({ errors })
      return
    }
    pending.current = true
    setBusy(true)
    setError(undefined)
    try {
      const result =
        operation === "create"
          ? await actions.createAccount(username, name, password, role)
          : !user
          ? undefined
          : operation === "initialize"
          ? await actions.initializeAccount(user.id, username, password)
          : operation === "reset"
          ? await actions.resetAccountPassword(user.id, password)
          : operation === "restore"
          ? await actions.unblockUser(user.id, password)
          : await actions.blockUser(user.id)
      if (result?.ok) {
        setPassword("")
        props.onSaved()
      } else setError(result?.error || authenticationFailure())
    } catch {
      setError(authenticationFailure())
    } finally {
      pending.current = false
      setBusy(false)
    }
  }

  return (
    <Modal.Window isOpen onClose={props.onClose} canClose={!busy} ariaLabel={title}>
      <Modal.Header>
        <div className="flex flex-items-center justify-between">
          <span>{title}</span>
          {!busy && <CloseIcon closeModal={props.onClose} />}
        </div>
      </Modal.Header>
      <Modal.Content>
        {user && (
          <p className="mb-3">
            {user.name}
            {user.username ? ` · ${user.username}` : ""}
          </p>
        )}
        {operation === "initialize" && (
          <p className="text-muted mb-3">
            <Trans id="accounts.initialize.help">Enable sign-in for this existing member. Their records, comments and permissions are preserved.</Trans>
          </p>
        )}
        {operation === "initialize" && user?.status === UserStatus.Blocked && (
          <p className="text-muted mb-3">
            <Trans id="accounts.initialize.inactive">This account will remain inactive after setup. Restore it separately to allow sign-in.</Trans>
          </p>
        )}
        {operation === "deactivate" ? (
          <p className="text-muted mb-3">
            <Trans id="accounts.deactivate.help">This member will be signed out and unable to sign in. Their records and comments are preserved.</Trans>
          </p>
        ) : (
          <p className="text-muted mb-3">
            <Trans id="accounts.temporary.help">
              Share this temporary password with the member securely. They must choose a new password at their next sign-in.
            </Trans>
          </p>
        )}
        {operation === "restore" && (
          <p className="text-muted mb-3">
            <Trans id="accounts.restore.help">A new temporary password is required. The old password will remain invalid.</Trans>
          </p>
        )}
        {operation === "reset" && (
          <p className="text-muted mb-3">
            <Trans id="accounts.reset.help">Resetting the password signs this member out on all devices.</Trans>
          </p>
        )}
        <Form error={error} onSubmit={submit} autoComplete="off">
          {needsUsername && (
            <Input
              field="username"
              label={i18n._({ id: "auth.username", message: "Username" })}
              value={username}
              onChange={setUsername}
              disabled={busy}
              autoComplete="off"
            >
              <p className="text-muted mt-1">
                <Trans id="auth.username.help">
                  Use 3–32 letters, numbers, dots, underscores or hyphens. Usernames are saved in lowercase and cannot be changed.
                </Trans>
              </p>
            </Input>
          )}
          {operation === "create" && (
            <>
              <Input field="name" label={i18n._({ id: "label.name", message: "Name" })} value={name} onChange={setName} disabled={busy} maxLength={100} />
              <Select
                field="role"
                label={i18n._({ id: "admin.members.role", message: "Role" })}
                defaultValue={UserRole.Visitor}
                disabled={busy}
                onChange={(option) => option && setRole(option.value as UserRole)}
                options={[
                  { value: UserRole.Visitor, label: i18n._({ id: "admin.members.member", message: "member" }) },
                  { value: UserRole.Collaborator, label: i18n._({ id: "admin.members.collaborator", message: "collaborator" }) },
                  { value: UserRole.Administrator, label: i18n._({ id: "admin.members.administrator", message: "administrator" }) },
                ]}
              />
            </>
          )}
          {operation !== "deactivate" && (
            <PasswordInput
              field="password"
              label={i18n._({ id: "accounts.temporary", message: "Temporary password" })}
              value={password}
              onChange={setPassword}
              autoComplete="new-password"
              disabled={busy}
            >
              <p className="text-muted mt-1">
                <Trans id="auth.password.policy">Use 15–128 characters, up to 512 UTF-8 bytes. Spaces and Chinese characters are allowed.</Trans>
              </p>
            </PasswordInput>
          )}
          <div className="flex gap-2 mt-4">
            <Button type="submit" variant={operation === "deactivate" ? "danger" : "primary"} disabled={busy}>
              {title}
            </Button>
            <Button onClick={props.onClose} disabled={busy}>
              <Trans id="action.cancel">Cancel</Trans>
            </Button>
          </div>
        </Form>
      </Modal.Content>
    </Modal.Window>
  )
}
