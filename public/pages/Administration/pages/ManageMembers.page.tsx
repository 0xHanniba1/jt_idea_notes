import "./ManageMembers.page.scss"
import { t } from "@lingui/core/macro"
import { Trans } from "@lingui/react/macro"
import React, { useState, useEffect, useCallback, useRef } from "react"
import { Input, Avatar, Icon, Dropdown, Pagination, Button, DisplayError } from "@fider/components"
import { ManagedUser, UserRole, UserStatus } from "@fider/models"
import IconSearch from "@fider/assets/images/heroicons-search.svg"
import IconX from "@fider/assets/images/heroicons-x.svg"
import IconDotsHorizontal from "@fider/assets/images/heroicons-dots-horizontal.svg"
import HeroIconFilter from "@fider/assets/images/heroicons-filter.svg"
import { actions, Fider, Failure, http, notify } from "@fider/services"
import { authenticationFailure } from "@fider/services/password-auth"
import { AdminPageContainer } from "../components/AdminBasePage"
import { AccountModal, AccountOperation, accountOperationLabel } from "../components/AccountModal"
import { HStack, VStack } from "@fider/components/layout"

interface ManageMembersPageProps {
  users: ManagedUser[]
  totalPages: number
}
interface MemberAction {
  operation: AccountOperation
  user?: ManagedUser
}

const roleLabel = (role: UserRole) =>
  role === UserRole.Administrator
    ? t({ id: "admin.members.administrator", message: "administrator" })
    : role === UserRole.Collaborator
    ? t({ id: "admin.members.collaborator", message: "collaborator" })
    : t({ id: "admin.members.member", message: "member" })

