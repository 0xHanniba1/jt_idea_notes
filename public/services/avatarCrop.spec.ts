import { i18n } from "@lingui/core"
import { avatarCropRect, clampAvatarCrop, validateAvatarFile, validateAvatarOutput, loadAvatarImage } from "./avatarCrop"

beforeAll(() => {
  i18n.load("en", {})
  i18n.activate("en")
})

test("accepts supported still-image types up to the inclusive 5 MB limit", () => {
  for (const type of ["image/jpeg", "image/png", "image/webp"]) {
    expect(validateAvatarFile({ type, size: 5 * 1024 * 1024 })).toBeNull()
  }
  expect(validateAvatarFile({ type: "image/png", size: 5 * 1024 * 1024 + 1 })).toMatch(/5 MB/)
  expect(validateAvatarFile({ type: "image/png", size: 0 })).toMatch(/empty/)
  expect(validateAvatarFile({ type: "image/gif", size: 100 })).toMatch(/JPG/)
  expect(validateAvatarFile({ type: "image/svg+xml", size: 100 })).toMatch(/JPG/)
})

test("crop stays inside landscape and portrait images at every supported zoom", () => {
  for (const [width, height] of [
    [800, 400],
    [400, 800],
  ]) {
    for (const zoom of [1, 1.5, 3]) {
      for (const [x, y] of [
        [-100, -100],
        [10000, 10000],
        [200, 400],
      ]) {
        const rect = avatarCropRect(width, height, { x, y, zoom })
        expect(rect.size).toBe(Math.min(width, height) / zoom)
        expect(rect.x).toBeGreaterThanOrEqual(0)
        expect(rect.y).toBeGreaterThanOrEqual(0)
        // Fractional crops can introduce sub-pixel floating point rounding.
        expect(Math.max(0, rect.x + rect.size - width)).toBeLessThan(1e-10)
        expect(Math.max(0, rect.y + rect.size - height)).toBeLessThan(1e-10)
      }
    }
  }
})

test("centers invalid crop inputs and clamps excessive zoom", () => {
  expect(clampAvatarCrop(800, 400, { x: NaN, y: Infinity, zoom: NaN })).toEqual({ x: 400, y: 200, zoom: 1 })
  expect(clampAvatarCrop(800, 400, { x: 400, y: 200, zoom: 4 }).zoom).toBe(3)
  expect(clampAvatarCrop(800, 400, { x: 400, y: 200, zoom: 0 }).zoom).toBe(1)
  expect(avatarCropRect(800, 400, { x: 400, y: 200, zoom: 1 })).toEqual({ x: 200, y: 0, size: 400 })
})

test("enforces backend 512 KB output limit including base64 padding", () => {
  const make = (length: number) => `data:image/png;base64,${Buffer.alloc(length).toString("base64")}`
  expect(() => validateAvatarOutput(make(512 * 1024))).not.toThrow()
  expect(() => validateAvatarOutput(make(512 * 1024 + 1))).toThrow(/512 KB/)
  expect(() => validateAvatarOutput("data:image/jpeg;base64,YQ==")).toThrow()
})

test("rejects aborted image reads before allocating a preview", async () => {
  const controller = new AbortController()
  controller.abort()
  await expect(loadAvatarImage(new File(["image"], "test.png", { type: "image/png" }), controller.signal)).rejects.toMatchObject({ name: "AbortError" })
})

test("rejects animated PNG before browser preview allocation", async () => {
  const bytes = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 0, 97, 99, 84, 76, 0, 0, 0, 0])
  const file = { type: "image/png", size: bytes.length, arrayBuffer: async () => bytes.buffer } as File
  await expect(loadAvatarImage(file, new AbortController().signal)).rejects.toThrow(/Animated/)
})

const mockImageReader = () => {
  const image = { src: "", naturalWidth: 320, naturalHeight: 240, onload: null as (() => void) | null, onerror: null as (() => void) | null }
  const reader = {
    result: "data:image/png;base64,aW1hZ2U=" as string | null,
    readyState: 1,
    onload: null as (() => void) | null,
    onerror: null as (() => void) | null,
    onabort: null as (() => void) | null,
    readAsDataURL: jest.fn(),
    abort: jest.fn(),
  }
  const imageMock = jest.spyOn(window, "Image").mockImplementation(() => image as unknown as HTMLImageElement)
  const readerMock = jest.spyOn(window, "FileReader").mockImplementation(() => reader as unknown as FileReader)
  Object.defineProperty(window.FileReader, "LOADING", { value: 1 })
  const file = { type: "image/png", size: 5, arrayBuffer: async () => new ArrayBuffer(5) } as File
  return {
    image,
    reader,
    file,
    restore: () => {
      imageMock.mockRestore()
      readerMock.mockRestore()
    },
  }
}

test("loads a CSP-compatible data URL and releases preview references", async () => {
  const mocks = mockImageReader()
  try {
    const result = loadAvatarImage(mocks.file, new AbortController().signal)
    await Promise.resolve()
    expect(mocks.reader.readAsDataURL).toHaveBeenCalledWith(mocks.file)
    mocks.reader.readyState = 2
    mocks.reader.onload?.()
    expect(mocks.image.src).toBe("data:image/png;base64,aW1hZ2U=")
    mocks.image.onload?.()
    const asset = await result
    expect(asset.url).toBe("data:image/png;base64,aW1hZ2U=")
    asset.dispose()
    expect(mocks.image.src).toBe("")
    expect(mocks.image.onload).toBeNull()
    expect(mocks.reader.onload).toBeNull()
  } finally {
    mocks.restore()
  }
})

test("aborting an in-flight data URL read cancels the reader and clears handlers", async () => {
  const mocks = mockImageReader(),
    controller = new AbortController()
  try {
    const result = loadAvatarImage(mocks.file, controller.signal)
    await Promise.resolve()
    controller.abort()
    await expect(result).rejects.toMatchObject({ name: "AbortError" })
    expect(mocks.reader.abort).toHaveBeenCalledTimes(1)
    expect(mocks.reader.onload).toBeNull()
    expect(mocks.image.onerror).toBeNull()
    expect(mocks.image.src).toBe("")
  } finally {
    mocks.restore()
  }
})
