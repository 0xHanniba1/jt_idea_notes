import { i18n } from "@lingui/core"
import { defineMessage } from "@lingui/core/macro"
import React, { useState } from "react"

import { Button, ButtonClickEvent, TextArea, Form, Input, ImageUploader, Select } from "@fider/components"
import { AdminPageContainer } from "../components/AdminBasePage"
import { actions, Failure, Fider } from "@fider/services"
import { ImageUpload } from "@fider/models"
import { useFider } from "@fider/hooks"
import locales from "@locale/locales"

const languageNames = {
  en: defineMessage({ id: "admin.language.en", message: "English" }),
  "pt-BR": defineMessage({ id: "admin.language.pt-BR", message: "Portuguese (Brazilian)" }),
  "es-ES": defineMessage({ id: "admin.language.es-ES", message: "Spanish" }),
  de: defineMessage({ id: "admin.language.de", message: "German" }),
  fr: defineMessage({ id: "admin.language.fr", message: "French" }),
  "sv-SE": defineMessage({ id: "admin.language.sv-SE", message: "Swedish" }),
  it: defineMessage({ id: "admin.language.it", message: "Italian" }),
  ja: defineMessage({ id: "admin.language.ja", message: "Japanese" }),
  ko: defineMessage({ id: "admin.language.ko", message: "Korean" }),
  nl: defineMessage({ id: "admin.language.nl", message: "Dutch" }),
  pl: defineMessage({ id: "admin.language.pl", message: "Polish" }),
  ru: defineMessage({ id: "admin.language.ru", message: "Russian" }),
  sk: defineMessage({ id: "admin.language.sk", message: "Slovak" }),
  tr: defineMessage({ id: "admin.language.tr", message: "Turkish" }),
  el: defineMessage({ id: "admin.language.el", message: "Greek" }),
  ar: defineMessage({ id: "admin.language.ar", message: "Arabic" }),
  "zh-CN": defineMessage({ id: "admin.language.zh-CN", message: "Chinese (Simplified)" }),
  "zh-TW": defineMessage({ id: "admin.language.zh-TW", message: "Chinese (Traditional)" }),
  fa: defineMessage({ id: "admin.language.fa", message: "Persian" }),
}

