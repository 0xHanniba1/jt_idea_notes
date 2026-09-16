import { t } from "@lingui/core/macro"
import { Trans } from "@lingui/react/macro"

import React from "react"

import { Button, TextArea, Form, Input, Field } from "@fider/components"
import { actions, notify, Failure, Fider } from "@fider/services"
import { AdminBasePage } from "../components/AdminBasePage"

interface InvitationsPageState {
  subject: string
  message: string
  recipients: string[]
  numOfRecipients: number
  rawRecipients: string
  error?: Failure
}

const defaultSubject = () => {
  const siteName = Fider.session.tenant.name
  return t({ id: "admin.invitations.defaultsubject", message: `[${siteName}] We would like to hear from you!` })
}

const defaultMessage = () => {
  const siteName = Fider.session.tenant.name
  const senderName = Fider.session.user.name
  return t({
    id: "admin.invitations.defaultmessage",
    message: `Hi,

We are inviting you to join the ${siteName} feedback site, a place where you can discuss and share your ideas and thoughts on how to improve our services!

Click the link below to join!

%invite%

Regards,
${senderName} (${siteName})`,
  })
}

// On hosted Fider, only pro tenants may customize the invite copy.
const canCustomizeCopy = () => !Fider.settings.isBillingEnabled || Fider.session.tenant.isPro

export default class InvitationsPage extends AdminBasePage<any, InvitationsPageState> {
  public id = "p-admin-invitations"
  public name = "invitations"
  public title = t({ id: "admin.invitations.title", message: "Invitations" })
  public subtitle = t({ id: "admin.invitations.subtitle", message: "Invite people to share their feedback" })

  constructor(props: any) {
    super(props)

    this.state = {
      subject: defaultSubject(),
      message: defaultMessage(),
      recipients: [],
      numOfRecipients: 0,
      rawRecipients: "",
    }
  }

  private setRecipients = (rawRecipients: string) => {
    const recipients = rawRecipients.split(/\n|;|,|\s/gm).filter((x) => !!x)
    this.setState({ rawRecipients, recipients, numOfRecipients: recipients.length })
  }

  private sendSample = async () => {
    const result = await actions.sendSampleInvite(this.state.subject, this.state.message)
    if (result.ok) {
      notify.success(
        <span>
          <Trans id="admin.invitations.samplesent">
            A sample email was sent to <strong>{Fider.session.user.email}</strong>
          </Trans>
        </span>
      )
    }
    this.setState({ error: result.error })
  }

  private sendInvites = async () => {
    const result = await actions.sendInvites(this.state.subject, this.state.message, this.state.recipients)
    if (result.ok) {
      notify.success(t({ id: "admin.invitations.sent", message: "Your invites have been sent." }))
      this.setState({ rawRecipients: "", numOfRecipients: 0, recipients: [], error: undefined })
    } else {
      this.setState({ error: result.error })
    }
  }

  private setSubject = (subject: string): void => {
    this.setState({ subject })
  }

  private setMessage = (message: string): void => {
    this.setState({ message })
  }

  public content() {
    return (
      <Form error={this.state.error}>
        <TextArea
          field="recipients"
          label={t({ id: "admin.invitations.recipients", message: "Send invitations to" })}
          placeholder="james@example.com; mary@example.com"
          minRows={1}
          value={this.state.rawRecipients}
          onChange={this.setRecipients}
        >
          <div className="text-muted">
            <p>
              <Trans id="admin.invitations.recipientshelp">
                Enter the email addresses of everyone you wish to invite. Separate addresses with a <strong>semicolon</strong>, <strong>comma</strong>,{" "}
                <strong>space</strong> or <strong>line break</strong>.
              </Trans>
            </p>
            <p>
              <Trans id="admin.invitations.limit">You can send this invite to a maximum of 30 recipients each time.</Trans>
            </p>
          </div>
        </TextArea>

        {canCustomizeCopy() && (
          <>
            <Input
              field="subject"
              label={t({ id: "admin.invitations.subject", message: "Subject" })}
              value={this.state.subject}
              maxLength={70}
              onChange={this.setSubject}
            >
              <p className="text-muted">
                <Trans id="admin.invitations.subjecthelp">This is the subject that will be used on the invitation email. Keep it short and sweet.</Trans>
              </p>
            </Input>

            <TextArea
              field="message"
              label={t({ id: "admin.invitations.message", message: "Message" })}
              minRows={8}
              value={this.state.message}
              onChange={this.setMessage}
            >
              <div className="text-muted">
                <p>
                  <Trans id="admin.invitations.messagehelp">
                    This is the content of the invitation email. Explain the purpose of the invitation clearly and politely so recipients understand why they
                    are receiving it.
                  </Trans>
                </p>
                <p>
                  <Trans id="admin.invitations.placeholderhelp">
                    You can customize this message, but it must include the invitation link placeholder <strong>%invite%</strong>.
                  </Trans>
                </p>
              </div>
            </TextArea>
          </>
        )}

        <Field label={t({ id: "admin.invitations.sample", message: "Sample Invite" })}>
          {Fider.session.user.email ? (
            <Button onClick={this.sendSample}>
              <Trans id="admin.invitations.sendsample">Send a sample email to {Fider.session.user.email}</Trans>
            </Button>
          ) : (
            <Button disabled={true}>
              <Trans id="admin.invitations.noemail">Your profile doesn&apos;t have an email</Trans>
            </Button>
          )}
        </Field>

        <Field label={t({ id: "admin.invitations.confirmation", message: "Confirmation" })}>
          <p className="text-muted">
            <Trans id="admin.invitations.sendhelp">Whenever you&apos;re ready, click the following button to send out these invites.</Trans>
          </p>
          <Button onClick={this.sendInvites} variant="primary" disabled={this.state.numOfRecipients === 0}>
            <Trans id="admin.invitations.send">Send invitations ({this.state.numOfRecipients})</Trans>
          </Button>
        </Field>
      </Form>
    )
  }
}