export default function ManageMembersPage(props: ManageMembersPageProps) {
  const [query, setQuery] = useState("")
  const [roleFilter, setRoleFilter] = useState<UserRole | "all">("all")
  const [users, setUsers] = useState<ManagedUser[]>(props.users)
  const [currentPage, setCurrentPage] = useState(1)
  const [totalPages, setTotalPages] = useState(props.totalPages)
  const [error, setError] = useState<Failure>()
  const [loading, setLoading] = useState(false)
  const [pendingUser, setPendingUser] = useState<number>()
  const [accountAction, setAccountAction] = useState<MemberAction>()
  const searchTimeout = useRef<number>()
  const requestID = useRef(0)
  const isAdministrator = Fider.session.user.isAdministrator
  const mutationPending = useRef(false)

  const reloadUsers = useCallback(async (searchQuery: string, role: UserRole | "all", page = 1) => {
    const request = ++requestID.current
    setLoading(true)
    setError(undefined)
    const params = new URLSearchParams({ page: page.toString(), limit: "10" })
    if (searchQuery) params.set("query", searchQuery)
    if (role !== "all") params.set("roles", role)
    try {
      const result = await http.get<ManageMembersPageProps>(`/api/v1/users?${params}`)
      if (request !== requestID.current) return
      if (result.ok) {
        setUsers(result.data.users)
        setTotalPages(result.data.totalPages)
        setCurrentPage(page)
      } else setError(result.error || authenticationFailure())
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
    const initialPage = Math.max(1, Number(params.get("page")) || 1)
    setQuery(initialQuery)
    setRoleFilter(initialRole)
    setCurrentPage(initialPage)
    if (initialQuery || initialRole !== "all" || initialPage !== 1) reloadUsers(initialQuery, initialRole, initialPage)
    return () => {
      window.clearTimeout(searchTimeout.current)
      requestID.current++
    }
  }, [reloadUsers])

  const changeSearch = (value: string) => {
    setQuery(value)
    window.clearTimeout(searchTimeout.current)
    requestID.current++
    searchTimeout.current = window.setTimeout(() => reloadUsers(value, roleFilter), 300)
  }
  const changeFilter = (role: UserRole | "all") => {
    window.clearTimeout(searchTimeout.current)
    setRoleFilter(role)
    reloadUsers(query, role)
  }
  const clearSearch = () => {
    window.clearTimeout(searchTimeout.current)
    setQuery("")
    reloadUsers("", roleFilter)
  }

  const memberAction = async (user: ManagedUser, operation: "role" | "trust", role?: UserRole) => {
    if (mutationPending.current) return
    mutationPending.current = true
    setPendingUser(user.id)
    setError(undefined)
    try {
      const result =
        operation === "role" && role
          ? await actions.changeUserRole(user.id, role)
          : user.isTrusted
          ? await actions.untrustUser(user.id)
          : await actions.trustUser(user.id)
      if (result.ok) await reloadUsers(query, roleFilter, currentPage)
      else setError({ errors: result.error?.errors?.map(({ message }) => ({ message })) || authenticationFailure().errors })
    } catch {
      setError(authenticationFailure())
    } finally {
      mutationPending.current = false
      setPendingUser(undefined)
    }
  }

  const onAccountSaved = () => {
    setAccountAction(undefined)
    notify.success(t({ id: "accounts.saved", message: "Account updated." }))
    reloadUsers(query, roleFilter, currentPage)
  }

  return (
    <AdminPageContainer
      id="p-admin-members"
      name="users"
      title={t({ id: "admin.members.title", message: "Members" })}
      subtitle={t({ id: "accounts.members.subtitle", message: "Manage sign-in accounts, roles and account status" })}
    >
      <div className="c-members-toolbar flex gap-4 flex-items-center mb-4">
        <div className="flex-grow">
          <Input
            field="query"
            icon={query ? IconX : IconSearch}
            onIconClick={query ? clearSearch : undefined}
            ariaLabel={t({ id: "accounts.search", message: "Search by username or name" })}
            placeholder={t({ id: "accounts.search", message: "Search by username or name" })}
            value={query}
            onChange={changeSearch}
          />
        </div>
        <Dropdown
          renderHandle={
            <div className="flex flex-items-center text-medium text-xs">
              <Icon sprite={HeroIconFilter} className="h-5 pr-1" />
              <Trans id="admin.members.role">Role</Trans>
            </div>
          }
        >
          <Dropdown.ListItem checkType="radio" checked={roleFilter === "all"} onClick={() => changeFilter("all")}>
            <Trans id="admin.members.allroles">All Roles</Trans>
          </Dropdown.ListItem>
          {Object.values(UserRole).map((role) => (
            <Dropdown.ListItem key={role} checkType="radio" checked={roleFilter === role} onClick={() => changeFilter(role)}>
              {roleLabel(role)}
            </Dropdown.ListItem>
          ))}
        </Dropdown>
        {isAdministrator && (
          <Button variant="primary" onClick={() => setAccountAction({ operation: "create" })}>
            {accountOperationLabel("create")}
          </Button>
        )}
      </div>
      <DisplayError error={error} />
      {error && (
        <Button size="small" onClick={() => reloadUsers(query, roleFilter, currentPage)}>
          <Trans id="action.retry">Retry</Trans>
        </Button>
      )}
      <VStack className="rounded-md border border-gray-200 relative">
        <div className="c-members-row c-members-row--header">
          <div>
            <Trans id="admin.members.name">Name</Trans>
          </div>
          <div>
            <Trans id="auth.username">Username</Trans>
          </div>
          <div>
            <Trans id="admin.members.role">Role</Trans>
          </div>
          <div>
            <Trans id="accounts.status">Account status</Trans>
          </div>
        </div>
        <div aria-busy={loading}>
          {users.map((user, index) => {
            const active = user.status === UserStatus.Active
            const canManage = isAdministrator && user.id !== Fider.session.user.id && user.status !== UserStatus.Deleted
            return (
              <div key={user.id} className={`c-members-row ${index === users.length - 1 ? "c-members-row--last" : ""}`}>
                <HStack>
                  <Avatar user={user} />
                  <div className="text-subtitle">{user.name}</div>
                </HStack>
                <div className="c-members-username text-muted">{user.username || "—"}</div>
                <div className="text-xs">{roleLabel(user.role)}</div>
                <div className="c-members-status">
                  {user.status === UserStatus.Blocked ? (
                    <span className="c-members-state c-members-state--inactive">
                      <Trans id="accounts.inactive">Inactive</Trans>
                    </span>
                  ) : !user.passwordInitialized ? (
                    <span className="c-members-state">
                      <Trans id="accounts.uninitialized">Password sign-in not enabled</Trans>
                    </span>
                  ) : user.mustChangePassword ? (
                    <span className="c-members-state">
                      <Trans id="accounts.passwordpending">Password change required</Trans>
                    </span>
                  ) : (
                    <span className="c-members-state">
                      <Trans id="accounts.active">Active</Trans>
                    </span>
                  )}
                </div>
                <div className="c-members-actions flex justify-end relative">
                  {canManage && (
                    <Dropdown
                      position="left"
                      ariaLabel={t({ id: "accounts.actions", message: "Account actions" })}
                      renderHandle={<Icon sprite={IconDotsHorizontal} width="16" height="16" />}
                    >
                      {!user.passwordInitialized && (
                        <Dropdown.ListItem disabled={pendingUser !== undefined} onClick={() => setAccountAction({ operation: "initialize", user })}>
                          {accountOperationLabel("initialize")}
                        </Dropdown.ListItem>
                      )}
                      {active && user.passwordInitialized && (
                        <Dropdown.ListItem disabled={pendingUser !== undefined} onClick={() => setAccountAction({ operation: "reset", user })}>
                          {accountOperationLabel("reset")}
                        </Dropdown.ListItem>
                      )}
                      {active &&
                        Object.values(UserRole)
                          .filter((role) => role !== user.role)
                          .map((role) => (
                            <Dropdown.ListItem key={role} disabled={pendingUser !== undefined} onClick={() => memberAction(user, "role", role)}>
                              {t({ id: "accounts.setrole", message: "Set role" })}: {roleLabel(role)}
                            </Dropdown.ListItem>
                          ))}
                      {active && user.role === UserRole.Visitor && (
                        <Dropdown.ListItem disabled={pendingUser !== undefined} onClick={() => memberAction(user, "trust")}>
                          {user.isTrusted ? <Trans id="admin.members.untrust">Untrust User</Trans> : <Trans id="admin.members.trust">Trust User</Trans>}
                        </Dropdown.ListItem>
                      )}
                      {active && (
                        <Dropdown.ListItem disabled={pendingUser !== undefined} onClick={() => setAccountAction({ operation: "deactivate", user })}>
                          {accountOperationLabel("deactivate")}
                        </Dropdown.ListItem>
                      )}
                      {user.status === UserStatus.Blocked && user.passwordInitialized && (
                        <Dropdown.ListItem disabled={pendingUser !== undefined} onClick={() => setAccountAction({ operation: "restore", user })}>
                          {accountOperationLabel("restore")}
                        </Dropdown.ListItem>
                      )}
                    </Dropdown>
                  )}
                </div>
              </div>
            )
          })}
          {!users.length && !loading && (
            <p className="p-4 text-muted">
              <Trans id="accounts.empty">No members found.</Trans>
            </p>
          )}
        </div>
      </VStack>
      <div className="pt-4">
        <Pagination currentPage={currentPage} totalPages={totalPages} onPageChange={(page) => reloadUsers(query, roleFilter, page)} />
      </div>
      <ul className="text-muted">
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
        <AccountModal operation={accountAction.operation} user={accountAction.user} onClose={() => setAccountAction(undefined)} onSaved={onAccountSaved} />
      )}
    </AdminPageContainer>
  )
}
