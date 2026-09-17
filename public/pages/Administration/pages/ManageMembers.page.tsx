import "./ManageMembers.page.scss"
import { t } from "@lingui/core/macro"
import { Trans } from "@lingui/react/macro"
import React, { useState, useEffect, useCallback, useRef } from "react"
import { Input, Avatar, Pagination, Button, DisplayError, Select } from "@fider/components"
import { ManagedUser, UserRole, UserStatus } from "@fider/models"
import IconSearch from "@fider/assets/images/heroicons-search.svg"
import { Fider, Failure, http, notify } from "@fider/services"
import { authenticationFailure } from "@fider/services/password-auth"
import { AdminPageContainer } from "../components/AdminBasePage"
import { AccountModal, AccountOperation, accountOperationLabel } from "../components/AccountModal"
import { AccountCreateForm, accountRoleOptions } from "../components/AccountCreateForm"
import { AccountCredentials, AccountSecret } from "../components/AccountCredentials"

interface ManageMembersPageProps {
  users: ManagedUser[]
  totalPages: number
  totalCount: number
}
interface MemberAction {
  operation: AccountOperation
  user: ManagedUser
}
type StatusFilter = "all" | "active" | "inactive"

export default function ManageMembersPage(props: ManageMembersPageProps) {
  const [query, setQuery] = useState("")
  const [appliedQuery, setAppliedQuery] = useState("")
  const [roleFilter, setRoleFilter] = useState<UserRole | "all">("all")
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all")
  const [users, setUsers] = useState<ManagedUser[]>(props.users)
  const [currentPage, setCurrentPage] = useState(1)
  const [totalPages, setTotalPages] = useState(props.totalPages)
  const [totalCount, setTotalCount] = useState(props.totalCount)
  const [error, setError] = useState<Failure>()
  const [loading, setLoading] = useState(false)
  const [accountAction, setAccountAction] = useState<MemberAction>()
  const [secret, setSecret] = useState<AccountSecret>()
  const requestID = useRef(0)
  const isAdministrator = Fider.session.user.isAdministrator

  const reloadUsers = useCallback(async (searchQuery: string, role: UserRole | "all", status: StatusFilter, page = 1) => {
    const request = ++requestID.current
    setLoading(true)
    setError(undefined)
    const params = new URLSearchParams({ page: page.toString(), limit: "10", status })
    if (searchQuery) params.set("query", searchQuery)
    if (role !== "all") params.set("roles", role)
    try {
      const result = await http.get<ManageMembersPageProps>(`/api/v1/users?${params}`)
      if (request !== requestID.current) return
      if (result.ok) {
        setUsers(result.data.users)
        setTotalPages(result.data.totalPages)
        setTotalCount(result.data.totalCount)
        setCurrentPage(page)
      } else setError({ errors: (result.error || authenticationFailure()).errors?.map(({ message }) => ({ message })) })
    } catch {
      if (request === requestID.current) setError(authenticationFailure())
    } finally {
      if (request === requestID.current) setLoading(false)
    }
  }, [])

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const initialQuery = params.get("query") || ""
    const role = params.get("roles") as UserRole
    const initialRole = Object.values(UserRole).includes(role) ? role : "all"
    const status = params.get("status")
    const initialStatus = status === "active" || status === "inactive" ? status : "all"
    const initialPage = Math.max(1, Number(params.get("page")) || 1)
    setQuery(initialQuery)
    setAppliedQuery(initialQuery)
    setRoleFilter(initialRole)
    setStatusFilter(initialStatus)
    setCurrentPage(initialPage)
    if (initialQuery || initialRole !== "all" || initialStatus !== "all" || initialPage !== 1)
      reloadUsers(initialQuery, initialRole, initialStatus, initialPage)
    const clearSecret = () => setSecret(undefined)
    window.addEventListener("pagehide", clearSecret)
    return () => {
      requestID.current++
      window.removeEventListener("pagehide", clearSecret)
    }
  }, [reloadUsers])

  const refresh = () => reloadUsers(appliedQuery, roleFilter, statusFilter, currentPage)
  const search = (event: React.FormEvent) => {
    event.preventDefault()
    setAppliedQuery(query.trim())
    reloadUsers(query.trim(), roleFilter, statusFilter)
  }
  const changeStatus = (status: StatusFilter) => {
    setStatusFilter(status)
    reloadUsers(appliedQuery, roleFilter, status)
  }
  const changeRoleFilter = (role: UserRole | "all") => {
    setRoleFilter(role)
    reloadUsers(appliedQuery, role, statusFilter)
  }
  const onAccountSaved = (credentials?: AccountSecret) => {
    setAccountAction(undefined)
    setSecret(credentials)
    notify.success(t({ id: "accounts.saved", message: "Account updated." }))
    // A mutation may remove the only account on the current filtered page.
    reloadUsers(appliedQuery, roleFilter, statusFilter)
  }
  const onAccountCreated = (credentials?: AccountSecret) => {
    setSecret(credentials)
    setQuery("")
    setAppliedQuery("")
    setRoleFilter("all")
    setStatusFilter("all")
    notify.success(t({ id: "accounts.created", message: "Account created." }))
    reloadUsers("", "all", "all")
  }
  const roleLabel = (role: UserRole) => accountRoleOptions().find((option) => option.value === role)?.label

  return (
    <AdminPageContainer
      id="p-admin-members"
      name="users"
      title={t({ id: "accounts.management", message: "Account management" })}
      subtitle={t({ id: "accounts.members.subtitle", message: "Manage sign-in accounts, roles and account status" })}
    >
      <div className="c-members-heading">
        <Button size="small" onClick={refresh} disabled={loading}>
          <Trans id="accounts.refresh">Refresh</Trans>
        </Button>
      </div>
      <div className={`c-members-grid ${isAdministrator ? "" : "c-members-grid--list-only"}`}>
        {isAdministrator && (
          <section className="c-members-panel c-members-create" aria-labelledby="create-account-title">
            <h2 id="create-account-title">
              <Trans id="accounts.create">Create account</Trans>
            </h2>
            <AccountCreateForm onCreated={onAccountCreated} />
          </section>
        )}
        <section className="c-members-panel" aria-labelledby="account-list-title">
          <div className="c-members-section-heading">
            <h2 id="account-list-title">
              <Trans id="accounts.list">Existing accounts</Trans>
            </h2>
            <span>
              <Trans id="accounts.total">{totalCount} accounts</Trans>
            </span>
          </div>
          <form className="c-members-toolbar" onSubmit={search}>
            <div className="c-members-search">
              <Input
                field="query"
                icon={IconSearch}
                ariaLabel={t({ id: "accounts.search", message: "Search by username or name" })}
                placeholder={t({ id: "accounts.search", message: "Search by username or name" })}
                value={query}
                onChange={setQuery}
              />
              <Button type="submit" size="small">
                <Trans id="action.search">Search</Trans>
              </Button>
            </div>
            <Select
              field="member-status"
              ariaLabel={t({ id: "accounts.statusfilter", message: "Filter by account status" })}
              value={statusFilter}
              onChange={(option) => option && changeStatus(option.value as StatusFilter)}
              options={[
                { value: "all", label: t({ id: "accounts.allstatuses", message: "All statuses" }) },
                { value: "active", label: t({ id: "accounts.active", message: "Active" }) },
                { value: "inactive", label: t({ id: "accounts.inactive", message: "Inactive" }) },
              ]}
            />
            <Select
              field="member-role"
              ariaLabel={t({ id: "admin.members.role", message: "Role" })}
              value={roleFilter}
              onChange={(option) => option && changeRoleFilter(option.value as UserRole | "all")}
              options={[{ value: "all", label: t({ id: "admin.members.allroles", message: "All Roles" }) }, ...accountRoleOptions()]}
            />
          </form>
          <DisplayError error={error} />
          {error && (
            <Button size="small" onClick={refresh}>
              <Trans id="action.retry">Retry</Trans>
            </Button>
          )}
          {loading && (
            <p className="c-members-empty" role="status">
              <Trans id="accounts.loading">Loading accounts…</Trans>
            </p>
          )}
          <div className="c-members-list" aria-busy={loading}>
            {!loading &&
              users.map((user) => {
                const active = user.status === UserStatus.Active
                const canManage = isAdministrator && user.id !== Fider.session.user.id && user.status !== UserStatus.Deleted
                return (
                  <article key={user.id} className="c-members-row">
                    <div className="c-members-identity">
                      <Avatar user={user} />
                      <div>
                        <strong>
                          {user.name}
                          {user.id === Fider.session.user.id && (
                            <small>
                              {" "}
                              (<Trans id="accounts.me">me</Trans>)
                            </small>
                          )}
                        </strong>
                        <span>{user.username ? `@${user.username}` : t({ id: "accounts.nousername", message: "Username not assigned" })}</span>
                      </div>
                    </div>
                    <div className="c-members-badges">
                      <span>{roleLabel(user.role)}</span>
                      <span className={active ? "is-active" : "is-inactive"}>
                        {active ? <Trans id="accounts.active">Active</Trans> : <Trans id="accounts.inactive">Inactive</Trans>}
                      </span>
                      {!user.passwordInitialized ? (
                        <span>
                          <Trans id="accounts.uninitialized">Password sign-in not enabled</Trans>
                        </span>
                      ) : (
                        user.mustChangePassword && (
                          <span>
                            <Trans id="accounts.passwordpending">Password change required</Trans>
                          </span>
                        )
                      )}
                    </div>
                    {canManage && (
                      <div className="c-members-actions">
                        {active && (
                          <Button size="small" onClick={() => setAccountAction({ operation: "role", user })}>
                            {accountOperationLabel("role")}
                          </Button>
                        )}
                        {!user.passwordInitialized && (
                          <Button size="small" onClick={() => setAccountAction({ operation: "initialize", user })}>
                            {accountOperationLabel("initialize")}
                          </Button>
                        )}
                        {active && user.passwordInitialized && (
                          <Button className="c-members-action-warning" size="small" onClick={() => setAccountAction({ operation: "reset", user })}>
                            {accountOperationLabel("reset")}
                          </Button>
                        )}
                        {active && (
                          <Button className="c-members-action-danger" size="small" onClick={() => setAccountAction({ operation: "deactivate", user })}>
                            {accountOperationLabel("deactivate")}
                          </Button>
                        )}
                        {user.status === UserStatus.Blocked && user.passwordInitialized && (
                          <Button size="small" onClick={() => setAccountAction({ operation: "restore", user })}>
                            {accountOperationLabel("restore")}
                          </Button>
                        )}
                      </div>
                    )}
                  </article>
                )
              })}
            {!users.length && !loading && !error && (
              <p className="c-members-empty">
                <Trans id="accounts.empty">No members found.</Trans>
              </p>
            )}
          </div>
          {!loading && (
            <div className="c-members-pagination">
              <Pagination
                currentPage={currentPage}
                totalPages={totalPages}
                onPageChange={(page) => reloadUsers(appliedQuery, roleFilter, statusFilter, page)}
              />
            </div>
          )}
        </section>
      </div>
      <ul className="c-members-help text-muted">
        <li>
          <Trans id="admin.members.administratorshelp">
            <strong>Administrators</strong> have full access to edit and manage content, permissions and all site settings.
          </Trans>
        </li>
        <li>
          <Trans id="admin.members.collaboratorshelp">
            <strong>Collaborators</strong> can edit and manage content, but not permissions and settings.
          </Trans>
        </li>
        <li>
          <Trans id="accounts.history.help">
            Initialize existing members using their account actions to preserve their records. Do not create duplicate accounts for them.
          </Trans>
        </li>
      </ul>
      {accountAction && (
        <AccountModal
          key={`${accountAction.operation}:${accountAction.user.id}`}
          operation={accountAction.operation}
          user={accountAction.user}
          onClose={() => setAccountAction(undefined)}
          onSaved={onAccountSaved}
        />
      )}
      {secret && <AccountCredentials secret={secret} onClose={() => setSecret(undefined)} />}
    </AdminPageContainer>
  )
}
