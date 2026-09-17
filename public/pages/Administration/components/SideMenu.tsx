import "./SideMenu.scss"

import { i18n } from "@lingui/core"
import React, { useState } from "react"
import { classSet } from "@fider/services"
import { Icon } from "@fider/components"
import { useFider } from "@fider/hooks"
import IconX from "@fider/assets/images/heroicons-x.svg"
import IconMenu from "@fider/assets/images/heroicons-menu.svg"
import { VStack } from "@fider/components/layout"

interface SiteMenuProps {
  activeItem: string
  className?: string
}

interface SideMenuItemProps {
  name: string
  title: string
  isActive: boolean
  href: string
}

const SideMenuItem = (props: SideMenuItemProps) => {
  const className = classSet({
    "c-side-menu__item": true,
    "c-side-menu__item--active": props.isActive,
  })

  return (
    <a key={props.name} className={className} href={props.href} aria-current={props.isActive ? "page" : undefined}>
      {props.title}
    </a>
  )
}

export const SideMenu = (props: SiteMenuProps) => {
  const fider = useFider()
  const activeItem = props.activeItem || "general"

  return (
    <div className="js-admin-menu sm:hidden md:hidden lg:block">
      <VStack spacing={0} className="c-side-menu">
        <SideMenuItem name="general" title={i18n._({ id: "admin.menu.general", message: "General" })} href="/admin" isActive={activeItem === "general"} />
        <SideMenuItem
          name="privacy"
          title={i18n._({ id: "admin.menu.privacy", message: "Privacy" })}
          href="/admin/privacy"
          isActive={activeItem === "privacy"}
        />
        <SideMenuItem name="users" title={i18n._({ id: "admin.menu.users", message: "Users" })} href="/admin/users" isActive={activeItem === "users"} />
        <SideMenuItem name="tags" title={i18n._({ id: "admin.menu.tags", message: "Tags" })} href="/admin/tags" isActive={activeItem === "tags"} />
        <SideMenuItem
          name="advanced"
          title={i18n._({ id: "admin.menu.advanced", message: "Advanced" })}
          href="/admin/advanced"
          isActive={activeItem === "advanced"}
        />
        {fider.session.user.isAdministrator && (
          <>
            {fider.settings.isBillingEnabled && (
              <SideMenuItem
                name="billing"
                title={i18n._({ id: "admin.menu.billing", message: "Billing" })}
                href="/admin/billing"
                isActive={activeItem === "billing"}
              />
            )}
            <SideMenuItem
              name="webhooks"
              title={i18n._({ id: "admin.menu.webhooks", message: "Webhooks" })}
              href="/admin/webhooks"
              isActive={activeItem === "webhooks"}
            />
            <SideMenuItem
              name="export"
              title={i18n._({ id: "admin.menu.export", message: "Export" })}
              href="/admin/export"
              isActive={activeItem === "export"}
            />
          </>
        )}
      </VStack>
    </div>
  )
}

export const SideMenuToggler = () => {
  const [isActive, setIsActive] = useState(false)

  const toggle = () => {
    const classes = ["sm:hidden", "md:hidden"]
    const el = document.querySelector(".js-admin-menu") as HTMLElement
    if (el && !isActive) {
      el.classList.remove(...classes)
    } else if (el && isActive) {
      el.classList.add(...classes)
    }
    setIsActive(!isActive)
  }

  return (
    <button
      type="button"
      className="c-side-menu-toggle lg:hidden xl:hidden"
      aria-label={i18n._({ id: "admin.menu.toggle", message: "Toggle settings menu" })}
      aria-expanded={isActive}
      onClick={toggle}
    >
      {isActive ? <Icon sprite={IconX} /> : <Icon sprite={IconMenu} />}
    </button>
  )
}
