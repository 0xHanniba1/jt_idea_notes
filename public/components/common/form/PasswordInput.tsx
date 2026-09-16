import React, { useState } from "react"
import { Input } from "./Input"
import { i18n } from "@lingui/core"
import IconEye from "@fider/assets/images/heroicons-eye.svg"
import IconEyeSlash from "@fider/assets/images/heroicons-eyeslash.svg"

interface PasswordInputProps {
  field: string
  label: string
  value: string
  onChange: (value: string) => void
  autoComplete: "current-password" | "new-password"
  disabled?: boolean
  autoFocus?: boolean
  children?: React.ReactNode
}

export const PasswordInput = (props: PasswordInputProps) => {
  const [visible, setVisible] = useState(false)
  return (
    <Input
      {...props}
      type={visible ? "text" : "password"}
      icon={visible ? IconEyeSlash : IconEye}
      iconAriaLabel={visible ? i18n._({ id: "auth.password.hide", message: "Hide password" }) : i18n._({ id: "auth.password.show", message: "Show password" })}
      onIconClick={() => setVisible(!visible)}
    />
  )
}
