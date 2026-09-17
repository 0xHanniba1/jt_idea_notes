import { http, Result } from "@fider/services/http"
import { UserSettings, UserAvatarType, ImageUpload } from "@fider/models"

interface UpdateUserSettings {
  name: string
  avatar?: ImageUpload
  avatarType: UserAvatarType
  settings: UserSettings
}

export const updateUserSettings = async (request: UpdateUserSettings): Promise<Result> => {
  return await http.post("/_api/user/settings", request)
}

export const regenerateAPIKey = async (): Promise<Result<{ apiKey: string }>> => {
  return await http.post<{ apiKey: string }>("/_api/user/regenerate-apikey")
}

export const updateProfileName = (name: string): Promise<Result<{ name: string }>> => http.post("/_api/user/profile", { name })
export const updateNotificationSettings = (settings: UserSettings): Promise<Result> => http.post("/_api/user/notifications", { settings })
export const updateProfileAvatar = (
  avatar: ImageUpload,
  avatarType: UserAvatarType
): Promise<Result<{ avatarURL: string; avatarType: UserAvatarType; avatarBlobKey: string }>> => http.post("/_api/user/avatar", { avatar, avatarType })
