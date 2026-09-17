import "./Roadmap.page.scss"

import { i18n } from "@lingui/core"
import React, { useRef } from "react"
import { Post, Tag } from "@fider/models"
import { Header, Button } from "@fider/components"
import { useFider, usePostOverlay } from "@fider/hooks"
import { PostDetails, PostDetailsOverlay } from "@fider/components/PostDetails"
import { Trans } from "@lingui/react/macro"
import { PostsContainer } from "../Home/components/PostsContainer"
import { PostPagination } from "@fider/services/actions/post"

interface RoadmapPageProps {
  posts?: Post[]
  tags?: Tag[]
  pagination?: PostPagination
  view?: "planned" | "started" | "completed"
}

const RoadmapBoard = (props: RoadmapPageProps) => {
  const postsRef = useRef<PostsContainer>(null)
  const pendingRefresh = useRef<Promise<unknown>>()
  const { selectedPostId, handlePostClick, handleCloseOverlay, setCloseGuard, setIsPostDirty } = usePostOverlay({
    basePath: "/roadmap",
    onPostClosed: () => pendingRefresh.current,
  })
  const refreshBackground = () => {
    setIsPostDirty(true)
    pendingRefresh.current = postsRef.current?.refreshPosts()
    return pendingRefresh.current
  }

  return (
    <div id="p-roadmap" className="page container">
      <h1 className="c-roadmap-title" tabIndex={-1} data-post-list-focus>
        <Trans id="label.roadmap">Roadmap</Trans>
      </h1>
      <PostsContainer
        ref={postsRef}
        progressView={props.view || "planned"}
        posts={props.posts || []}
        tags={props.tags || []}
        pagination={props.pagination}
        countPerStatus={{}}
        onPostClick={handlePostClick}
      />
      {selectedPostId !== null && (
        <PostDetailsOverlay onClose={handleCloseOverlay}>
          <PostDetails
            key={selectedPostId}
            postNumber={selectedPostId}
            onCloseGuardChange={setCloseGuard}
            onDataChanged={refreshBackground}
            onDeleted={async () => {
              await refreshBackground()
              handleCloseOverlay()
            }}
          />
        </PostDetailsOverlay>
      )}
    </div>
  )
}

const RoadmapPage = (props: RoadmapPageProps) => {
  const fider = useFider()
  const hasRoadmap = fider.isSingleHostMode() || fider.session.tenant.isPro
  const showBillingCta = fider.session.isAuthenticated && fider.session.user.isAdministrator && fider.settings.isBillingEnabled
  return (
    <Header title={i18n._({ id: "header.nav.roadmap", message: "Roadmap" })}>
      {hasRoadmap ? (
        <RoadmapBoard {...props} />
      ) : (
        <div id="p-roadmap-upsell" className="page container text-center">
          <h1 className="c-roadmap-title">
            <Trans id="roadmap.upsell.title">See what&apos;s happening in the Roadmap view</Trans>
          </h1>
          <p>
            <Trans id="roadmap.upsell.description">Upgrade to Pro to unlock your Roadmap</Trans>
          </p>
          {showBillingCta && (
            <a href="/admin/billing">
              <Button variant="primary">
                <Trans id="roadmap.upsell.billing">Upgrade to PRO</Trans>
              </Button>
            </a>
          )}
        </div>
      )}
    </Header>
  )
}

export default RoadmapPage
