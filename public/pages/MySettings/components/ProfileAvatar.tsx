import "./ProfileAvatar.scss"

import React, { useEffect, useId, useRef, useState } from "react"
import { i18n } from "@lingui/core"
import { Modal } from "@fider/components"
import { ImageUpload, UserAvatarType } from "@fider/models"
import { AVATAR_FILE_ACCEPT, clampAvatarCrop, exportAvatarCrop, loadAvatarImage, validateAvatarFile, AvatarCrop, AvatarImage } from "@fider/services/avatarCrop"

interface Props {
  name: string
  avatarURL?: string
  hasAvatar: boolean
  onSave: (avatar: ImageUpload, avatarType: UserAvatarType) => Promise<void>
}

const errorMessage = (error: unknown) =>
  error instanceof Error ? error.message : i18n._({ id: "profile.avatar.error.save", message: "Unable to save your avatar. Please try again." })

export const ProfileAvatar = ({ name, avatarURL, hasAvatar, onSave }: Props) => {
  const input = useRef<HTMLInputElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const alive = useRef(false)
  const pending = useRef(false)
  const [file, setFile] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const [notice, setNotice] = useState("")
  const [failedURL, setFailedURL] = useState<string>()
  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
    }
  }, [])
  const choose = (event: React.ChangeEvent<HTMLInputElement>) => {
    const selected = event.target.files?.[0]
    event.target.value = ""
    if (!selected || pending.current) return
    setNotice("")
    const validation = validateAvatarFile(selected)
    setError(validation || "")
    if (!validation) setFile(selected)
  }
  const save = async (dataURL: string | null) => {
    if (pending.current) return
    pending.current = true
    setBusy(true)
    setError("")
    setNotice("")
    try {
      await onSave(
        dataURL ? { remove: false, upload: { fileName: "avatar.png", contentType: "image/png", content: dataURL.split(",")[1] } } : { remove: true },
        dataURL ? UserAvatarType.Custom : UserAvatarType.Letter
      )
      if (alive.current) {
        setFile(null)
        setNotice(
          dataURL
            ? i18n._({ id: "profile.avatar.saved", message: "Avatar updated." })
            : i18n._({ id: "profile.avatar.removed", message: "Avatar removed. Your name initial is shown." })
        )
      }
    } finally {
      pending.current = false
      if (alive.current) setBusy(false)
    }
  }
  const remove = async () => {
    try {
      await save(null)
    } catch (cause) {
      if (alive.current) setError(errorMessage(cause))
    }
  }
  return (
    <div className="c-profile-avatar">
      <div className="c-profile-avatar__row">
        <span className="c-profile-avatar__preview" aria-hidden="true">
          {hasAvatar && avatarURL && failedURL !== avatarURL ? (
            <img src={avatarURL} alt="" onError={() => setFailedURL(avatarURL)} />
          ) : (
            Array.from(name.trim())[0] || "?"
          )}
        </span>
        <div>
          <div className="c-profile-avatar__label">{i18n._({ id: "label.avatar", message: "Avatar" })}</div>
          <p className="c-profile-avatar__hint">{i18n._({ id: "profile.avatar.fileHelp", message: "JPG, PNG or WebP, up to 5 MB" })}</p>
          <div className="c-profile-avatar__actions">
            <button ref={trigger} type="button" className="c-profile-avatar__button" disabled={busy} onClick={() => input.current?.click()}>
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
                <path d="M12 16V3m-5 5 5-5 5 5M4 15v5h16v-5" />
              </svg>
              {hasAvatar
                ? i18n._({ id: "profile.avatar.replace", message: "Change avatar" })
                : i18n._({ id: "profile.avatar.upload", message: "Upload avatar" })}
            </button>
            {hasAvatar && (
              <button type="button" className="c-profile-avatar__text-button" disabled={busy} onClick={remove}>
                {i18n._({ id: "profile.avatar.remove", message: "Remove avatar" })}
              </button>
            )}
          </div>
        </div>
      </div>
      <input
        ref={input}
        type="file"
        accept={AVATAR_FILE_ACCEPT}
        aria-label={i18n._({ id: "profile.avatar.choose", message: "Choose an avatar image" })}
        hidden
        onChange={choose}
      />
      {error && (
        <p role="alert" className="c-profile-avatar__error">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="c-profile-avatar__notice">
          {notice}
        </p>
      )}
      {file && (
        <AvatarCropDialog
          file={file}
          onSave={save}
          onClose={() => {
            if (!pending.current) setFile(null)
          }}
          returnFocus={() => trigger.current?.focus()}
        />
      )}
    </div>
  )
}

