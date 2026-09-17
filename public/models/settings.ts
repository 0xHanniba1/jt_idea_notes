export interface SystemSettings {
  mode: string
  locale: string
  version: string
  environment: string
  domain: string
  hasLegal: boolean
  isBillingEnabled: boolean
  baseURL: string
  assetsURL: string
  postWithTags: boolean
  allowAllowedSchemes: boolean
}

export interface UserSettings {
  [key: string]: string
}

export interface ImageUpload {
  bkey?: string
  upload?: {
    fileName?: string
    content?: string
    contentType?: string
  }
  remove: boolean
}
