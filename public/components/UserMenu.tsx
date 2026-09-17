import React, { useState, useRef } from "react"
import { useFider } from "@fider/hooks"
import { Avatar, Dropdown } from "./common"
import { actions, notify } from "@fider/services"
import { Trans } from "@lingui/react/macro"
import { i18n } from "@lingui/core"
import IconCog from "@fider/assets/images/heroicons-cog.svg"
import IconWrench from "@fider/assets/images/heroicons-wrenchscrewdriver.svg"
import IconLeft from "@fider/assets/images/heroicons-arrowleft-rectangle.svg"

export const UserMenu = ({ sidebar = false, compact = false }: { sidebar?: boolean; compact?: boolean }) => {
  const fider = useFider()
  const [signingOut, setSigningOut] = useState(false)
  const pending = useRef(false)
  const signOut = async () => {
    if (pending.current) return
    pending.current = true
    setSigningOut(true)
    try {
      const result = await actions.signOut()
      if (result.ok) {
        window.dispatchEvent(new CustomEvent("fider:access-denied", { detail: { status: 401 } }))
        window.location.assign("/signin")
      } else notify.error(result.error?.errors?.[0]?.message || <Trans id="auth.request.failed">Unable to complete this request. Please try again.</Trans>)
    } catch {
      notify.error(<Trans id="auth.request.failed">Unable to complete this request. Please try again.</Trans>)
    } finally {
      pending.current = false
      setSigningOut(false)
    }
  }

  return (
    <div className="c-menu-user">
      <Dropdown
        ariaLabel={fider.session.user.name}
        position={sidebar ? "right" : "left"}
        renderHandle={
          <>
            <Avatar user={fider.session.user} />
            {sidebar && !compact && (
              <>
                <span className="c-user-menu__identity">
                  <span>{fider.session.user.name}</span>
                  <small>
                    {fider.session.user.isAdministrator
                      ? i18n._({ id: "workspace.role.administrator", message: "Administrator" })
                      : fider.session.user.isCollaborator
                      ? i18n._({ id: "workspace.role.collaborator", message: "Collaborator" })
                      : i18n._({ id: "workspace.role.member", message: "Member" })}
                  </small>
                </span>
                <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" aria-hidden="true">
                  <path d="m5 6 3-3 3 3M5 10l3 3 3-3" />
                </svg>
              </>
            )}
          </>
        }
      >
        <Dropdown.ListItem href="/settings" icon={IconCog}>
          <Trans id="menu.mysettings">My Settings</Trans>
        </Dropdown.ListItem>

        {fider.session.user.isAdministrator && (
          <>
            <Dropdown.ListItem href="/admin" icon={IconWrench}>
              <Trans id="menu.sitesettings">Site Settings</Trans>
            </Dropdown.ListItem>
          </>
        )}
        <Dropdown.ListItem onClick={signOut} disabled={signingOut} icon={IconLeft}>
          <Trans id="menu.signout">Sign out</Trans>
        </Dropdown.ListItem>
      </Dropdown>
    </div>
  )
}
