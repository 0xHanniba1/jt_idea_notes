import { i18n } from "@lingui/core"
import { Trans } from "@lingui/react/macro"
import React from "react"

import { Button, Icon } from "@fider/components"
import { AdminBasePage } from "../components/AdminBasePage"
import IconDownload from "@fider/assets/images/heroicons-download.svg"

export default class ExportPage extends AdminBasePage<any, any> {
  public id = "p-admin-export"
  public name = "export"
  public title = i18n._({ id: "admin.export.title", message: "Export" })
  public subtitle = i18n._({ id: "admin.export.subtitle", message: "Download your data" })

  public content() {
    return (
      <>
        <h2 className="text-display">
          <Trans id="admin.export.posts.title">Export posts</Trans>
        </h2>
        <p className="text-muted">
          <Trans id="admin.export.posts.help">Download the site records as a CSV file for analysis in other tools or for backup.</Trans>
        </p>
        <Button variant="secondary" href="/admin/export/posts.csv">
          <Icon sprite={IconDownload} />
          <span>
            <Trans id="admin.export.posts.download">Download posts.csv</Trans>
          </span>
        </Button>

        <div className="mt-8">
          <h2 className="text-display">
            <Trans id="admin.export.backup.title">Back up your data</Trans>
          </h2>
          <p className="text-muted">
            <Trans id="admin.export.backup.help">
              Download a ZIP archive containing site records, comments, users and settings in JSON format, together with uploaded files.
            </Trans>
          </p>
          <Button variant="secondary" href="/admin/export/backup.zip">
            <Icon sprite={IconDownload} />
            <span>
              <Trans id="admin.export.backup.download">Download backup.zip</Trans>
            </span>
          </Button>
        </div>
      </>
    )
  }
}
