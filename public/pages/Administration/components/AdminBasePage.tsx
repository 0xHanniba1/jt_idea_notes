import "./AdminBasePage.scss"

import React from "react"
import { i18n } from "@lingui/core"
import { Header, PageTitle } from "@fider/components"
import { SideMenu, SideMenuToggler } from "./SideMenu"
import { HStack } from "@fider/components/layout"

interface AdminPageContainerProps {
  id: string
  name: string
  title: string
  subtitle: string
  children: React.ReactNode
}

export const AdminPageContainer = (props: AdminPageContainerProps) => {
  return (
    <Header title={props.title} section={{ label: i18n._({ id: "menu.sitesettings", message: "Site Settings" }), href: "/admin" }}>
      <div id={props.id} className="page container">
        <HStack justify="between">
          <PageTitle title={props.title} subtitle={props.subtitle} />
          <SideMenuToggler />
        </HStack>

        <div className="c-admin-basepage">
          <SideMenu activeItem={props.name} />
          <div>{props.children}</div>
        </div>
      </div>
    </Header>
  )
}

export abstract class AdminBasePage<P, S> extends React.Component<P, S> {
  public abstract id: string
  public abstract name: string
  public abstract title: string
  public abstract subtitle: string
  public abstract content(): JSX.Element

  public render() {
    return (
      <AdminPageContainer id={this.id} name={this.name} title={this.title} subtitle={this.subtitle}>
        {this.content()}
      </AdminPageContainer>
    )
  }
}
