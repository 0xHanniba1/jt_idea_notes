import React from "react"
import { Post, Tag, CurrentUser } from "@fider/models"
import { ShowTag, Markdown, Icon, ResponseLozenge } from "@fider/components"
import IconChatAlt2 from "@fider/assets/images/heroicons-chat-alt-2.svg"
import { HStack, VStack } from "@fider/components/layout"
import { useFider } from "@fider/hooks"
import { Trans } from "@lingui/react/macro"

interface ListPostsProps {
  posts?: Post[]
  tags: Tag[]
  emptyText: string
  minimalView?: boolean
  showStatus?: boolean
  onPostClick?: (postNumber: number, slug: string, event?: React.MouseEvent<HTMLAnchorElement>) => void
}

const ListPostItem = (props: {
  post: Post
  user?: CurrentUser
  tags: Tag[]
  showStatus?: boolean
  onPostClick?: (postNumber: number, slug: string, event?: React.MouseEvent<HTMLAnchorElement>) => void
}) => {
  const fider = useFider()
  const isModerationEnabled = fider.session.tenant.isModerationEnabled
  const isPending = isModerationEnabled && !props.post.isApproved

  const handleClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
    if (props.onPostClick) {
      props.onPostClick(props.post.number, props.post.slug, e)
    }
  }

  return (
    <a
      href={`/posts/${props.post.number}/${props.post.slug}`}
      data-post-number={props.post.number}
      className="c-posts-container__post-link"
      onClick={handleClick}
    >
      <div className="c-posts-container__post">
        <div className="c-posts-container__post-main">
          <h3 className="c-posts-container__post-title">{props.post.title}</h3>
          <Markdown className="c-posts-container__postdescription" maxLength={300} text={props.post.description} style="plainText" />
        </div>
        <div className="c-posts-container__post-meta">
          <div className="c-posts-container__post-status">
            {isPending && (
              <span className="c-posts-container__pending">
                <Trans id="post.pending">pending</Trans>
              </span>
            )}
            {props.showStatus !== false && <ResponseLozenge status={props.post.status} response={props.post.response} size="small" />}
            {props.post.commentsCount > 0 && (
              <span className="c-posts-container__post-comments">
                <Icon sprite={IconChatAlt2} />
                <span>{props.post.commentsCount}</span>
              </span>
            )}
          </div>
          {props.tags.length > 0 && (
            <div className="c-posts-container__post-tags">
              {props.tags.map((tag) => (
                <ShowTag key={tag.id} tag={tag} />
              ))}
            </div>
          )}
        </div>
      </div>
    </a>
  )
}

const MinimalListPostItem = (props: {
  post: Post
  tags: Tag[]
  onPostClick?: (postNumber: number, slug: string, event?: React.MouseEvent<HTMLAnchorElement>) => void
}) => {
  const fider = useFider()
  const isModerationEnabled = fider.session.tenant.isModerationEnabled
  const isPending = isModerationEnabled && !props.post.isApproved

  const handleClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
    if (props.onPostClick) {
      props.onPostClick(props.post.number, props.post.slug, e)
    }
  }

  return (
    <HStack spacing={4} align="start" className="c-posts-container__post-minimal">
      <HStack className="w-full" justify="between" align="start">
        <HStack spacing={2} align="start" justify="between" className="w-full">
          <a className="text-link" data-post-number={props.post.number} href={`/posts/${props.post.number}/${props.post.slug}`} onClick={handleClick}>
            {props.post.title}
          </a>
          {isPending && (
            <span className="c-posts-container__pending">
              <Trans id="post.pending">pending</Trans>
            </span>
          )}
        </HStack>
        {props.post.status !== "open" && (
          <div>
            <ResponseLozenge status={props.post.status} response={props.post.response} size={"micro"} />
          </div>
        )}
      </HStack>
    </HStack>
  )
}

export const ListPosts = (props: ListPostsProps) => {
  const { minimalView = false } = props

  if (!props.posts) {
    return null
  }

  if (props.posts.length === 0) {
    return <p className="text-center">{props.emptyText}</p>
  }

  const visiblePosts = props.posts

  return (
    <>
      {minimalView ? (
        <VStack spacing={2}>
          {visiblePosts.map((post) => (
            <MinimalListPostItem
              key={post.id}
              post={post}
              tags={props.tags.filter((tag) => post.tags.indexOf(tag.slug) >= 0)}
              onPostClick={props.onPostClick}
            />
          ))}
        </VStack>
      ) : (
        <>
          {visiblePosts.map((post) => (
            <ListPostItem
              key={post.id}
              post={post}
              tags={props.tags.filter((tag) => post.tags.indexOf(tag.slug) >= 0)}
              showStatus={props.showStatus}
              onPostClick={props.onPostClick}
            />
          ))}
        </>
      )}
    </>
  )
}
