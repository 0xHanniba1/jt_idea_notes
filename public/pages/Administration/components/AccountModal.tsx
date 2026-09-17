import React, { useRef, useState } from "react"
import { Button, CloseIcon, Form, Input, Modal, Select } from "@fider/components"
import { PasswordInput } from "@fider/components/common/form/PasswordInput"
import { ManagedUser, UserRole, UserStatus } from "@fider/models"
import { actions, Failure } from "@fider/services"
import { authenticationFailure, validatePassword, validateUsername } from "@fider/services/password-auth"
import { i18n } from "@lingui/core"
import { Trans } from "@lingui/react/macro"
import { AccountSecret } from "./AccountCredentials"
import { accountRoleOptions, TemporaryPasswordHelp } from "./AccountCreateForm"

export type AccountOperation = "initialize" | "reset" | "restore" | "deactivate" | "role"

export const accountOperationLabel = (operation: AccountOperation): string => {
  switch (operation) {
    case "initialize":
      return i18n._({ id: "accounts.initialize", message: "Enable password sign-in" })
    case "reset":
      return i18n._({ id: "accounts.reset", message: "Reset password" })
    case "restore":
      return i18n._({ id: "accounts.restore", message: "Restore account" })
    case "deactivate":
      return i18n._({ id: "accounts.deactivate", message: "Deactivate account" })
    case "role":
      return i18n._({ id: "accounts.changerole", message: "Change role" })
  }
}

interface AccountModalProps {
  operation: AccountOperation
  user: ManagedUser
  onClose: () => void
  onSaved: (secret?: AccountSecret) => void
}

// Mounted only while open: closing/success unmounts all temporary credentials.
export const AccountModal = (props: AccountModalProps) => {
  const [username, setUsername] = useState("")
  const [password, setPassword] = useState("")
  const [role, setRole] = useState(props.user.role)
  const [error, setError] = useState<Failure>()
  const [busy, setBusy] = useState(false)
  const pending = useRef(false)
  const { operation, user } = props
  const needsUsername = operation === "initialize"
  const needsPassword = operation !== "deactivate" && operation !== "role"
  const title = accountOperationLabel(operation)

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (pending.current) return
    const errors = [...(needsUsername ? validateUsername(username) : []), ...(needsPassword && password ? validatePassword(password) : [])]
    if (errors.length) {
      setError({ errors })
      return
    }
    pending.current = true
    setBusy(true)
    setError(undefined)
    try {
      const result =
        operation === "initialize"
          ? await actions.initializeAccount(user.id, username, password)
          : operation === "reset"
          ? await actions.resetAccountPassword(user.id, password)
          : operation === "restore"
          ? await actions.unblockUser(user.id, password)
          : operation === "role"
          ? await actions.changeUserRole(user.id, role)
          : await actions.blockUser(user.id)
      if (result.ok) {
        const temporaryPassword = needsPassword ? result.data?.temporaryPassword || password : undefined
        setPassword("")
        props.onSaved(temporaryPassword ? { username: needsUsername ? username.trim().toLowerCase() : user.username, password: temporaryPassword } : undefined)
      } else {
        // Role/status failures have no corresponding field in these dialogs.
        setError(
          needsPassword
            ? {
                errors: (result.error || authenticationFailure()).errors?.map((item) => ({
                  ...item,
                  field: item.field === "password" || (needsUsername && item.field === "username") ? item.field : undefined,
                })),
              }
            : { errors: result.error?.errors?.map(({ message }) => ({ message })) || authenticationFailure().errors }
        )
      }
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
        <p className="mb-3">
          <strong>{user.name}</strong>
          {user.username ? ` · @${user.username}` : ""}
        </p>
        {operation === "initialize" && (
          <p className="text-muted mb-3">
            <Trans id="accounts.initialize.help">Enable sign-in for this existing member. Their records, comments and permissions are preserved.</Trans>
          </p>
        )}
        {operation === "initialize" && user.status === UserStatus.Blocked && (
          <p className="text-muted mb-3">
            <Trans id="accounts.initialize.inactive">This account will remain inactive after setup. Restore it separately to allow sign-in.</Trans>
          </p>
        )}
        {operation === "deactivate" && (
          <p className="text-muted mb-3">
            <Trans id="accounts.deactivate.help">This member will be signed out and unable to sign in. Their records and comments are preserved.</Trans>
          </p>
        )}
        {needsPassword && (
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
        {operation === "role" && (
          <p className="text-muted mb-3">
            <Trans id="accounts.role.help">Changing the role updates permissions for this member and signs them out on all devices.</Trans>
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
              maxLength={32}
            >
              <p className="text-muted mt-1">
                <Trans id="auth.username.help">
                  Use 3–32 letters, numbers, dots, underscores or hyphens. Usernames are saved in lowercase and cannot be changed.
                </Trans>
              </p>
            </Input>
          )}
          {operation === "role" && (
            <Select
              field="role"
              label={i18n._({ id: "admin.members.role", message: "Role" })}
              defaultValue={user.role}
              disabled={busy}
              onChange={(option) => option && setRole(option.value as UserRole)}
              options={accountRoleOptions()}
            />
          )}
          {needsPassword && (
            <PasswordInput
              field="password"
              label={i18n._({ id: "accounts.temporary.optional", message: "Temporary password (optional)" })}
              value={password}
              onChange={setPassword}
              autoComplete="new-password"
              disabled={busy}
            >
              <TemporaryPasswordHelp />
            </PasswordInput>
          )}
          <div className="flex gap-2 mt-4">
            <Button type="submit" variant={operation === "deactivate" ? "danger" : "primary"} disabled={busy || (operation === "role" && role === user.role)}>
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