const GeneralSettingsPage = () => {
  const fider = useFider()
  const [title, setTitle] = useState<string>(fider.session.tenant.name)
  const [welcomeMessage, setWelcomeMessage] = useState<string>(fider.session.tenant.welcomeMessage)
  const [welcomeHeader, setWelcomeHeader] = useState<string>(fider.session.tenant.welcomeHeader)
  const [descriptionTemplate, setDescriptionTemplate] = useState<string>(fider.session.tenant.descriptionTemplate)
  const [invitation, setInvitation] = useState<string>(fider.session.tenant.invitation)
  const [logo, setLogo] = useState<ImageUpload | undefined>(undefined)
  const [cname, setCNAME] = useState<string>(fider.session.tenant.cname)
  const [locale, setLocale] = useState<string>(fider.session.tenant.locale)
  const [error, setError] = useState<Failure | undefined>(undefined)

  const handleSave = async (e: ButtonClickEvent) => {
    const result = await actions.updateTenantSettings({ title, cname, welcomeMessage, welcomeHeader, descriptionTemplate, invitation, logo, locale })
    if (result.ok) {
      e.preventEnable()
      location.href = `/`
    } else if (result.error) {
      setError(result.error)
    }
  }

  const dnsInstructions = (): JSX.Element => {
    const isApex = cname.split(".").length <= 2
    const recordType = isApex ? "ALIAS" : "CNAME"
    return (
      <>
        <strong>{cname}</strong> {recordType}{" "}
        <strong>
          {fider.session.tenant.subdomain}
          {fider.settings.domain}
        </strong>
      </>
    )
  }

  return (
    <AdminPageContainer
      id="p-admin-general"
      name="general"
      title={i18n._({ id: "admin.general.title", message: "General" })}
      subtitle={i18n._({ id: "admin.general.subtitle", message: "Manage your site settings" })}
    >
      <Form error={error}>
        <Input
          field="title"
          label={i18n._({ id: "admin.general.siteTitle", message: "Site title" })}
          maxLength={60}
          value={title}
          disabled={!fider.session.user.isAdministrator}
          onChange={setTitle}
        >
          <p className="text-muted">
            {i18n._({ id: "admin.general.siteTitleHelp", message: "Use a short, recognizable name, such as your product or service name." })}
          </p>
        </Input>

        <Input
          field="welcomeHeader"
          label={i18n._({ id: "admin.general.welcomeHeader", message: "Welcome heading" })}
          maxLength={100}
          value={welcomeHeader}
          disabled={!fider.session.user.isAdministrator}
          placeholder={i18n._({ id: "admin.general.welcomePlaceholder", message: "Help us build a _better product_" })}
          onChange={setWelcomeHeader}
        >
          <p className="text-muted">
            {i18n._({
              id: "admin.general.welcomeHeaderHelp",
              message:
                "The large heading on the home page. If empty, the site name is used. Wrap text in underscores (e.g., _highlighted_) to display it in blue.",
            })}
          </p>
        </Input>

        <TextArea
          field="welcomeMessage"
          label={i18n._({ id: "admin.general.welcomeMessage", message: "Welcome message" })}
          value={welcomeMessage}
          disabled={!fider.session.user.isAdministrator}
          onChange={setWelcomeMessage}
        >
          <p className="text-muted">
            {i18n._({ id: "admin.general.welcomeMessageHelp", message: "Shown on the home page to explain what visitors can record here." })}
          </p>
        </TextArea>

        <TextArea
          field="descriptionTemplate"
          label={i18n._({ id: "admin.general.descriptionTemplate", message: "Default description for new records" })}
          value={descriptionTemplate}
          disabled={!fider.session.user.isAdministrator}
          onChange={setDescriptionTemplate}
        >
          <p className="text-muted">
            {i18n._({
              id: "admin.general.descriptionTemplateHelp",
              message: "Prefills the description when creating a new record. Users can edit it before submitting.",
            })}
          </p>
        </TextArea>

        <Input
          field="invitation"
          label={i18n._({ id: "admin.general.invitation", message: "Input prompt" })}
          maxLength={60}
          value={invitation}
          disabled={!fider.session.user.isAdministrator}
          placeholder={i18n._({ id: "admin.general.invitationPlaceholder", message: "Enter your suggestion here..." })}
          onChange={setInvitation}
        >
          <p className="text-muted">
            {i18n._({
              id: "admin.general.invitationHelp",
              message: "Prompt text for the legacy record input. The current record dialog does not use this setting.",
            })}
          </p>
        </Input>

        <ImageUploader
          label={i18n._({ id: "admin.general.logo", message: "Site logo" })}
          field="logo"
          bkey={fider.session.tenant.logoBlobKey}
          disabled={!fider.session.user.isAdministrator}
          onChange={setLogo}
        >
          <p className="text-muted">
            {i18n._({ id: "admin.general.logoHelp", message: "JPG, GIF or PNG, up to 100 KB, square, at least 200 \u00d7 200 pixels." })}
          </p>
        </ImageUploader>

        {!Fider.isSingleHostMode() && (
          <Input
            field="cname"
            label={i18n._({ id: "admin.general.cname", message: "Custom domain" })}
            maxLength={100}
            placeholder="feedback.yourcompany.com"
            value={cname}
            disabled={!fider.session.user.isAdministrator}
            onChange={setCNAME}
          >
            <div className="text-muted">
              {cname ? (
                [
                  <p key={0}>{i18n._({ id: "admin.general.dnsInstructions", message: "Add the following record to your domain DNS settings:" })}</p>,
                  <p key={1}>{dnsInstructions()}</p>,
                  <p key={2}>{i18n._({ id: "admin.general.dnsPropagation", message: "DNS changes may take up to 72 hours to take effect worldwide." })}</p>,
                ]
              ) : (
                <p>
                  {i18n._({ id: "admin.general.cnameHelp", message: "Access this site through your own domain name, for example" })}{" "}
                  <code>feedback.yourcompany.com</code>
                </p>
              )}
            </div>
          </Input>
        )}

        <Select
          label={i18n._({ id: "admin.general.locale", message: "Site language" })}
          field="locale"
          defaultValue={locale}
          options={Object.entries(locales).map(([k, v]) => ({
            value: k,
            label: i18n._(languageNames[k as keyof typeof languageNames]) || v.text,
          }))}
          onChange={(o) => setLocale(o?.value || "en")}
        >
          <p className="text-muted">
            {i18n._({ id: "admin.general.localeHelp", message: "The site interface uses this language. Missing translations fall back to English." })}
          </p>
        </Select>

        <div className="field">
          <Button disabled={!fider.session.user.isAdministrator} variant="primary" onClick={handleSave}>
            {i18n._({ id: "admin.general.save", message: "Save" })}
          </Button>
        </div>
      </Form>
    </AdminPageContainer>
  )
}

export default GeneralSettingsPage
