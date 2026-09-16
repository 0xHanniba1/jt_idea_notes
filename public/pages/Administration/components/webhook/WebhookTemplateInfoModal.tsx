import "./WebhookTemplateInfoModal.scss"

import { Button, Loader, Modal } from "@fider/components"
import { WebhookProperties } from "@fider/pages/Administration/components/webhook/WebhookProperties"
import { i18n } from "@lingui/core"
import { Trans } from "@lingui/react/macro"
import React, { useEffect, useState } from "react"
import { WebhookType } from "@fider/models"
import { actions, StringObject } from "@fider/services"
import { HStack, VStack } from "@fider/components/layout"
import { HoverInfo } from "@fider/components/common/HoverInfo"

interface WebhookTemplateInfoProps {
  type: WebhookType
  isModalOpen: boolean
  onModalClose: () => void
}

interface FunctionSpecification {
  params: {
    type: string
    desc: string
    info?: string
    link?: string
  }[]
  description: string
  info?: string
  link?: string
}

const getFunctions = (): StringObject<FunctionSpecification> => ({
  stripHtml: {
    params: [{ type: "string", desc: i18n._({ id: "admin.webhooks.function.striphtml.input", message: "The input string containing HTML to strip" }) }],
    description: i18n._({ id: "admin.webhooks.function.striphtml.description", message: "Strip HTML tags from the input data" }),
    info: i18n._({ id: "admin.webhooks.function.striphtml.info", message: "It removes all tags to keep only content" }),
  },
  md5: {
    params: [{ type: "string", desc: i18n._({ id: "admin.webhooks.function.md5.input", message: "The input string to hash" }) }],
    description: i18n._({ id: "admin.webhooks.function.md5.description", message: "Hash text using md5 algorithm" }),
    info: i18n._({ id: "admin.webhooks.function.md5.info", message: "What is MD5?" }),
    link: "https://en.wikipedia.org/wiki/MD5",
  },
  lower: {
    params: [{ type: "string", desc: i18n._({ id: "admin.webhooks.function.lower.input", message: "The input string to lowercase" }) }],
    description: i18n._({ id: "admin.webhooks.function.lower.description", message: "Lowercase text" }),
  },
  upper: {
    params: [{ type: "string", desc: i18n._({ id: "admin.webhooks.function.upper.input", message: "The input string to uppercase" }) }],
    description: i18n._({ id: "admin.webhooks.function.upper.description", message: "Uppercase text" }),
  },
  markdown: {
    params: [{ type: "string", desc: i18n._({ id: "admin.webhooks.function.markdown.input", message: "The input string containing Markdown to parse" }) }],
    description: i18n._({ id: "admin.webhooks.function.markdown.description", message: "Parse Markdown to HTML from the input data" }),
    info: i18n._({ id: "admin.webhooks.function.markdown.info", message: "When parsing, input is sanitized from HTML to prevent XSS attacks" }),
  },
  format: {
    params: [
      {
        type: "string",
        desc: i18n._({ id: "admin.webhooks.function.format.input", message: "The date format according to Go specifications" }),
        info: i18n._({ id: "admin.webhooks.function.format.info", message: "See Go time format" }),
        link: "https://yourbasic.org/golang/format-parse-string-time-date-example/#standard-time-and-date-formats",
      },
      { type: "time", desc: i18n._({ id: "admin.webhooks.function.format.time", message: "The time to format" }) },
    ],
    description: i18n._({ id: "admin.webhooks.function.format.description", message: "Format the given date and time" }),
  },
  quote: {
    params: [{ type: "string", desc: i18n._({ id: "admin.webhooks.function.quote.input", message: "The input string to quote" }) }],
    description: i18n._({ id: "admin.webhooks.function.quote.description", message: "Enquote a string and escape inner special characters" }),
    info: i18n._({ id: "admin.webhooks.function.quote.info", message: "You should use this function when using a value as a JSON field" }),
  },
  escape: {
    params: [{ type: "string", desc: i18n._({ id: "admin.webhooks.function.escape.input", message: "The input string to escape" }) }],
    description: i18n._({ id: "admin.webhooks.function.escape.description", message: "Escape inner special characters of a string, without enquoting it" }),
    info: i18n._({ id: "admin.webhooks.function.escape.info", message: "You should use this function when using a value within an enquoted string" }),
  },
  urlquery: {
    params: [{ type: "string", desc: i18n._({ id: "admin.webhooks.function.urlquery.input", message: "The input string to encode as URL query value" }) }],
    description: i18n._({ id: "admin.webhooks.function.urlquery.description", message: "Encode a string into a valid URL query element" }),
    info: i18n._({ id: "admin.webhooks.function.urlquery.info", message: "You should use this function when using a value in URL" }),
  },
  truncate: {
    params: [
      { type: "string", desc: i18n._({ id: "admin.webhooks.function.truncate.input", message: "The input string to truncate" }) },
      { type: "number", desc: i18n._({ id: "admin.webhooks.function.truncate.length", message: "Length of output string" }) },
    ],
    description: i18n._({ id: "admin.webhooks.function.truncate.description", message: "Truncate the string" }),
  },
})
const textExample = 'A new post entitled "{{ .post_title }}" has been created by {{ .author_name }}.'
const jsonExample = `{
  "title": "New post: {{ escape .post_title }}",
  "content": {{ quote .post_description }},
  "user": {{ quote .author_name }},
  "date": {{ format "2006-01-02T15:04:05-0700" .post_created_at | quote }}
}`

