import React, { useState } from "react"
import { Modal, SignInControl, LegalFooter, TenantLogo } from "@fider/components"
import { CloseIcon } from "./common"
import { Trans } from "@lingui/react/macro"
import { HStack, VStack } from "./layout"

interface SignInModalProps {
  isOpen: boolean
  onClose: () => void
}

export const SignInModal: React.FC<SignInModalProps> = (props) => {
  const [submitting, setSubmitting] = useState(false)
  const onSignedIn = (): void => {
    // User is authenticated - close modal and reload to refresh the page
    props.onClose()
    location.reload()
  }

  return (
    <Modal.Window isOpen={props.isOpen} onClose={props.onClose} canClose={!submitting}>
      <Modal.Header>
        <VStack spacing={8}>
          <HStack justify="between">
            <TenantLogo size={24} useFiderIfEmpty={true} />
            {!submitting && <CloseIcon closeModal={props.onClose} />}
          </HStack>
          <p>
            <Trans id="action.signin">Sign in</Trans>
          </p>
        </VStack>
      </Modal.Header>
      <Modal.Content>
        <SignInControl onSignedIn={onSignedIn} onSubmittingChange={setSubmitting} />
      </Modal.Content>
      <LegalFooter />
    </Modal.Window>
  )
}
