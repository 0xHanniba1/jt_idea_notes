import React from "react"
import { classSet } from "@fider/services"
import { Dropdown } from "../Dropdown"
import { ValidationContext } from "./Form"
import { DisplayError, hasError } from "./DisplayError"

import "./Select.scss"

export interface SelectOption {
  value: string
  label: string
}

interface SelectProps {
  children?: React.ReactNode
  field: string
  label?: string
  ariaLabel?: string
  maxLength?: number
  disabled?: boolean
  defaultValue?: string
  value?: string
  options: SelectOption[]
  onChange?: (option?: SelectOption) => void
}

export const Select: React.FunctionComponent<SelectProps> = (props) => {
  const [selectedValue, setSelectedValue] = React.useState(props.defaultValue ?? props.options[0]?.value)
  const value = props.value !== undefined ? props.value : selectedValue
  const selected = props.options.find((option) => option.value === value) ?? props.options[0]
  const ctx = React.useContext(ValidationContext)
  const invalid = hasError(props.field, ctx.error)
  const errorId = `input-${props.field}-error`

  const handleChange = (option: SelectOption) => {
    if (props.disabled || option.value === selected?.value) return
    if (invalid) ctx.clearError?.(props.field)
    setSelectedValue(option.value)
    props.onChange?.(option)
  }

  return (
    <div className="c-form-field">
      {!!props.label && <label htmlFor={`input-${props.field}`}>{props.label}</label>}
      <div className={classSet({ "c-select": true, "c-select--error": invalid })}>
        <Dropdown
          triggerId={`input-${props.field}`}
          ariaLabel={props.ariaLabel || props.label}
          ariaInvalid={invalid}
          ariaDescribedBy={invalid ? errorId : undefined}
          disabled={props.disabled || props.options.length === 0}
          typeAhead
          renderHandle={
            <>
              <span className="c-select__value">{selected?.label}</span>
              <svg className="c-select__chevron" width="16" height="16" viewBox="0 0 20 20" fill="none" aria-hidden="true">
                <path d="m6 8 4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </>
          }
        >
          {props.options.map((option) => (
            <Dropdown.ListItem key={option.value} checked={selected?.value === option.value} onClick={() => handleChange(option)}>
              {option.label}
            </Dropdown.ListItem>
          ))}
        </Dropdown>
      </div>
      <DisplayError id={errorId} fields={[props.field]} error={ctx.error} />
      {props.children}
    </div>
  )
}
