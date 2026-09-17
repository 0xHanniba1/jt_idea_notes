package cmd

import (
	"time"

	"github.com/getfider/fider/app/models/dto"
	"github.com/getfider/fider/app/models/entity"
	"github.com/getfider/fider/app/models/enum"
)

type CreateTenant struct {
	Name      string
	Subdomain string
	Status    enum.TenantStatus

	Result *entity.Tenant
}

type UpdateTenantPrivacySettings struct {
	IsPrivate     bool
	IsFeedEnabled bool
}

type UpdateTenantSettings struct {
	Logo                *dto.ImageUpload
	Title               string
	Invitation          string
	WelcomeMessage      string
	WelcomeHeader       string
	DescriptionTemplate string
	CNAME               string
	Locale              string
}

type UpdateTenantAdvancedSettings struct {
	CustomCSS      string
	AllowedSchemes string
}

type ActivateTenant struct {
	TenantID int
}

// ScheduleTenantDeletion records the account owner's request to delete the whole site.
// The tenant stays active during the grace window; a background job performs the hard
// delete once ScheduledAt passes. Retained for historical storage compatibility; no public scheduling flow exists.
type ScheduleTenantDeletion struct {
	TenantID          int
	RequestedByUserID int
	CancelKey         string
	ScheduledAt       time.Time
}

// CancelTenantDeletion clears a pending deletion schedule, leaving the tenant untouched.
type CancelTenantDeletion struct {
	TenantID int
}

// DeleteTenant permanently removes a tenant and all of its data. Irreversible.
type DeleteTenant struct {
	TenantID int
}
