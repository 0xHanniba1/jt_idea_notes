import { http, Result } from "@fider/services/http"
import { UserRole } from "@fider/models"

export interface PasswordSignInResult {
  next: "signed_in" | "password_change_required"
}

export const passwordSignIn = (username: string, password: string): Promise<Result<PasswordSignInResult>> =>
  http.post("/_api/auth/password/signin", { username: username.trim().toLowerCase(), password })

export const completePasswordChange = (newPassword: string, confirmPassword: string): Promise<Result> =>
  http.post("/_api/auth/password/complete", { newPassword, confirmPassword })

export const changePassword = (currentPassword: string, newPassword: string, confirmPassword: string): Promise<Result> =>
  http.post("/_api/auth/password/change", { currentPassword, newPassword, confirmPassword })

export const signOut = (): Promise<Result> => http.post("/_api/auth/signout", {})

export const createAccount = (username: string, name: string, password: string, role: UserRole): Promise<Result> =>
  http.post("/_api/admin/accounts", { username: username.trim().toLowerCase(), name, password, role })

export const initializeAccount = (userID: number, username: string, password: string): Promise<Result> =>
  http.post(`/_api/admin/accounts/${userID}/initialize`, { username: username.trim().toLowerCase(), password })

export const resetAccountPassword = (userID: number, password: string): Promise<Result> =>
  http.post(`/_api/admin/accounts/${userID}/reset-password`, { password })