const AvatarCropDialog = ({
  file,
  onSave,
  onClose,
  returnFocus,
}: {
  file: File
  onSave: (data: string) => Promise<void>
  onClose: () => void
  returnFocus: () => void
}) => {
  const [asset, setAsset] = useState<AvatarImage | null>(null)
  const [crop, setCrop] = useState<AvatarCrop>({ x: 0, y: 0, zoom: 1 })
  const [error, setError] = useState("")
  const [saving, setSaving] = useState(false)
  const pending = useRef(false)
  const lifetime = useRef<AbortController | null>(null)
  const focus = useRef(returnFocus)
  focus.current = returnFocus
  const drag = useRef<{ id: number; x: number; y: number; crop: AvatarCrop } | null>(null)
  const helpId = useId()
  const rangeId = useId()
  useEffect(() => {
    const controller = new AbortController()
    lifetime.current = controller
    let loaded: AvatarImage | null = null
    loadAvatarImage(file, controller.signal)
      .then((image) => {
        if (controller.signal.aborted) {
          image.dispose()
          return
        }
        loaded = image
        setAsset(image)
        setCrop({ x: image.image.naturalWidth / 2, y: image.image.naturalHeight / 2, zoom: 1 })
      })
      .catch((cause) => {
        if (!controller.signal.aborted) setError(errorMessage(cause))
      })
    return () => {
      controller.abort()
      loaded?.dispose()
      focus.current()
    }
  }, [file])
  const update = (next: AvatarCrop) => {
    if (asset && !pending.current) setCrop(clampAvatarCrop(asset.image.naturalWidth, asset.image.naturalHeight, next))
  }
  const start = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!asset || pending.current || event.button !== 0 || !event.isPrimary) return
    event.currentTarget.focus()
    event.currentTarget.setPointerCapture(event.pointerId)
    drag.current = { id: event.pointerId, x: event.clientX, y: event.clientY, crop }
  }
  const move = (event: React.PointerEvent<HTMLDivElement>) => {
    const origin = drag.current,
      width = event.currentTarget.getBoundingClientRect().width
    if (!asset || !origin || origin.id !== event.pointerId || !width || pending.current) return
    const ratio = Math.min(asset.image.naturalWidth, asset.image.naturalHeight) / origin.crop.zoom / width
    update({ ...origin.crop, x: origin.crop.x - (event.clientX - origin.x) * ratio, y: origin.crop.y - (event.clientY - origin.y) * ratio })
  }
  const stop = (event: React.PointerEvent<HTMLDivElement>) => {
    if (drag.current?.id !== event.pointerId) return
    drag.current = null
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
  }
  const moveByKey = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (!asset || pending.current) return
    const direction = ({ ArrowLeft: [1, 0], ArrowRight: [-1, 0], ArrowUp: [0, 1], ArrowDown: [0, -1] } as Record<string, [number, number]>)[event.key]
    if (!direction) return
    event.preventDefault()
    const step = (Math.min(asset.image.naturalWidth, asset.image.naturalHeight) / crop.zoom) * (event.shiftKey ? 0.05 : 0.01)
    update({ ...crop, x: crop.x + direction[0] * step, y: crop.y + direction[1] * step })
  }
  const save = async () => {
    if (!asset || pending.current) return
    const signal = lifetime.current?.signal
    if (!signal || signal.aborted) return
    pending.current = true
    setSaving(true)
    setError("")
    try {
      await onSave(exportAvatarCrop(asset.image, crop))
    } catch (cause) {
      if (!signal.aborted) setError(errorMessage(cause))
    } finally {
      pending.current = false
      if (!signal.aborted) setSaving(false)
    }
  }
  const size = asset ? Math.min(asset.image.naturalWidth, asset.image.naturalHeight) / crop.zoom : 1
  return (
    <Modal.Window isOpen onClose={onClose} canClose={!saving} className="c-avatar-crop">
      <Modal.Header>{i18n._({ id: "profile.avatar.adjust", message: "Adjust avatar" })}</Modal.Header>
      <button type="button" className="c-modal-closeicon" aria-label={i18n._({ id: "action.close", message: "Close" })} disabled={saving} onClick={onClose}>
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
          <path d="m6 6 12 12M6 18 18 6" />
        </svg>
      </button>
      <Modal.Content>
        <p id={helpId} className="c-avatar-crop__hint">
          {i18n._({ id: "profile.avatar.cropHelp", message: "Drag to position your image and zoom to fit. You can also use the arrow keys." })}
        </p>
        <div
          className="c-avatar-crop__stage"
          role="group"
          aria-label={i18n._({ id: "profile.avatar.cropArea", message: "Avatar crop area" })}
          aria-describedby={helpId}
          tabIndex={asset && !saving ? 0 : -1}
          onPointerDown={start}
          onPointerMove={move}
          onPointerUp={stop}
          onPointerCancel={stop}
          onLostPointerCapture={() => {
            drag.current = null
          }}
          onKeyDown={moveByKey}
        >
          {asset ? (
            <>
              <img
                src={asset.url}
                alt={i18n._({ id: "profile.avatar.preview", message: "Image to crop" })}
                draggable={false}
                style={{
                  width: `${(asset.image.naturalWidth / size) * 100}%`,
                  height: `${(asset.image.naturalHeight / size) * 100}%`,
                  left: `${(0.5 - crop.x / size) * 100}%`,
                  top: `${(0.5 - crop.y / size) * 100}%`,
                }}
              />
              <span className="c-avatar-crop__mask" aria-hidden="true" />
            </>
          ) : (
            <span role="status">
              {error
                ? i18n._({ id: "profile.avatar.unavailable", message: "Preview unavailable" })
                : i18n._({ id: "profile.avatar.loading", message: "Loading image…" })}
            </span>
          )}
        </div>
        <div className="c-avatar-crop__zoom">
          <label htmlFor={rangeId}>{i18n._({ id: "profile.avatar.zoom", message: "Zoom" })}</label>
          <span>{Math.round(crop.zoom * 100)}%</span>
          <input
            id={rangeId}
            type="range"
            min="1"
            max="3"
            step="0.01"
            value={crop.zoom}
            disabled={!asset || saving}
            onChange={(event) => update({ ...crop, zoom: Number(event.target.value) })}
          />
        </div>
        <button
          type="button"
          className="c-profile-avatar__text-button c-avatar-crop__reset"
          disabled={!asset || saving}
          onClick={() => asset && update({ x: asset.image.naturalWidth / 2, y: asset.image.naturalHeight / 2, zoom: 1 })}
        >
          {i18n._({ id: "profile.avatar.center", message: "Recenter" })}
        </button>
        {error && (
          <p role="alert" className="c-profile-avatar__error">
            {error}
          </p>
        )}
      </Modal.Content>
      <Modal.Footer>
        <button type="button" className="c-profile-avatar__button" disabled={saving} onClick={onClose}>
          {i18n._({ id: "action.cancel", message: "Cancel" })}
        </button>
        <button type="button" className="c-profile-avatar__button c-profile-avatar__button--primary" disabled={!asset || saving} onClick={save}>
          {saving ? i18n._({ id: "profile.avatar.saving", message: "Saving…" }) : i18n._({ id: "profile.avatar.save", message: "Save avatar" })}
        </button>
      </Modal.Footer>
    </Modal.Window>
  )
}
