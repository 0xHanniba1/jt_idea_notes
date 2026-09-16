import React from "react"
import { Trans } from "@lingui/react/macro"
import { i18n } from "@lingui/core"
import { AdminPageContainer } from "../components/AdminBasePage"
import { Button } from "@fider/components"

export default function AccountAccessPage() {
  return (
    <AdminPageContainer
      id="p-admin-account-access"
      name="users"
      title={i18n._({ id: "accounts.access.title", message: "Account access" })}
      subtitle={i18n._({ id: "accounts.access.subtitle", message: "Accounts are managed by administrators" })}
    >
      <p className="mb-4">
        <Trans id="accounts.access.help">This site uses administrator-created accounts and passwords. Manage accounts on the Members page.</Trans>
      </p>
      <Button href="/admin/users">
        <Trans id="accounts.openmembers">Manage members</Trans>
      </Button>
    </AdminPageContainer>
  )
}
