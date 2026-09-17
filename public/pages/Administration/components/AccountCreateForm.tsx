import React, { useRef, useState } from "react"
import { i18n } from "@lingui/core"
import { Trans } from "@lingui/react/macro"
import { Button, Form, Input, Select } from "@fider/components"
import { PasswordInput } from "@fider/components/common/form/PasswordInput"
import { UserRole } from "@fider/models"
import { actions, Failure } from "@fider/services"
import { authenticationFailure, validatePassword, validateUsername } from "@fider/services/password-auth"
import { AccountSecret } from "./AccountCredentials"

export const accountRoleOptions = () => [
  { value: UserRole.Visitor, label: i18n._({ id: "admin.members.member", message: "member" }) },
  { value: UserRole.Collaborator, label: i18n._({ id: "admin.members.collaborator", message: "collaborator" }) },
  { value: UserRole.Administrator, label: i18n._({ id: "admin.members.administrator", message: "administrator" }) },
]

export const TemporaryPasswordHelp = () => (
  <p className="text-muted mt-1">
    <Trans id="accounts.temporary.optionalhelp">Leave blank to generate a password automatically. A password change is required at the next sign-in.</Trans>{" "}
    <Trans id="auth.password.policy">Use 8–12 characters. Spaces and Chinese characters are allowed.</Trans>
  </p>
)

export const AccountCreateForm = ({ onCreated }: { onCreated: (secret?: AccountSecret) => void }) => {
  const [username, setUsername] = useState("")
  const [name, setName] = useState("")
  const [password, setPassword] = useState("")
  const [role, setRole] = useState(UserRole.Visitor)
  const [revision, setRevision] = useState(0)
  const [error, setError] = useState<Failure>()
  const [busy, setBusy] = useState(false)
  const pending = useRef(false)
  // Unique fields avoid duplicate input IDs when an account-action dialog is open.
  const showError = (failure: Failure) =>
    setError({
      errors: failure.errors?.map((item) => ({
        ...item,
        field: item.field && ["username", "name", "password", "role"].includes(item.field) ? `create-${item.field}` : undefined,
      })),
    })

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (pending.current) return
    const errors = [...validateUsername(username), ...(password ? validatePassword(password) : [])]
    if (!name.trim()) errors.push({ field: "name", message: i18n._({ id: "accounts.nickname.required", message: "Enter a nickname." }) })
    if (errors.length) return showError({ errors })
    pending.current = true
    setBusy(true)
    setError(undefined)
    try {
      const result = await actions.createAccount(username, name.trim(), password, role)
      if (!result.ok) return showError(result.error || authenticationFailure())
      const temporaryPassword = result.data?.temporaryPassword || password
      const normalizedUsername = username.trim().toLowerCase()
      setUsername("")
      setName("")
      setPassword("")
      setRole(UserRole.Visitor)
      setRevision((value) => value + 1)
      onCreated(temporaryPassword ? { username: normalizedUsername, password: temporaryPassword } : undefined)
    } catch {
      showError(authenticationFailure())
    } finally {
      pending.current = false
      setBusy(false)
    }
  }

  return (
    <Form className="c-account-create" error={error} onSubmit={submit} autoComplete="off">
      <Input
        field="create-username"
        label={i18n._({ id: "auth.username", message: "Username" })}
        value={username}
        onChange={setUsername}
        disabled={busy}
        maxLength={32}
      >
        <p className="text-muted mt-1">
          <Trans id="auth.username.help">
            Use 3–32 letters, numbers, dots, underscores or hyphens. Usernames are saved in lowercase and cannot be changed.
          </Trans>
        </p>
      </Input>
      <Input
        field="create-name"
        label={i18n._({ id: "accounts.nickname", message: "Nickname" })}
        value={name}
        onChange={setName}
        disabled={busy}
        maxLength={100}
      >
        <p className="text-muted mt-1">
          <Trans id="accounts.nickname.help">Shown on your records and comments. Changing it does not change your username.</Trans>
        </p>
      </Input>
      <Select
        key={revision}
        field="create-role"
        label={i18n._({ id: "admin.members.role", message: "Role" })}
        defaultValue={UserRole.Visitor}
        disabled={busy}
        options={accountRoleOptions()}
        onChange={(option) => option && setRole(option.value as UserRole)}
      />
      <PasswordInput
        field="create-password"
        label={i18n._({ id: "accounts.temporary.optional", message: "Temporary password (optional)" })}
        value={password}
        onChange={setPassword}
        autoComplete="new-password"
        disabled={busy}
      >
        <TemporaryPasswordHelp />
      </PasswordInput>
      <Button type="submit" variant="primary" disabled={busy}>
        <Trans id="accounts.create">Create account</Trans>
      </Button>
    </Form>
  )
}
