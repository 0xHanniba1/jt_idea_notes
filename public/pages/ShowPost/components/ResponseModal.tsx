import React from "react"

import { Modal, Button, DisplayError, Select, Form, TextArea, Field, SelectOption } from "@fider/components"
import { Post, PostStatus } from "@fider/models"

import { actions, Failure } from "@fider/services"
import { PostSearch } from "./PostSearch"
import { i18n } from "@lingui/core"
import { t } from "@lingui/core/macro"
import { Trans } from "@lingui/react/macro"

interface ResponseModalProps {
  post: Post
  showModal: boolean
  onCloseModal: () => void
  onResponded?: () => void | Promise<void>
}

interface ResponseModalState {
  status: string
  text: string
  originalNumber: number
  error?: Failure
  submitting: boolean
}

export class ResponseModal extends React.Component<ResponseModalProps, ResponseModalState> {
  constructor(props: ResponseModalProps) {
    super(props)

    this.state = {
      status: this.props.post.status,
      submitting: false,
      originalNumber: 0,
      text: this.props.post.response ? this.props.post.response.text : "",
    }
  }

  private submit = async () => {
    if (this.state.submitting) return
    this.setState({ submitting: true, error: undefined })
    try {
      const result = await actions.respond(this.props.post.number, this.state)
      if (result.ok) {
        if (this.props.onResponded) await this.props.onResponded()
        else location.reload()
      } else {
        this.setState({ error: result.error })
      }
    } catch {
      this.setState({
        error: { errors: [{ message: t({ id: "showpost.action.failed", message: "Unable to save. Please check your connection and try again." }) }] },
      })
    } finally {
      this.setState({ submitting: false })
    }
  }

  private setStatus = (opt?: SelectOption) => {
    if (opt) {
      this.setState({ status: opt.value })
    }
  }

  private setOriginalNumber = (originalNumber: number) => {
    this.setState({ originalNumber })
  }

  private setText = (text: string) => {
    this.setState({ text })
  }

  public render() {
    const options = PostStatus.All.map((s) => {
      const id = `enum.poststatus.${s.value.toString()}`
      return {
        value: s.value.toString(),
        label: i18n._(id, { message: s.title }),
      }
    })

    const modal = (
      <Modal.Window isOpen={this.props.showModal} onClose={this.props.onCloseModal} canClose={!this.state.submitting} center={false} size="large">
        <Modal.Header>
          <Trans id="action.respond">Update Status</Trans>
        </Modal.Header>
        <Modal.Content>
          <Form error={this.state.error} className="c-response-form">
            <Select
              field="status"
              label={i18n._({ id: "label.status", message: "Status" })}
              defaultValue={this.state.status}
              options={options}
              onChange={this.setStatus}
              disabled={this.state.submitting}
            />
            {this.state.status === PostStatus.Duplicate.value ? (
              <>
                <Field>
                  <PostSearch exclude={[this.props.post.number]} onChanged={this.setOriginalNumber} disabled={this.state.submitting} />
                </Field>
                <DisplayError fields={["originalNumber"]} error={this.state.error} />
                <span className="text-muted">
                  <Trans id="showpost.responseform.message.linkedoriginal">This post will be linked to the original post.</Trans>
                </span>
              </>
            ) : (
              <TextArea
                field="text"
                onChange={this.setText}
                value={this.state.text}
                disabled={this.state.submitting}
                minRows={5}
                placeholder={i18n._({
                  id: "showpost.responseform.text.placeholder",
                  message: "What's going on with this post? Let your users know what are your plans...",
                })}
              />
            )}
          </Form>
        </Modal.Content>

        <Modal.Footer>
          <Button variant="primary" onClick={this.submit} disabled={this.state.submitting}>
            <Trans id="action.submit">Submit</Trans>
          </Button>
          <Button variant="tertiary" onClick={this.props.onCloseModal} disabled={this.state.submitting}>
            <Trans id="action.cancel">Cancel</Trans>
          </Button>
        </Modal.Footer>
      </Modal.Window>
    )

    return modal
  }
}