export const WebhookTemplateInfoModal = (props: WebhookTemplateInfoProps) => {
  const [properties, setProperties] = useState<StringObject | null>()

  useEffect(() => {
    let mounted = true
    setProperties(undefined)
    actions.getWebhookHelp(props.type).then((result) => mounted && setProperties(result.ok ? result.data : null))
    return () => {
      mounted = false
    }
  }, [props.type])

  return (
    <Modal.Window className="c-webhook-templateinfo" isOpen={props.isModalOpen} onClose={props.onModalClose} size="large">
      <Modal.Header>{i18n._({ id: "admin.webhooks.template.title", message: "Webhook template formatting help" })}</Modal.Header>
      <Modal.Content>
        <VStack spacing={4} divide>
          <div>
            <h3 className="text-title mb-1">{i18n._({ id: "admin.webhooks.template.what", message: "What is a template?" })}</h3>
            <p>
              <Trans id="admin.webhooks.template.intro">
                Templates use Go&apos;s <code>text/template</code> package. To insert a variable, prefix its name with a dot and place it between double braces,
                with spaces around it. Example:
              </Trans>
            </p>
            <pre className="text-left">{textExample}</pre>
            <p>
              {i18n._({
                id: "admin.webhooks.template.jsonhelp",
                message:
                  "When using a structured format such as JSON, string values need quotation marks. Use the appropriate function to escape special characters, depending on whether quotation marks are already present. Example:",
              })}
            </p>
            <pre className="text-left">{jsonExample}</pre>
            <Button href="https://pkg.go.dev/text/template" target="_blank" variant="primary">
              {i18n._({ id: "admin.webhooks.template.docs", message: "Official Go templates documentation" })}
            </Button>
          </div>
          {properties === null ? (
            <p className="text-muted">{i18n._({ id: "admin.webhooks.help.failed", message: "Failed to load help data" })}</p>
          ) : properties === undefined ? (
            <Loader text={i18n._({ id: "admin.webhooks.help.loading", message: "Loading help data" })} />
          ) : (
            <>
              <div>
                <h3 className="text-title mb-1">{i18n._({ id: "admin.webhooks.properties", message: "Properties" })}</h3>
                <WebhookProperties
                  properties={properties}
                  propsName={i18n._({ id: "admin.webhooks.property.name", message: "Property name" })}
                  valueName={i18n._({ id: "admin.webhooks.property.example", message: "Example value" })}
                />
              </div>
              <div>
                <h3 className="text-title mb-1">{i18n._({ id: "admin.webhooks.functions", message: "Functions" })}</h3>
                <VStack spacing={2} divide>
                  <HStack className="c-webhook-templateinfo__header flex-wrap" spacing={0}>
                    <div className="c-webhook-templateinfo__header-func">{i18n._({ id: "admin.webhooks.function", message: "Function" })}</div>
                    <div className="c-webhook-templateinfo__header-desc">{i18n._({ id: "admin.webhooks.description.label", message: "Description" })}</div>
                    <VStack className="c-webhook-templateinfo__params">
                      <div className="c-webhook-templateinfo__header-params">{i18n._({ id: "admin.webhooks.parameters", message: "Parameters" })}</div>
                      <HStack>
                        <div className="c-webhook-templateinfo__header-param">{i18n._({ id: "admin.webhooks.parameter.type", message: "Type" })}</div>
                        <div className="c-webhook-templateinfo__header-param-desc">
                          {i18n._({ id: "admin.webhooks.description.label", message: "Description" })}
                        </div>
                      </HStack>
                    </VStack>
                  </HStack>
                  {Object.entries(getFunctions()).map(([func, spec]) => (
                    <HStack key={func} className="flex-wrap" spacing={0}>
                      <div className="c-webhook-templateinfo__func">{func}</div>
                      <div className="c-webhook-templateinfo__desc">
                        {spec.description}
                        {spec.info && <HoverInfo text={spec.info} href={spec.link} target="_blank" />}
                      </div>
                      <VStack className="c-webhook-templateinfo__params" spacing={2} divide>
                        {spec.params.map((param, j) => (
                          <HStack key={j} className="flex-wrap" spacing={0}>
                            <div className="c-webhook-templateinfo__param">{param.type}</div>
                            <div className="c-webhook-templateinfo__param-desc">
                              {param.desc}
                              {param.info && <HoverInfo text={param.info} href={param.link} target="_blank" />}
                            </div>
                          </HStack>
                        ))}
                      </VStack>
                    </HStack>
                  ))}
                </VStack>
              </div>
            </>
          )}
        </VStack>
      </Modal.Content>
      <Modal.Footer>
        <Button variant="tertiary" onClick={props.onModalClose}>
          {i18n._({ id: "admin.webhooks.close", message: "Close" })}
        </Button>
      </Modal.Footer>
    </Modal.Window>
  )
}
