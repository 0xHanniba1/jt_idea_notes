import React, { useEffect, useState } from "react"
import IconSearch from "@fider/assets/images/heroicons-search.svg"
import { Button, Input, ShowPostStatus } from "@fider/components"
import { actions } from "@fider/services"
import { Post, PostStatus } from "@fider/models"
import { i18n } from "@lingui/core"
import { Trans } from "@lingui/react/macro"

import "./PostSearch.scss"

interface PostSearchProps {
  exclude?: number[]
  disabled?: boolean
  onChanged(postNumber: number): void
}

export const PostSearch = (props: PostSearchProps) => {
  const [query, setQuery] = useState("")
  const [posts, setPosts] = useState<Post[]>([])
  const [selectedPost, setSelectedPost] = useState<Post>()
  const [loading, setLoading] = useState(false)
  const [failed, setFailed] = useState(false)
  const [retry, setRetry] = useState(0)
  const excluded = (props.exclude || []).join(",")

  useEffect(() => {
    let active = true
    setPosts([])
    setFailed(false)
    if (!query.trim()) {
      setLoading(false)
      return
    }
    setLoading(true)
    const timer = window.setTimeout(async () => {
      try {
        const result = await actions.searchPosts({ query: query.trim(), limit: 6 })
        if (!active) return
        if (result.ok) {
          const excludedNumbers = excluded.split(",").map(Number)
          setPosts((result.data || []).filter((post) => !excludedNumbers.includes(post.number)))
        } else setFailed(true)
      } catch {
        if (active) setFailed(true)
      } finally {
        if (active) setLoading(false)
      }
    }, 500)
    return () => {
      active = false
      window.clearTimeout(timer)
    }
  }, [query, excluded, retry])

  const selectPost = (post: Post) => {
    if (props.disabled) return
    props.onChanged(post.number)
    setSelectedPost(post)
  }

  // Keep the current target visible while another query is loading or empty.
  const visiblePosts = selectedPost ? [selectedPost, ...posts.filter((post) => post.number !== selectedPost.number)] : posts

  return (
    <div className="c-post-search">
      <Input
        field="original-post-query"
        icon={IconSearch}
        placeholder={i18n._({ id: "showpost.postsearch.query.placeholder", message: "Search original post..." })}
        value={query}
        onChange={setQuery}
        disabled={props.disabled}
      />
      {visiblePosts.length > 0 && (
        <div className="c-post-search__results" role="group" aria-label={i18n._({ id: "showpost.postsearch.results", message: "Choose the original record" })}>
          {visiblePosts.map((post) => (
            <button
              key={post.number}
              type="button"
              className="c-post-search__result"
              aria-pressed={selectedPost?.number === post.number}
              disabled={props.disabled}
              onClick={() => selectPost(post)}
            >
              <span className="c-post-search__title">{post.title}</span>
              <span className="c-post-search__meta">
                #{post.number} · <ShowPostStatus status={PostStatus.Get(post.status)} />
              </span>
            </button>
          ))}
        </div>
      )}
      {loading && (
        <div className="c-post-search__message" role="status">
          <Trans id="label.loading">Loading</Trans>
        </div>
      )}
      {failed && (
        <div className="c-post-search__message" role="alert">
          <p>
            <Trans id="home.load.failed">Unable to load ideas. Please try again.</Trans>
          </p>
          <Button disabled={props.disabled} onClick={() => setRetry((value) => value + 1)}>
            <Trans id="action.retry">Retry</Trans>
          </Button>
        </div>
      )}
      {!loading && !failed && query.trim() && posts.length === 0 && (
        <p className="c-post-search__message">
          <Trans id="home.postscontainer.label.noresults">No results matched your search, try something different.</Trans>
        </p>
      )}
    </div>
  )
}
