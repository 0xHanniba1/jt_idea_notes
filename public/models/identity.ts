export interface Tenant {
  id: number
  name: string
  cname: string
  subdomain: string
  locale: string
  invitation: string
  welcomeMessage: string
  welcomeHeader: string
  descriptionTemplate: string
  status: TenantStatus
  isPrivate: boolean
  logoBlobKey: string
  allowedSchemes: string
  isFeedEnabled: boolean
  isModerationEnabled: boolean
  isPro: boolean
}

export enum TenantStatus {
  Active = 1,
  Pending = 2,
  Locked = 3,
  Disabled = 4,
}

export interface User {
  id: number
  name: string
  role: UserRole
  status: UserStatus
  isTrusted: boolean
  avatarURL: string
}

export interface UserNames {
  id: number
  name: string
}

export enum UserAvatarType {
  Letter = "letter",
  Custom = "custom",
}

export enum UserStatus {
  Active = "active",
  Deleted = "deleted",
  Blocked = "blocked",
}

export enum UserRole {
  Visitor = "visitor",
  Collaborator = "collaborator",
  Administrator = "administrator",
}

export const isCollaborator = (role: UserRole): boolean => {
  return role === UserRole.Collaborator || role === UserRole.Administrator
}

export const requiresModeration = (user: User): boolean => {
  return user.role === UserRole.Visitor && !user.isTrusted
}

export interface CurrentUser {
  id: number
  name: string
  username: string
  avatarType: UserAvatarType
  avatarBlobKey: string
  avatarURL: string
  role: UserRole
  status: UserStatus
  isAdministrator: boolean
  isCollaborator: boolean
  isTrusted: boolean
}

// Only the protected member-management endpoint exposes credential state.
export interface ManagedUser extends User {
  username: string
  passwordInitialized: boolean
  mustChangePassword: boolean
}
