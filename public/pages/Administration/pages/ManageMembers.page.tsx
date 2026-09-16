import "./ManageMembers.page.scss"

import { t } from "@lingui/core/macro"
import { Trans } from "@lingui/react/macro"

import React, { useState, useEffect, useCallback } from "react"
import { Input, Avatar, Icon, Dropdown, Pagination } from "@fider/components"
import { User, UserRole, UserStatus } from "@fider/models"
import IconSearch from "@fider/assets/images/heroicons-search.svg"
import IconX from "@fider/assets/images/heroicons-x.svg"
import IconDotsHorizontal from "@fider/assets/images/heroicons-dots-horizontal.svg"
import HeroIconFilter from "@fider/assets/images/heroicons-filter.svg"
import { actions, Fider } from "@fider/services"
import { AdminPageContainer } from "../components/AdminBasePage"
import { HStack, VStack } from "@fider/components/layout"

interface ManageMembersPageProps {
  users: User[]
  totalPages: number
}

interface UserListItemProps {
  user: User
  onAction: (actionName: string, user: User) => Promise<void>
}

interface UserListItemExtendedProps extends UserListItemProps {
  isLast?: boolean
}

const UserListItem = (props: UserListItemExtendedProps) => {
  const admin = props.user.role === UserRole.Administrator && (
    <span className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded">
      <Trans id="admin.members.administrator">administrator</Trans>
    </span>
  )
  const collaborator = props.user.role === UserRole.Collaborator && (
    <span className="text-xs bg-green-100 text-green-800 px-2 py-1 rounded">
      <Trans id="admin.members.collaborator">collaborator</Trans>
    </span>
  )
  const blocked = props.user.status === UserStatus.Blocked && (
    <span className="text-xs bg-red-100 text-red-800 px-2 py-1 rounded">
      <Trans id="admin.members.blocked">blocked</Trans>
    </span>
  )
  const trusted = props.user.status === UserStatus.Active && props.user.role === UserRole.Visitor && props.user.isTrusted && (
    <span className="text-xs bg-green-100 text-green-800 px-2 py-1 rounded">
      <Trans id="admin.members.trusted">trusted member</Trans>
    </span>
  )
  const isMember = props.user.role === UserRole.Visitor

  const actionSelected = (actionName: string) => () => {
    props.onAction(actionName, props.user)
  }

  return (
    <div className={`c-members-row ${props.isLast ? "c-members-row--last" : ""}`}>
      <HStack>
        <Avatar user={props.user} />
        <div className="text-subtitle">{props.user.name}</div>
      </HStack>

      <div className="c-members-email text-muted" title={props.user.email}>
        {props.user.email || t({ id: "admin.members.noemail", message: "No email" })}
      </div>

      <div>
        {admin} {collaborator} {blocked} {trusted}
        {isMember && !blocked && !trusted && (
          <span className="text-xs text-gray-600">
            <Trans id="admin.members.member">member</Trans>
          </span>
        )}
      </div>

      <div className="c-members-actions flex justify-end relative">
        {Fider.session.user.id !== props.user.id && Fider.session.user.isAdministrator && (
          <div className="relative z-10">
            <Dropdown position="left" renderHandle={<Icon sprite={IconDotsHorizontal} width="16" height="16" />}>
              {!blocked && (!!collaborator || isMember) && (
                <Dropdown.ListItem onClick={actionSelected("to-administrator")}>
                  <Trans id="admin.members.setadministrator">Promote to Administrator</Trans>
                </Dropdown.ListItem>
              )}
              {!blocked && (!!admin || isMember) && (
                <Dropdown.ListItem onClick={actionSelected("to-collaborator")}>
                  <Trans id="admin.members.setcollaborator">Promote to Collaborator</Trans>
                </Dropdown.ListItem>
              )}
              {!blocked && (!!collaborator || !!admin) && (
                <Dropdown.ListItem onClick={actionSelected("to-visitor")}>
                  <Trans id="admin.members.setmember">Demote to Member</Trans>
                </Dropdown.ListItem>
              )}
              {isMember && !blocked && !props.user.isTrusted && (
                <Dropdown.ListItem onClick={actionSelected("approve")}>
                  <Trans id="admin.members.trust">Trust User</Trans>
                </Dropdown.ListItem>
              )}
              {isMember && !blocked && props.user.isTrusted && (
                <Dropdown.ListItem onClick={actionSelected("unapprove")}>
                  <Trans id="admin.members.untrust">Untrust User</Trans>
                </Dropdown.ListItem>
              )}
              {isMember && !blocked && (
                <Dropdown.ListItem onClick={actionSelected("block")}>
                  <Trans id="admin.members.block">Block User</Trans>
                </Dropdown.ListItem>
              )}
              {isMember && !!blocked && (
                <Dropdown.ListItem onClick={actionSelected("unblock")}>
                  <Trans id="admin.members.unblock">Unblock User</Trans>
                </Dropdown.ListItem>
              )}
            </Dropdown>
          </div>
        )}
      </div>
    </div>
  )
}

