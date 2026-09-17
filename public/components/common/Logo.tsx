import React from "react"
import { uploadedImageURL } from "@fider/services"
import { useFider } from "@fider/hooks"
import { Tenant } from "@fider/models"

type Size = 24 | 50 | 100 | 200

interface TenantLogoProps {
  size: Size
  useFiderIfEmpty?: boolean
}

export const TenantLogoURL = (tenant: Tenant, size: Size): string | undefined => {
  if (tenant && tenant.logoBlobKey) {
    return uploadedImageURL(tenant.logoBlobKey, size)
  }
  return undefined
}

export const TenantLogo = ({ size, useFiderIfEmpty = false }: TenantLogoProps) => {
  const fider = useFider()

  const tenant = fider.session.tenant
  if (tenant && tenant.logoBlobKey) {
    return <img src={TenantLogoURL(fider.session.tenant, size)} alt={tenant.name} />
  } else if (useFiderIfEmpty) {
    return <img src="https://login.fider.io/static/assets/logo.png" alt="Fider" height={size} width={size} />
  }
  return null
}
