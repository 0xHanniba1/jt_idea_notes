import { i18n } from "@lingui/core"
import { Trans } from "@lingui/react/macro"
import React, { useState } from "react"
import { Button, Icon } from "@fider/components"
import { HStack, VStack } from "@fider/components/layout"
import { AdminPageContainer } from "../components/AdminBasePage"
import { http } from "@fider/services"
import IconCheck from "@fider/assets/images/heroicons-check.svg"
import IconX from "@fider/assets/images/heroicons-x.svg"
import IconInfo from "@fider/assets/images/heroicons-information-circle.svg"

import "./ManageBilling.page.scss"

interface ManageBillingPageProps {
  stripeCustomerID: string
  stripeSubscriptionID: string
  paddleSubscriptionID: string
  isPro: boolean
}

interface PlanFeature {
  text: string
  isNegative?: boolean
  onClick?: () => void
}

interface PlanCardProps {
  name: string
  price?: string
  period?: string
  description: string
  features: (string | PlanFeature)[]
  isCurrent: boolean
  isHighlighted?: boolean
  buttonText: string
  buttonVariant: "primary" | "secondary"
  onButtonClick?: () => void
  isLoading: boolean
}

const PlanCard = (props: PlanCardProps) => {
  const showButton = !!props.onButtonClick
  const showCurrentLabel = props.isCurrent && !props.onButtonClick

  const cardClasses = ["c-plan-card p-6", props.isHighlighted ? "c-plan-card--highlighted" : "bg-gray-100", props.isCurrent ? "c-plan-card--current" : ""].join(
    " "
  )

  const textColor = props.isHighlighted ? "text-white" : "text-gray-900"

  return (
    <div className={cardClasses}>
      <VStack spacing={4}>
        <HStack justify="between" align="center">
          <span className={`text-title ${textColor}`}>{props.name}</span>
          {props.isCurrent && (
            <span className="text-xs text-semibold px-2 py-1 rounded-full bg-green-100 text-green-700">
              <Trans id="admin.billing.currentbadge">Current</Trans>
            </span>
          )}
        </HStack>

        <div className="flex flex-items-baseline">
          {props.price ? (
            <>
              <span className={`text-2xl text-bold ${textColor}`}>{props.price}</span>
              {props.period && <span className={`text-sm c-plan-card__muted ${props.isHighlighted ? "" : "text-gray-500"}`}>/{props.period}</span>}
            </>
          ) : (
            <span className="text-2xl">&nbsp;</span>
          )}
        </div>

        <p className={`text-sm c-plan-card__muted ${props.isHighlighted ? "" : "text-gray-600"}`}>{props.description}</p>

        {showButton && (
          <Button variant={props.buttonVariant} onClick={props.onButtonClick} disabled={props.isLoading}>
            {props.isLoading ? i18n._({ id: "admin.billing.loading", message: "Loading..." }) : props.buttonText}
          </Button>
        )}
        {showCurrentLabel && (
          <div className="text-center py-2 px-4 text-sm text-medium text-gray-500 bg-gray-200 rounded-md">
            <Trans id="admin.billing.currentplan">Current plan</Trans>
          </div>
        )}
        {!showButton && !showCurrentLabel && <div className="py-2 px-4 text-sm">&nbsp;</div>}

        <VStack spacing={2} className={`pt-4 border-t c-plan-card__light ${props.isHighlighted ? "border-gray-700" : "border-gray-200 text-gray-700"}`}>
          {props.features.map((feature, index) => {
            const featureText = typeof feature === "string" ? feature : feature.text
            const isNegative = typeof feature === "object" && feature.isNegative
            const onClick = typeof feature === "object" ? feature.onClick : undefined
            return (
              <HStack key={index} spacing={2} align="center">
                <Icon sprite={isNegative ? IconX : IconCheck} className={isNegative ? "text-red-500" : "text-green-500"} height="16" />
                {onClick ? (
                  <a className="text-sm clickable text-blue-200 clickable" onClick={onClick}>
                    {featureText}
                  </a>
                ) : (
                  <span className="text-sm">{featureText}</span>
                )}
              </HStack>
            )
          })}
        </VStack>
      </VStack>
    </div>
  )
}

const PaddleMigrationBanner = () => {
  return (
    <div className="bg-blue-50 p-4 rounded mb-6 border border-blue-200">
      <HStack spacing={2} align="start">
        <Icon sprite={IconInfo} className="text-blue-600 flex-shrink-0 mt-0.5" height="20" />
        <VStack spacing={1}>
          <p className="text-sm text-gray-900 text-medium">
            <Trans id="admin.billing.migration.title">Migration to Stripe billing</Trans>
          </p>
          <p className="text-sm text-gray-700">
            <Trans id="admin.billing.migration.help">
              Your existing subscription still gives you access to Pro features. Switch to the new Stripe billing system to manage your subscription at the new
              plan price.
            </Trans>
          </p>
        </VStack>
      </HStack>
    </div>
  )
}

