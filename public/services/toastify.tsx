import { I18nProvider } from "@lingui/react"
import React from "react"
import ReactDOM from "react-dom/client"
import { i18n } from "@lingui/core"

import { ToastContainer, toast, ToastContent, ToastOptions, cssTransition } from "react-toastify"
import "react-toastify/dist/ReactToastify.css"
import "./toastify.scss"

const quietTransition = cssTransition({ enter: "jt-toast-enter", exit: "jt-toast-exit", collapse: false })
let hasContainer = false

const setup = () => {
  if (!hasContainer) {
    const rootElement = document.getElementById("root-toastify")
    if (rootElement) {
      hasContainer = true
      const root = ReactDOM.createRoot(rootElement)
      root.render(
        <I18nProvider i18n={i18n}>
          <ToastContainer
            position={toast.POSITION.BOTTOM_CENTER}
            pauseOnHover
            pauseOnFocusLoss
            closeOnClick={false}
            draggable={false}
            transition={quietTransition}
          />
        </I18nProvider>
      )
    }
  }
}
export const success = (content: ToastContent, options?: ToastOptions) => {
  setup()
  toast.success(content, { role: "status", ...options })
}

export const error = (content: ToastContent, options?: ToastOptions) => {
  setup()
  toast.error(content, { role: "alert", ...options })
}
