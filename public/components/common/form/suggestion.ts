import { ReactRenderer } from "@tiptap/react"
import { actions } from "@fider/services"

import MentionList, { MentionListHandle } from "./MentionList"
import { MentionNodeAttrs } from "@tiptap/extension-mention"
interface MentionListProps {
  items: any[]
  command?: (item: MentionNodeAttrs) => void
}

// Cache for storing users
let cachedUsers: MentionNodeAttrs[] = []

export default {
  items: async ({ query }: { query: string }) => {
    // If we don't have cached users yet, fetch them
    if (cachedUsers.length === 0) {
      const result = await actions.getTaggableUsers("")
      if (result.ok) {
        cachedUsers = result.data.map((user, idx) => ({ id: idx.toString(), label: user.name }))
      }
    }

    // Filter the cached users based on the query
    return cachedUsers.filter((item) => item.label?.toLowerCase().startsWith(query.toLowerCase())).slice(0, 100)
  },
  render: () => {
    let reactRenderer: ReactRenderer<MentionListHandle, MentionListProps> | undefined
    let container: HTMLElement | undefined
    let getRect: (() => DOMRect | null) | null | undefined
    const position = () => {
      const rect = getRect?.()
      if (!container || !rect) return
      const height = container.offsetHeight
      container.style.left = `${Math.max(8, Math.min(rect.left, window.innerWidth - container.offsetWidth - 8))}px`
      container.style.top = `${rect.bottom + height + 8 > window.innerHeight && rect.top > height ? rect.top - height - 6 : rect.bottom + 6}px`
    }
    const dismiss = (event: Event) => {
      if (container && !container.contains(event.target as Node)) cleanup()
    }
    const cleanup = () => {
      window.removeEventListener("scroll", position, true)
      window.removeEventListener("resize", position)
      document.removeEventListener("mousedown", dismiss)
      container?.remove()
      container = undefined
    }
    return {
      onStart: (props: { editor: any; clientRect?: (() => DOMRect | null) | null }) => {
        reactRenderer = new ReactRenderer(MentionList, { props, editor: props.editor })
        if (!props.clientRect) return
        getRect = props.clientRect
        container = document.createElement("div")
        container.style.position = "fixed"
        container.style.zIndex = "1000"
        // Keep suggestions in their owning dialog, so modal inert/focus handling permits them.
        const owner = props.editor.view.dom.closest('[role="dialog"]') || document.body
        owner.appendChild(container)
        container.appendChild(reactRenderer.element)
        position()
        window.addEventListener("scroll", position, true)
        window.addEventListener("resize", position)
        document.addEventListener("mousedown", dismiss)
      },
      onUpdate(props: { clientRect?: (() => DOMRect | null) | null }) {
        getRect = props.clientRect
        reactRenderer?.updateProps(props)
        position()
      },
      onKeyDown(props: { event: KeyboardEvent }) {
        if (props.event.isComposing || !container) return false
        if (props.event.key === "Escape") {
          props.event.preventDefault()
          props.event.stopPropagation()
          cleanup()
          return true
        }
        return reactRenderer?.ref?.onKeyDown(props) || false
      },
      onExit() {
        cleanup()
        reactRenderer?.destroy()
      },
    }
  },
}
