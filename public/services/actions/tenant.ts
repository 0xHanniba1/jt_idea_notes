import { http, Result } from "@fider/services/http"
import { UserRole, ImageUpload } from "@fider/models"
import { PrivacySettingsPageState } from "@fider/pages/Administration/pages/PrivacySettings.page"

export interface UpdateTenantSettingsRequest {
  logo?: ImageUpload
  title: string
  invitation: string
  welcomeMessage: string
  welcomeHeader: string
  descriptionTemplate: string
  cname: string
  locale: string
}

export const updateTenantSettings = async (request: UpdateTenantSettingsRequest): Promise<Result> => {
  return await http.post("/_api/admin/settings/general", request)
}

export const updateTenantAdvancedSettings = async (customCSS: string, allowedSchemes: string): Promise<Result> => {
  return await http.post("/_api/admin/settings/advanced", { customCSS, allowedSchemes })
}

export const updateTenantPrivacy = async (request: PrivacySettingsPageState): Promise<Result> => {
  return await http.post("/_api/admin/settings/privacy", request)
}

export const changeUserRole = async (userID: number, role: UserRole): Promise<Result> => {
  return await http.post(`/_api/admin/roles/${role}/users`, {
    userID,
  })
}

export const blockUser = async (userID: number): Promise<Result> => {
  return await http.put(`/_api/admin/users/${userID}/block`)
}

export const unblockUser = async (userID: number, password: string): Promise<Result<{ id: number; temporaryPassword?: string }>> => {
  return await http.delete(`/_api/admin/users/${userID}/block`, { password })
}

export const trustUser = async (userID: number): Promise<Result> => {
  return await http.put(`/_api/admin/users/${userID}/trust`)
}

export const untrustUser = async (userID: number): Promise<Result> => {
  return await http.delete(`/_api/admin/users/${userID}/trust`)
}
