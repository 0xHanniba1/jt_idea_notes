import { i18n } from "@lingui/core"
import { Trans } from "@lingui/react/macro"
import React from "react"

import { Button, Modal, Input, Message } from "@fider/components"
import { AdminBasePage } from "@fider/pages/Administration/components/AdminBasePage"
import { actions, notify, Fider } from "@fider/services"
import { Icon } from "@fider/components"
import IconExclamation from "@fider/assets/images/heroicons-exclamation.svg"

interface DangerZonePageProps {
  isOwner: boolean
  scheduledDeletionAt?: string | null
}

interface DangerZonePageState {
  showModal: boolean
  confirmation: string
  scheduledDeletionAt?: string | null
}

export default class DangerZonePage extends AdminBasePage<DangerZonePageProps, DangerZonePageState> {
  public id = "p-admin-danger"
  public name = "danger-zone"
  public title = i18n._({ id: "admin.danger.title", message: "Danger zone" })
  public subtitle = i18n._({ id: "admin.danger.subtitle", message: "Permanently delete this site" })

  constructor(props: DangerZonePageProps) {
    super(props)
    this.state = {
      showModal: false,
      confirmation: "",
      scheduledDeletionAt: props.scheduledDeletionAt,
    }
  }

  private openModal = () => this.setState({ showModal: true })
  private closeModal = () => this.setState({ showModal: false, confirmation: "" })

  private confirmDelete = async () => {
    const response = await actions.requestTenantDeletion(this.state.confirmation)
    if (response.ok) {
      this.setState({ showModal: false, confirmation: "", scheduledDeletionAt: response.data.scheduledDeletionAt })
      notify.success(
        i18n._({ id: "admin.danger.scheduled", message: "Site deletion has been scheduled. You have one hour to cancel using the link sent to your email." })
      )
    } else {
      notify.error(i18n._({ id: "admin.danger.schedulefailed", message: "Failed to schedule deletion. Please try again later." }))
    }
  }

  private cancelDeletion = async () => {
    const response = await actions.cancelTenantDeletion()
    if (response.ok) {
      this.setState({ scheduledDeletionAt: null })
      notify.success(i18n._({ id: "admin.danger.cancelled", message: "The scheduled deletion has been cancelled." }))
    } else {
      notify.error(i18n._({ id: "admin.danger.cancelfailed", message: "Failed to cancel the scheduled deletion. Please try again later." }))
    }
  }

  private renderScheduled() {
    const when = this.state.scheduledDeletionAt ? new Date(this.state.scheduledDeletionAt).toLocaleString(i18n.locale) : ""
    return (
      <Message type="error">
        <h4 className="text-title mb-1">
          <Trans id="admin.danger.scheduledtitle">This site is scheduled for deletion</Trans>
        </h4>
        <p className="mb-2">
          <Trans id="admin.danger.scheduledhelp">
            Permanent deletion of all site data will be processed after <strong>{when}</strong>. Once executed, this cannot be undone.
          </Trans>
        </p>
        {this.props.isOwner ? (
          <Button variant="danger" size="small" onClick={this.cancelDeletion}>
            <Trans id="admin.danger.cancel">Cancel deletion</Trans>
          </Button>
        ) : (
          <p className="text-muted">
            <Trans id="admin.danger.cancelowner">Only the site owner can cancel deletion.</Trans>
          </p>
        )}
      </Message>
    )
  }

  private renderDelete() {
    const subdomain = Fider.session.tenant.subdomain

    if (!this.props.isOwner) {
      return (
        <Message type="warning">
          <h4 className="text-title mb-1">
            <Trans id="admin.danger.delete">Delete this site</Trans>
          </h4>
          <p className="text-muted">
            <Trans id="admin.danger.owner">Only the site owner can delete this site. Please contact them if deletion is needed.</Trans>
          </p>
        </Message>
      )
    }

    return (
      <div>
        <Modal.Window isOpen={this.state.showModal} center={false} onClose={this.closeModal}>
          <Modal.Header>
            <Trans id="admin.danger.confirmtitle">Delete the site and all its data?</Trans>
          </Modal.Header>
          <Modal.Content>
            <p>
              <Trans id="admin.danger.confirmhelp">
                This will <strong>permanently delete</strong> this site and all of its users, posts and comments. When deletion is processed, the active Stripe
                subscription will also be cancelled.
              </Trans>
            </p>
            <h4 className="text-title mb-2">
              <Trans id="admin.danger.howtitle">How deletion works</Trans>
            </h4>
            <p>
              <Trans id="admin.danger.howhelp">
                After submission, the deletion request is queued and an email with a cancellation link is sent. You have one hour to cancel. After that, a
                background task permanently deletes the site. Deletion cannot be undone, and the site cannot be restored through this service.
              </Trans>
            </p>
            <p className="mt-2">
              <Trans id="admin.danger.confirmdomain">
                To confirm, enter this site&apos;s subdomain (<strong>{subdomain}</strong>) below:
              </Trans>
            </p>
            <Input field="confirmation" value={this.state.confirmation} placeholder={subdomain} onChange={(confirmation) => this.setState({ confirmation })} />
          </Modal.Content>
          <Modal.Footer>
            <Button variant="danger" disabled={this.state.confirmation !== subdomain} onClick={this.confirmDelete}>
              <Trans id="admin.danger.confirmbutton">Confirm site deletion</Trans>
            </Button>
            <Button variant="tertiary" onClick={this.closeModal}>
              <Trans id="action.cancel">Cancel</Trans>
            </Button>
          </Modal.Footer>
        </Modal.Window>

        <h4 className="text-title mb-1 flex items-center gap-1 text-red-700">
          <Icon sprite={IconExclamation} height="24" />
          <Trans id="admin.danger.delete">Delete this site</Trans>
        </h4>
        <p className="text-muted text-red">
          <Trans id="admin.danger.warning">
            This permanently deletes the site and <strong>all of its data</strong>, including users, posts and comments. When deletion is processed, the active
            Stripe subscription is cancelled.
          </Trans>
        </p>
        <Button variant="danger" size="small" onClick={this.openModal}>
          <Trans id="admin.danger.open">I understand, delete this site</Trans>
        </Button>
      </div>
    )
  }

  public content() {
    return this.state.scheduledDeletionAt ? this.renderScheduled() : this.renderDelete()
  }
}
