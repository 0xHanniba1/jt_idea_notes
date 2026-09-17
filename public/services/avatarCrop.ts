import { i18n } from "@lingui/core"

export const AVATAR_FILE_ACCEPT = "image/jpeg,image/png,image/webp"
export const AVATAR_MAX_FILE_BYTES = 5 * 1024 * 1024
export const AVATAR_OUTPUT_SIZE = 256
export type AvatarCrop = { x: number; y: number; zoom: number }
export type AvatarImage = { image: HTMLImageElement; url: string; dispose: () => void }

export function validateAvatarFile(file: Pick<File, "type" | "size">): string | null {
  if (!AVATAR_FILE_ACCEPT.split(",").includes(file.type))
    return i18n._({ id: "profile.avatar.error.format", message: "Please choose a JPG, PNG or WebP image." })
  if (file.size === 0) return i18n._({ id: "profile.avatar.error.empty", message: "The image is empty. Please choose another image." })
  if (file.size > AVATAR_MAX_FILE_BYTES) return i18n._({ id: "profile.avatar.error.fileSize", message: "Images must be no larger than 5 MB." })
  return null
}

export function clampAvatarCrop(width: number, height: number, crop: AvatarCrop): AvatarCrop {
  const zoom = Math.max(1, Math.min(3, Number.isFinite(crop.zoom) ? crop.zoom : 1))
  const half = Math.min(width, height) / zoom / 2
  return {
    zoom,
    x: Math.max(half, Math.min(width - half, Number.isFinite(crop.x) ? crop.x : width / 2)),
    y: Math.max(half, Math.min(height - half, Number.isFinite(crop.y) ? crop.y : height / 2)),
  }
}

export function avatarCropRect(width: number, height: number, crop: AvatarCrop) {
  const normalized = clampAvatarCrop(width, height, crop),
    size = Math.min(width, height) / normalized.zoom
  return { x: normalized.x - size / 2, y: normalized.y - size / 2, size }
}

function animatedImage(buffer: ArrayBuffer): boolean {
  const bytes = new Uint8Array(buffer),
    view = new DataView(buffer)
  const text = (offset: number, length: number) => String.fromCharCode(...bytes.subarray(offset, offset + length))
  if (bytes.length >= 8 && bytes[0] === 137 && text(1, 3) === "PNG") {
    for (let offset = 8; offset + 12 <= bytes.length; ) {
      const length = view.getUint32(offset),
        type = text(offset + 4, 4)
      if (type === "acTL") return true
      if (offset + 12 + length > bytes.length) break
      offset += 12 + length
    }
  }
  if (bytes.length >= 12 && text(0, 4) === "RIFF" && text(8, 4) === "WEBP") {
    for (let offset = 12; offset + 8 <= bytes.length; ) {
      const length = view.getUint32(offset + 4, true),
        type = text(offset, 4)
      if (type === "ANIM" || type === "ANMF") return true
      if (type === "VP8X" && length > 0 && offset + 8 < bytes.length && (bytes[offset + 8] & 2) !== 0) return true
      if (offset + 8 + length > bytes.length) break
      offset += 8 + length + (length % 2)
    }
  }
  return false
}

export async function loadAvatarImage(file: File, signal: AbortSignal): Promise<AvatarImage> {
  const error = validateAvatarFile(file)
  if (error) throw new Error(error)
  if (signal.aborted) throw new DOMException("Aborted", "AbortError")
  const bytes = await file.arrayBuffer()
  if (signal.aborted) throw new DOMException("Aborted", "AbortError")
  if (animatedImage(bytes))
    throw new Error(i18n._({ id: "profile.avatar.error.animation", message: "Please use a still image. Animated avatars are not supported." }))
  return new Promise((resolve, reject) => {
    const image = new Image()
    const reader = new FileReader()
    let url = ""
    let disposed = false
    const dispose = () => {
      if (disposed) return
      disposed = true
      image.onload = null
      image.onerror = null
      image.src = ""
      reader.onload = null
      reader.onerror = null
      reader.onabort = null
      if (reader.readyState === FileReader.LOADING) reader.abort()
      signal.removeEventListener("abort", abort)
    }
    const abort = () => {
      dispose()
      reject(new DOMException("Aborted", "AbortError"))
    }
    signal.addEventListener("abort", abort, { once: true })
    image.onerror = () => {
      dispose()
      reject(new Error(i18n._({ id: "profile.avatar.error.decode", message: "Unable to read this image. Please choose a valid JPG, PNG or WebP image." })))
    }
    image.onload = () => {
      const width = image.naturalWidth,
        height = image.naturalHeight
      if (width < 1 || height < 1 || width > 16384 || height > 16384 || width * height > 40_000_000) {
        dispose()
        reject(new Error(i18n._({ id: "profile.avatar.error.dimensions", message: "Use an image with at most 40 million pixels and 16384 pixels per side." })))
        return
      }
      image.onload = null
      image.onerror = null
      signal.removeEventListener("abort", abort)
      resolve({ image, url, dispose })
    }
    const readFailure = () => {
      dispose()
      reject(new Error(i18n._({ id: "profile.avatar.error.decode", message: "Unable to read this image. Please choose a valid JPG, PNG or WebP image." })))
    }
    reader.onerror = readFailure
    reader.onload = () => {
      if (disposed) return
      if (typeof reader.result !== "string") {
        readFailure()
        return
      }
      // Data URLs match the existing CSP and image uploader; blob URLs are blocked.
      url = reader.result
      reader.onload = null
      reader.onerror = null
      image.src = url
    }
    reader.readAsDataURL(file)
  })
}

export function exportAvatarCrop(image: HTMLImageElement, crop: AvatarCrop): string {
  const canvas = document.createElement("canvas")
  canvas.width = AVATAR_OUTPUT_SIZE
  canvas.height = AVATAR_OUTPUT_SIZE
  try {
    const context = canvas.getContext("2d")
    if (!context) throw new Error(i18n._({ id: "profile.avatar.error.canvas", message: "Your browser cannot process this image. Please try Chrome." }))
    const rect = avatarCropRect(image.naturalWidth, image.naturalHeight, crop)
    context.imageSmoothingEnabled = true
    context.imageSmoothingQuality = "high"
    context.drawImage(image, rect.x, rect.y, rect.size, rect.size, 0, 0, AVATAR_OUTPUT_SIZE, AVATAR_OUTPUT_SIZE)
    const result = canvas.toDataURL("image/png")
    validateAvatarOutput(result)
    return result
  } finally {
    canvas.width = 0
    canvas.height = 0
  }
}

export function validateAvatarOutput(dataURL: string): void {
  const content = dataURL.replace(/^data:image\/png;base64,/, "")
  const bytes = (content.length * 3) / 4 - (content.endsWith("==") ? 2 : content.endsWith("=") ? 1 : 0)
  if (!dataURL.startsWith("data:image/png;base64,") || bytes > 512 * 1024) {
    throw new Error(i18n._({ id: "profile.avatar.error.outputSize", message: "The cropped image exceeds 512 KB. Please choose another image." }))
  }
}
