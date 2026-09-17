import "./Home.page.scss"
import NoDataIllustration from "@fider/assets/images/undraw-no-data.svg"
import IconPlusCircle from "@fider/assets/images/heroicons-pluscircle.svg"

import React, { useEffect, useState, useRef } from "react"
import { Post, Tag, PostStatus } from "@fider/models"
import { Markdown, Hint, Icon, Header, Button } from "@fider/components"
import { PostsContainer } from "./components/PostsContainer"
import { useFider, usePostOverlay } from "@fider/hooks"
import { HStack } from "@fider/components/layout"
import { ShareFeedback } from "./components/ShareFeedback"
import { i18n } from "@lingui/core"
import { Trans } from "@lingui/react/macro"
import { isPostPending, setPostPending } from "./components/PostCache"
import { PostDetails, PostDetailsOverlay } from "@fider/components/PostDetails"

export interface HomePageProps {
  posts: Post[]
  tags: Tag[]
  searchNoiseWords: string[]
  countPerStatus: { [key: string]: number }
}

export interface HomePageState {
  title: string
}

const Lonely = () => {
  const fider = useFider()

  return (
    <div className="text-center">
      <Hint permanentCloseKey="at-least-3-posts" condition={fider.session.isAuthenticated && fider.session.user.isAdministrator}>
        <p>
          <Trans id="home.lonely.suggestion">
            It&apos;s recommended that you create <strong>at least 3</strong> suggestions here before sharing this site. The initial content is important to
            start engaging your audience.
          </Trans>
        </p>
      </Hint>
      <Icon sprite={NoDataIllustration} height="120" className="mt-6 mb-2" />
      <p className="text-muted">
        <Trans id="home.lonely.text">No posts have been created yet.</Trans>
      </p>
    </div>
  )
}

const HomePage = (props: HomePageProps) => {
  const fider = useFider()
  const postsContainerRef = useRef<PostsContainer>(null)
  const pendingRefresh = useRef<Promise<unknown>>()
  const [isShareFeedbackOpen, setIsShareFeedbackOpen] = useState(isPostPending())
  const [welcomeExpanded, setWelcomeExpanded] = useState(false)
  const [welcomeOverflow, setWelcomeOverflow] = useState(false)
  const welcomeRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const welcome = welcomeRef.current
    if (!welcome || welcomeExpanded) return
    const measure = () => setWelcomeOverflow(welcome.scrollHeight > welcome.clientHeight + 1)
    measure()
    if (typeof ResizeObserver === "undefined") return
    const observer = new ResizeObserver(measure)
    observer.observe(welcome)
    if (welcome.firstElementChild) observer.observe(welcome.firstElementChild)
    return () => observer.disconnect()
  }, [welcomeExpanded])

  const { selectedPostId, handlePostClick, handleCloseOverlay, setCloseGuard, setIsPostDirty } = usePostOverlay({
    basePath: "/",
    onPostClosed: () => pendingRefresh.current,
  })

  const refreshBackground = () => {
    setIsPostDirty(true)
    pendingRefresh.current = postsContainerRef.current?.refreshPosts()
    return pendingRefresh.current
  }

  useEffect(() => {
    // If we're showing the share feedback, make sure we clear the show pending flag (for draft posts)
    if (isShareFeedbackOpen) {
      if (isPostPending()) {
        setPostPending(false)
      }
    }
  })

  const defaultWelcomeMessage = i18n._({
    id: "home.form.defaultrecordingmessage",
    message: `We'd love to hear what you're thinking about.

What can we do better? This is the place for you to discuss and share ideas.`,
  })

  const defaultInvitation = i18n._({ id: "home.form.defaultinvitation", message: "Enter your suggestion here..." })

  const isLonely = () => {
    const len = Object.keys(props.countPerStatus).length
    if (len === 0) {
      return true
    }

    if (len === 1 && PostStatus.Deleted.value in props.countPerStatus) {
      return true
    }

    return false
  }

  const handleNewPost = () => {
    setIsShareFeedbackOpen(true)
  }

  const parseWelcomeHeader = (text: string): JSX.Element[] => {
    const parts: JSX.Element[] = []
    let currentIndex = 0
    const regex = /_([^_]+)_/g
    let match: RegExpExecArray | null

    while ((match = regex.exec(text)) !== null) {
      // Add text before the match
      if (match.index > currentIndex) {
        parts.push(<span key={currentIndex}>{text.slice(currentIndex, match.index)}</span>)
      }
      // Add the highlighted text
      parts.push(
        <span key={match.index} className="header-emphasis">
          {match[1]}
        </span>
      )
      currentIndex = regex.lastIndex
    }

    // Add remaining text
    if (currentIndex < text.length) {
      parts.push(<span key={currentIndex}>{text.slice(currentIndex)}</span>)
    }

    return parts
  }

  return (
    <Header title={i18n._({ id: "header.nav.feedback", message: "All Feedback" })}>
      <ShareFeedback
        tags={props.tags}
        placeholder={fider.session.tenant.invitation || defaultInvitation}
        isOpen={isShareFeedbackOpen && !fider.isReadOnly}
        onClose={() => setIsShareFeedbackOpen(false)}
      />
      <div id="p-home" className="page container">
        <div className="p-home__heading">
          <div className="p-home__welcome">
            <h1 className="p-home__welcome-title" tabIndex={-1} data-post-list-focus>
              {fider.session.tenant.welcomeHeader ? parseWelcomeHeader(fider.session.tenant.welcomeHeader) : fider.session.tenant.name}
            </h1>
            <div ref={welcomeRef} id="home-welcome" className={`p-home__welcome-body${welcomeExpanded ? " is-expanded" : ""}`}>
              <Markdown text={fider.session.tenant.welcomeMessage || defaultWelcomeMessage} style="full" />
            </div>
            {(welcomeOverflow || welcomeExpanded) && (
              <button
                className="p-home__welcome-toggle"
                aria-expanded={welcomeExpanded}
                aria-controls="home-welcome"
                onClick={() => setWelcomeExpanded(!welcomeExpanded)}
              >
                {welcomeExpanded ? <Trans id="home.welcome.collapse">Show less</Trans> : <Trans id="home.welcome.expand">Read welcome message</Trans>}
              </button>
            )}
          </div>
          <Button variant="primary" disabled={fider.isReadOnly} onClick={handleNewPost}>
            <HStack spacing={2} align="center">
              <Icon sprite={IconPlusCircle} />
              <span>
                <Trans id="home.newidea">New idea</Trans>
              </span>
            </HStack>
          </Button>
        </div>
        {isLonely() ? (
          <Lonely />
        ) : (
          <PostsContainer ref={postsContainerRef} posts={props.posts} tags={props.tags} countPerStatus={props.countPerStatus} onPostClick={handlePostClick} />
        )}
      </div>
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
    </Header>
  )
}

export default HomePage
