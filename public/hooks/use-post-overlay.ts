import { MouseEvent, useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from "react"

interface UsePostOverlayOptions {
  basePath: string
  onPostClosed?: (postNumber: number) => void | Promise<unknown>
}

interface OverlayHistory {
  owner: string
  kind: "source" | "post"
  postNumber?: number
  sourceURL: string
}

interface SourceContext {
  url: string
  state: any
  scrollX: number
  scrollY: number
  trigger: HTMLElement | null
  neighbor: HTMLElement | null
  anchorTop: number | null
  scrollContainers: { element: HTMLElement; top: number; left: number }[]
}

const useClientLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect
const currentURL = () => `${window.location.pathname}${window.location.search}${window.location.hash}`

/** Intercept only ordinary same-tab activation; copying/opening the real URL remains native. */
export function shouldOpenPostOverlay(event: Pick<MouseEvent, "button" | "metaKey" | "ctrlKey" | "shiftKey" | "altKey" | "defaultPrevented">) {
  return !event.defaultPrevented && event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey
}

export function usePostOverlay({ basePath, onPostClosed }: UsePostOverlayOptions) {
  const owner = useId()
  const [selectedPostId, setSelectedPostId] = useState<number | null>(null)
  const selectedRef = useRef<number | null>(null)
  const sourceRef = useRef<SourceContext | null>(null)
  const dirtyRef = useRef(false)
  const guardRef = useRef<(() => boolean) | null>(null)
  const skipCloseGuardRef = useRef(false)
  const revertingRef = useRef(false)
  const closingRef = useRef<{ number: number; dirty: boolean } | null>(null)
  const frameRef = useRef<number>()
  const onPostClosedRef = useRef(onPostClosed)
  onPostClosedRef.current = onPostClosed

  const setIsPostDirty = useCallback((dirty: boolean) => {
    dirtyRef.current = dirty
  }, [])
  const setCloseGuard = useCallback((guard: (() => boolean) | null) => {
    guardRef.current = guard
  }, [])

  const select = useCallback((postNumber: number | null) => {
    if (selectedRef.current !== null && postNumber === null) {
      closingRef.current = { number: selectedRef.current, dirty: dirtyRef.current }
      dirtyRef.current = false
      guardRef.current = null
    }
    selectedRef.current = postNumber
    setSelectedPostId(postNumber)
  }, [])

  const handlePostClick = useCallback(
    (postNumber: number, slug: string, event?: MouseEvent<HTMLAnchorElement>) => {
      if (event && !shouldOpenPostOverlay(event)) return false
      event?.preventDefault()
      if (selectedRef.current !== null && guardRef.current && !guardRef.current()) return false
      if (frameRef.current !== undefined) cancelAnimationFrame(frameRef.current)

      if (selectedRef.current === null) {
        const trigger = event?.currentTarget || (document.activeElement instanceof HTMLElement ? document.activeElement : null)
        const links = Array.from(document.querySelectorAll<HTMLElement>("[data-post-number]"))
        const triggerIndex = trigger ? links.indexOf(trigger) : -1
        const containers: SourceContext["scrollContainers"] = []
        for (let parent = trigger?.parentElement; parent; parent = parent.parentElement) {
          if (parent.scrollTop || parent.scrollLeft) containers.push({ element: parent, top: parent.scrollTop, left: parent.scrollLeft })
        }
        sourceRef.current = {
          url: currentURL(),
          state: window.history.state,
          scrollX: window.scrollX,
          scrollY: window.scrollY,
          trigger,
          neighbor: triggerIndex >= 0 ? links[triggerIndex + 1] || links[triggerIndex - 1] || null : null,
          anchorTop: trigger && trigger !== document.body ? trigger.getBoundingClientRect().top : null,
          scrollContainers: containers,
        }
        const marker: OverlayHistory = { owner, kind: "source", sourceURL: sourceRef.current.url }
        window.history.replaceState({ ...window.history.state, jtPostOverlay: marker }, "", sourceRef.current.url)
      }
      const marker: OverlayHistory = { owner, kind: "post", postNumber, sourceURL: sourceRef.current?.url || basePath }
      const state = { ...window.history.state, jtPostOverlay: marker }
      const url = `/posts/${postNumber}/${slug}`
      if (selectedRef.current === null) window.history.pushState(state, "", url)
      else window.history.replaceState(state, "", url)
      dirtyRef.current = false
      select(postNumber)
      return true
    },
    [basePath, owner, select]
  )

  const handleCloseOverlay = useCallback(() => {
    if (selectedRef.current === null || revertingRef.current || skipCloseGuardRef.current) return
    if (guardRef.current && !guardRef.current()) return
    const marker = window.history.state?.jtPostOverlay as OverlayHistory | undefined
    if (marker?.owner === owner && marker.kind === "post") {
      skipCloseGuardRef.current = true
      window.history.back()
    } else {
      // A caller may have replaced history.state. Return only to our known source.
      const source = sourceRef.current
      window.history.replaceState({ ...source?.state }, "", source?.url || basePath)
      select(null)
    }
  }, [basePath, owner, select])

  useEffect(() => {
    const previousRestoration = window.history.scrollRestoration
    window.history.scrollRestoration = "manual"
    const handlePopState = (event: PopStateEvent) => {
      const marker = event.state?.jtPostOverlay as OverlayHistory | undefined
      // New-record dialogs own modalOpen; an overlay must not consume their history.
      if (event.state?.modalOpen) return
      if (revertingRef.current) {
        revertingRef.current = false
        return
      }
      if (selectedRef.current !== null) {
        const samePost = marker?.owner === owner && marker.kind === "post" && marker.postNumber === selectedRef.current
        if (samePost) return
        if (!skipCloseGuardRef.current && guardRef.current && !guardRef.current()) {
          revertingRef.current = true
          window.history.forward()
          return
        }
        skipCloseGuardRef.current = false
      }
      if (marker?.owner === owner && marker.kind === "post" && marker.postNumber && sourceRef.current) {
        dirtyRef.current = false
        select(marker.postNumber)
      } else if (selectedRef.current !== null) {
        select(null)
      }
    }
    window.addEventListener("popstate", handlePopState)
    return () => {
      window.removeEventListener("popstate", handlePopState)
      if (previousRestoration !== undefined) window.history.scrollRestoration = previousRestoration
      if (frameRef.current !== undefined) cancelAnimationFrame(frameRef.current)
    }
  }, [owner, select])

  useClientLayoutEffect(() => {
    const closed = closingRef.current
    if (selectedPostId !== null || !closed) return
    closingRef.current = null
    let cancelled = false
    const restore = () => {
      if (cancelled || selectedRef.current !== null) return
      // Wait for the browser's next layout, not an arbitrary delay or a full reload.
      frameRef.current = requestAnimationFrame(() => {
        if (cancelled || selectedRef.current !== null) return
        const source = sourceRef.current
        if (!source) return
        source.scrollContainers.forEach(({ element, top, left }) => {
          if (element.isConnected) {
            element.scrollTop = top
            element.scrollLeft = left
          }
        })
        const trigger = source.trigger?.isConnected ? source.trigger : null
        const target = trigger || (source.neighbor?.isConnected ? source.neighbor : document.querySelector<HTMLElement>("[data-post-list-focus]"))
        const scrollY = trigger && source.anchorTop !== null ? window.scrollY + trigger.getBoundingClientRect().top - source.anchorTop : source.scrollY
        window.scrollTo(source.scrollX, scrollY)
        target?.focus({ preventScroll: true })
      })
    }
    if (closed.dirty && onPostClosedRef.current) Promise.resolve(onPostClosedRef.current(closed.number)).then(restore, restore)
    else restore()
    return () => {
      cancelled = true
    }
  }, [selectedPostId])

  return { selectedPostId, handlePostClick, handleCloseOverlay, setIsPostDirty, setCloseGuard }
}