const ManageBillingPage = (props: ManageBillingPageProps) => {
  const [isLoading, setIsLoading] = useState(false)

  // Detect Paddle customers who need to migrate
  const isPaddleCustomer = Boolean(props.paddleSubscriptionID && !props.stripeSubscriptionID)

  // Display as Pro only if they're truly a Stripe customer
  const displayAsPro = props.isPro && !isPaddleCustomer

  const openPortal = async () => {
    setIsLoading(true)
    const result = await http.post<{ url: string }>("/_api/admin/billing/portal")
    if (result.ok) {
      window.location.href = result.data.url
    } else {
      setIsLoading(false)
    }
  }

  const startCheckout = async () => {
    setIsLoading(true)
    const result = await http.post<{ url: string }>("/_api/admin/billing/checkout")
    if (result.ok) {
      window.location.href = result.data.url
    } else {
      setIsLoading(false)
    }
  }

  const freeFeatures = [
    i18n._({ id: "admin.billing.feature.records250", message: "250 records" }),
    i18n._({ id: "admin.billing.feature.participants", message: "Unlimited participants" }),
    i18n._({ id: "admin.billing.feature.domain", message: "Your own subdomain or custom domain" }),
    i18n._({ id: "admin.billing.feature.core", message: "All core functionality" }),
  ]

  const startAnnualCheckout = async () => {
    setIsLoading(true)
    const result = await http.post<{ url: string }>("/_api/admin/billing/checkout/annual")
    if (result.ok) {
      window.location.href = result.data.url
    } else {
      setIsLoading(false)
    }
  }

  const proFeatures: (string | PlanFeature)[] = [
    i18n._({ id: "admin.billing.feature.allfree", message: "Everything in Free" }),
    i18n._({ id: "admin.billing.feature.unlimitedrecords", message: "Unlimited records" }),
    i18n._({ id: "admin.billing.feature.moderation", message: "Content moderation" }),
    i18n._({ id: "admin.billing.feature.indexing", message: "Search engine indexing" }),
    {
      text: i18n._({ id: "admin.billing.feature.annual", message: "Option to pay annually" }),
      onClick: startAnnualCheckout,
    },
  ]

  const legacyProFeatures: PlanFeature[] = [
    { text: i18n._({ id: "admin.billing.feature.samepro", message: "Same features as Pro" }) },
    { text: i18n._({ id: "admin.billing.feature.legacycost", message: "More expensive" }), isNegative: true },
    { text: i18n._({ id: "admin.billing.feature.legacyportal", message: "Billing management not supported" }), isNegative: true },
  ]

  return (
    <AdminPageContainer
      id="p-admin-billing"
      name="billing"
      title={i18n._({ id: "admin.billing.title", message: "Billing" })}
      subtitle={i18n._({ id: "admin.billing.subtitle", message: "Manage your subscription and billing" })}
    >
      <p>
        <Trans id="admin.billing.intro">The Free plan has no time limit. Upgrade to Pro if you need advanced features and support.</Trans>
      </p>

      {isPaddleCustomer && <PaddleMigrationBanner />}

      <div className="c-billing-plans">
        <PlanCard
          name={i18n._({ id: "admin.billing.plan.free", message: "Free" })}
          price="$0"
          period={i18n._({ id: "admin.billing.period.month", message: "month" })}
          description={i18n._({ id: "admin.billing.plan.free.description", message: "For getting started with feedback collection." })}
          features={freeFeatures}
          isCurrent={!displayAsPro && !isPaddleCustomer}
          buttonText={i18n._({ id: "admin.billing.downgrade", message: "Downgrade" })}
          buttonVariant="secondary"
          onButtonClick={displayAsPro ? openPortal : undefined}
          isLoading={isLoading && displayAsPro}
        />

        {isPaddleCustomer && (
          <PlanCard
            name={i18n._({ id: "admin.billing.plan.legacy", message: "Legacy Pro" })}
            description={i18n._({ id: "admin.billing.plan.legacy.description", message: "Your current plan from our previous billing system." })}
            features={legacyProFeatures}
            isCurrent={true}
            buttonText={i18n._({ id: "admin.billing.currentplan", message: "Current plan" })}
            buttonVariant="secondary"
            isLoading={false}
          />
        )}

        <PlanCard
          name={i18n._({ id: "admin.billing.plan.pro", message: "Pro" })}
          price="$25"
          period={i18n._({ id: "admin.billing.period.month", message: "month" })}
          description={i18n._({ id: "admin.billing.plan.pro.description", message: "For teams that need advanced features and support." })}
          features={proFeatures}
          isCurrent={displayAsPro}
          isHighlighted={true}
          buttonText={
            displayAsPro
              ? i18n._({ id: "admin.billing.manage", message: "Manage billing" })
              : isPaddleCustomer
              ? i18n._({ id: "admin.billing.switch", message: "Switch to the new Pro plan" })
              : i18n._({ id: "admin.billing.upgrade", message: "Upgrade to Pro" })
          }
          buttonVariant="primary"
          onButtonClick={displayAsPro ? openPortal : startCheckout}
          isLoading={isLoading}
        />
      </div>
    </AdminPageContainer>
  )
}

export default ManageBillingPage
