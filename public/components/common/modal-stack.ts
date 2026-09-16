interface ModalLayer {
  element: HTMLElement
  backdrop: HTMLElement
  close: () => void
  previousFocus: HTMLElement | null
}

const layers: ModalLayer[] = []
let previousOverflow = ""
let previousPadding = ""
let background: HTMLElement | null = null
let backgroundWasInert = false
let previousScrollRestoration: ScrollRestoration | undefined

const focusableSelector = 'a[href], button, input:not([type="hidden"]), select, textarea, [contenteditable]:not([contenteditable="false"]), [tabindex]'

export function modalFocusTargets(element: HTMLElement): HTMLElement[] {
  return Array.from(element.querySelectorAll<HTMLElement>(focusableSelector)).filter((target) => {
    if (target.matches(':disabled, [tabindex="-1"], [aria-disabled="true"]') || target.closest("[hidden], [inert]")) return false
    for (let ancestor: HTMLElement | null = target; ancestor; ancestor = ancestor.parentElement) {
      const style = window.getComputedStyle(ancestor)
      if (style.display === "none" || style.visibility === "hidden") return false
      if (ancestor === element) break
    }
    return true
  })
}

const topLayer = () => layers[layers.length - 1]

const focusLayer = (layer: ModalLayer) => {
  const preferred = layer.element.querySelector<HTMLElement>("[data-modal-initial-focus], [autofocus]")
  ;(preferred || modalFocusTargets(layer.element)[0] || layer.element).focus({ preventScroll: true })
}

function handleKeyDown(event: KeyboardEvent) {
  const layer = topLayer()
  if (!layer || event.isComposing || event.keyCode === 229) return
  // ProseMirror prevents Escape by default even when no editor popup is open.
  // Its idle Escape can still dismiss the owning modal. Actual editor popups
  // (mentions, toolbar menus) stop propagation when they consume Escape first.
  const editor = event.target instanceof Element ? event.target.closest('.ProseMirror[contenteditable="true"]') : null
  const editorEscape = event.key === "Escape" && editor && layer.element.contains(editor)
  if (event.defaultPrevented && !editorEscape) return
  if (event.key === "Escape") {
    event.preventDefault()
    layer.close()
  } else if (event.key === "Tab") {
    const targets = modalFocusTargets(layer.element)
    const current = document.activeElement
    const index = targets.indexOf(current as HTMLElement)
    if (targets.length === 0) {
      event.preventDefault()
      layer.element.focus()
    } else if (index < 0 || (event.shiftKey ? index === 0 : index === targets.length - 1)) {
      event.preventDefault()
      targets[event.shiftKey ? targets.length - 1 : 0].focus()
    }
  }
}

function handleFocus(event: FocusEvent) {
  const layer = topLayer()
  if (layer && event.target instanceof Node && !layer.element.contains(event.target)) focusLayer(layer)
}

function syncLayers() {
  layers.forEach((layer, index) => {
    const isTop = index === layers.length - 1
    layer.backdrop.toggleAttribute("inert", !isTop)
    layer.backdrop.style.zIndex = `${100 + index * 2}`
    layer.element.setAttribute("aria-modal", String(isTop))
  })
}

/** Register only open dialogs. One stack owns scrolling, focus and Escape for all portals. */
export function registerModal(element: HTMLElement, backdrop: HTMLElement, close: () => void): () => void {
  const layer: ModalLayer = {
    element,
    backdrop,
    close,
    previousFocus: document.activeElement instanceof HTMLElement ? document.activeElement : null,
  }
  if (layers.length === 0) {
    previousOverflow = document.body.style.overflow
    previousPadding = document.body.style.paddingRight
    previousScrollRestoration = window.history.scrollRestoration
    window.history.scrollRestoration = "manual"
    const width = document.documentElement.clientWidth
    const scrollbarWidth = width > 0 ? window.innerWidth - width : 0
    if (scrollbarWidth > 0) {
      document.body.style.paddingRight = `${parseFloat(window.getComputedStyle(document.body).paddingRight || "0") + scrollbarWidth}px`
    }
    document.body.style.overflow = "hidden"
    background = document.getElementById("root")
    backgroundWasInert = background?.hasAttribute("inert") || false
    background?.setAttribute("inert", "")
    document.addEventListener("keydown", handleKeyDown)
    document.addEventListener("focusin", handleFocus)
  }
  layers.push(layer)
  syncLayers()
  if (!element.contains(document.activeElement)) focusLayer(layer)

  return () => {
    const index = layers.indexOf(layer)
    if (index < 0) return
    const wasTop = index === layers.length - 1
    layers.splice(index, 1)
    backdrop.removeAttribute("inert")
    syncLayers()
    if (layers.length === 0) {
      document.body.style.overflow = previousOverflow
      document.body.style.paddingRight = previousPadding
      if (previousScrollRestoration !== undefined) window.history.scrollRestoration = previousScrollRestoration
      if (!backgroundWasInert) background?.removeAttribute("inert")
      background = null
      document.removeEventListener("keydown", handleKeyDown)
      document.removeEventListener("focusin", handleFocus)
    }
    if (wasTop) {
      const next = topLayer()
      const target = layer.previousFocus
      if (target?.isConnected && !target.closest("[inert]") && (!next || next.element.contains(target))) target.focus({ preventScroll: true })
      else if (next) focusLayer(next)
    }
  }
}