export default function ManageMembersPage(props: ManageMembersPageProps) {
  const [query, setQuery] = useState("")
  const [roleFilter, setRoleFilter] = useState<UserRole | "all">("all")
  const [users, setUsers] = useState<User[]>(props.users)
  const [currentPage, setCurrentPage] = useState(1)
  const [totalPages, setTotalPages] = useState(props.totalPages)
  const [searchTimeoutId, setSearchTimeoutId] = useState<number | undefined>(undefined)
  const pageSize = 10

  // Initialize state from URL parameters and load first page
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search)
    const initialQuery = urlParams.get("query") || ""
    const initialRoleFilter = (urlParams.get("roles") as UserRole) || "all"
    const initialPage = parseInt(urlParams.get("page") || "1")

    setQuery(initialQuery)
    setRoleFilter(initialRoleFilter)
    setCurrentPage(initialPage)
  }, [])

  const reloadUsers = useCallback(
    async (searchQuery: string, roleFilterValue: UserRole | "all", page = 1) => {
      const params = new URLSearchParams()
      if (searchQuery) {
        params.append("query", searchQuery)
      }
      if (roleFilterValue !== "all") {
        params.append("roles", roleFilterValue.toString())
      }
      params.append("page", page.toString())
      params.append("limit", pageSize.toString())

      const response = await fetch(`/api/v1/users?${params.toString()}`)
      if (response.ok) {
        const data = await response.json()
        setUsers(data.users)
        setTotalPages(data.totalPages)
        setCurrentPage(page)
      }
    },
    [pageSize]
  )

  const handleSearchFilterChanged = useCallback(
    (newQuery: string) => {
      setQuery(newQuery)

      // Debounce the API call for search
      if (searchTimeoutId) {
        clearTimeout(searchTimeoutId)
      }

      const timeoutId = window.setTimeout(() => {
        reloadUsers(newQuery, roleFilter, 1) // Reset to page 1 when searching
      }, 300)

      setSearchTimeoutId(timeoutId)
    },
    [roleFilter, reloadUsers, searchTimeoutId]
  )

  const handleRoleFilterChanged = useCallback(
    (newRoleFilter: UserRole | "all") => {
      setRoleFilter(newRoleFilter)
      reloadUsers(query, newRoleFilter, 1) // Reset to page 1 when changing filter
    },
    [query, reloadUsers]
  )

  const clearSearch = useCallback(() => {
    if (searchTimeoutId) {
      clearTimeout(searchTimeoutId)
    }
    setQuery("")
    reloadUsers("", roleFilter, 1)
  }, [roleFilter, reloadUsers, searchTimeoutId])

  const handlePageChange = useCallback(
    (page: number) => {
      reloadUsers(query, roleFilter, page)
    },
    [query, roleFilter, reloadUsers]
  )

  const handleAction = useCallback(
    async (actionName: string, user: User) => {
      const changeRole = async (role: UserRole) => {
        const result = await actions.changeUserRole(user.id, role)
        if (result.ok) {
          user.role = role
          // Update the user in current state without full reload
          const updatedUsers = users.map((u) => (u.id === user.id ? user : u))
          setUsers(updatedUsers)
        }
      }

      const changeStatus = async (status: UserStatus) => {
        const action = status === UserStatus.Blocked ? actions.blockUser : actions.unblockUser
        const result = await action(user.id)
        if (result.ok) {
          user.status = status
          // Update the user in current state without full reload
          const updatedUsers = users.map((u) => (u.id === user.id ? user : u))
          setUsers(updatedUsers)
        }
      }

      const changeTrust = async (isTrusted: boolean) => {
        const action = isTrusted ? actions.trustUser : actions.untrustUser
        const result = await action(user.id)
        if (result.ok) {
          user.isTrusted = isTrusted
          // Update the user in current state without full reload
          const updatedUsers = users.map((u) => (u.id === user.id ? user : u))
          setUsers(updatedUsers)
        }
      }

      if (actionName === "to-collaborator") {
        await changeRole(UserRole.Collaborator)
      } else if (actionName === "to-visitor") {
        await changeRole(UserRole.Visitor)
      } else if (actionName === "to-administrator") {
        await changeRole(UserRole.Administrator)
      } else if (actionName === "block") {
        await changeStatus(UserStatus.Blocked)
      } else if (actionName === "unblock") {
        await changeStatus(UserStatus.Active)
      } else if (actionName === "approve") {
        await changeTrust(true)
      } else if (actionName === "unapprove") {
        await changeTrust(false)
      }
    },
    [users]
  )

  return (
    <AdminPageContainer
      id="p-admin-members"
      name="users"
      title={t({ id: "admin.members.title", message: "Members" })}
      subtitle={t({ id: "admin.members.subtitle", message: "Manage your site administrators and collaborators" })}
    >
      <div className="c-members-toolbar flex gap-4 flex-items-center mb-4">
        <div className="flex-grow">
          <Input
            field="query"
            icon={query ? IconX : IconSearch}
            onIconClick={query ? clearSearch : undefined}
            placeholder={t({ id: "admin.members.search", message: "Search by name / email ..." })}
            value={query}
            onChange={handleSearchFilterChanged}
          />
        </div>
        <Dropdown
          renderHandle={
            <div className="flex flex-items-center text-medium text-xs">
              <Icon sprite={HeroIconFilter} className="h-5 pr-1" />
              <Trans id="admin.members.role">Role</Trans>
              {roleFilter !== "all" && <div className="bg-gray-200 inline-block rounded-full px-2 py-1 w-min-4 text-2xs text-center ml-2">1</div>}
            </div>
          }
        >
          <Dropdown.ListItem onClick={() => handleRoleFilterChanged("all")}>
            <span className={roleFilter === "all" ? "text-semibold" : ""}>
              <Trans id="admin.members.allroles">All Roles</Trans>
            </span>
          </Dropdown.ListItem>
          <Dropdown.ListItem onClick={() => handleRoleFilterChanged(UserRole.Administrator)}>
            <span className={roleFilter === UserRole.Administrator ? "text-semibold" : ""}>
              <Trans id="admin.members.administrators">Administrators</Trans>
            </span>
          </Dropdown.ListItem>
          <Dropdown.ListItem onClick={() => handleRoleFilterChanged(UserRole.Collaborator)}>
            <span className={roleFilter === UserRole.Collaborator ? "text-semibold" : ""}>
              <Trans id="admin.members.collaborators">Collaborators</Trans>
            </span>
          </Dropdown.ListItem>
          <Dropdown.ListItem onClick={() => handleRoleFilterChanged(UserRole.Visitor)}>
            <span className={roleFilter === UserRole.Visitor ? "text-semibold" : ""}>
              <Trans id="admin.members.members">Members</Trans>
            </span>
          </Dropdown.ListItem>
        </Dropdown>
      </div>

      <VStack className="rounded-md border border-gray-200 relative">
        <div className="c-members-row c-members-row--header">
          <div>
            <Trans id="admin.members.name">Name</Trans>
          </div>
          <div>
            <Trans id="admin.members.email">Email</Trans>
          </div>
          <div>
            <Trans id="admin.members.role">Role</Trans>
          </div>
        </div>
        <div>
          {users.map((user, index) => (
            <UserListItem key={user.id} user={user} onAction={handleAction} isLast={index === users.length - 1} />
          ))}
        </div>
      </VStack>

      <div className="pt-4">
        <Pagination currentPage={currentPage} totalPages={totalPages} onPageChange={handlePageChange} />
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
          <Trans id="admin.members.blockedhelp">
            <strong>Blocked</strong> users are unable to sign into this site.
          </Trans>
        </li>
      </ul>
    </AdminPageContainer>
  )
}
