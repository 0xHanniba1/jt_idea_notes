import "./PostsContainer.scss"

import React from "react"
import { PostPagination } from "@fider/services/actions/post"

import { Post, Tag, CurrentUser, normalizePostView } from "@fider/models"
import { Loader, Input, Button } from "@fider/components"
import { actions, navigator, querystring } from "@fider/services"
import IconSearch from "@fider/assets/images/heroicons-search.svg"
import IconX from "@fider/assets/images/heroicons-x.svg"
import { PostFilter } from "./PostFilter"
import { ListPosts } from "./ListPosts"
import { i18n } from "@lingui/core"
import { PostsSort } from "./PostsSort"

interface PostsContainerProps {
  user?: CurrentUser
  pagination?: PostPagination
  posts: Post[]
  tags: Tag[]
  countPerStatus: { [key: string]: number }
  onPostClick?: (postNumber: number, slug: string, event?: React.MouseEvent<HTMLAnchorElement>) => void
}

interface PostsContainerState {
  loading: boolean
  failed: boolean
  posts?: Post[] // All posts
  view: string
  filterState: FilterState // Filter state
  query: string // Search query
  moderation: string
  limit: number
  page: number
  total: number
}

export interface FilterState {
  tags: string[]
  statuses: string[]
  myPosts: boolean
  noTags: boolean
}

export class PostsContainer extends React.Component<PostsContainerProps, PostsContainerState> {
  constructor(props: PostsContainerProps) {
    super(props)

    const view = normalizePostView(querystring.get("view"))

    this.state = {
      posts: this.props.posts,
      loading: false,
      failed: false,
      view,
      query: querystring.get("query"),
      moderation: querystring.get("moderation"),
      filterState: {
        tags: querystring.getArray("tags"),
        statuses: querystring.getArray("statuses"),
        myPosts: querystring.get("myposts") === "true",
        noTags: querystring.get("notags") === "true",
      },
      limit: props.pagination?.pageSize || 25,
      page: props.pagination?.page || 1,
      total: props.pagination?.total ?? props.posts.length,
    }
  }

  public componentDidMount() {
    const currentURL = new URL(navigator.url())
    const normalizedURL = this.getNormalizedURL()
    if (currentURL.search !== normalizedURL.search) {
      navigator.replaceState(`${normalizedURL.pathname}${normalizedURL.search}${normalizedURL.hash}`)
    }
  }

  public componentWillUnmount() {
    window.clearTimeout(this.timer)
    this.requestVersion += 1
  }

  private getNormalizedURL(): URL {
    const url = new URL(navigator.url())
    url.searchParams.delete("myvotes")
    if (url.searchParams.has("view")) {
      url.searchParams.set("view", this.state.view)
    }
    if (url.searchParams.has("limit")) url.searchParams.set("limit", String(this.state.limit))
    if (url.searchParams.has("page") || this.state.page > 1) url.searchParams.set("page", String(this.state.page))
    return url
  }

  private changeFilterCriteria(obj: Partial<PostsContainerState>, reset: boolean): void {
    this.setState(
      (state) => ({ ...state, ...obj, page: obj.page ?? 1 }),
      () => {
        const query = this.state.query.trim().toLowerCase()
        navigator.replaceState(
          querystring.stringify({
            statuses: this.state.filterState.statuses,
            tags: this.state.filterState.tags,
            myposts: this.state.filterState.myPosts ? "true" : undefined,
            notags: this.state.filterState.noTags ? "true" : undefined,
            query,
            view: this.state.view,
            limit: this.state.limit,
            page: this.state.page,
            moderation: this.state.moderation,
          })
        )

        this.searchPosts(
          query,
          this.state.view,
          this.state.limit,
          this.state.filterState.tags,
          this.state.filterState.statuses,
          this.state.filterState.myPosts,
          this.state.filterState.noTags,
          reset
        )
      }
    )
  }

  private timer?: number
  private requestVersion = 0
  private async searchPosts(
    query: string,
    view: string,
    limit: number | undefined,
    tags: string[],
    statuses: string[],
    myPosts: boolean,
    noTags: boolean,
    reset: boolean
  ) {
    window.clearTimeout(this.timer)
    const version = ++this.requestVersion
    const page = this.state.page
    this.setState({ posts: reset ? undefined : this.state.posts, loading: true, failed: false })
    this.timer = window.setTimeout(() => {
      void this.fetchPosts(version, query, view, limit, tags, statuses, myPosts, noTags, page)
    }, 500)
  }

  private async fetchPosts(
    version: number,
    query: string,
    view: string,
    limit: number | undefined,
    tags: string[],
    statuses: string[],
    myPosts: boolean,
    noTags: boolean,
    page: number
  ) {
    const moderation = statuses.includes("pending") ? "pending" : this.state.moderation
    try {
      const response = await actions.searchPostsPage(
        { query, view, limit, tags, statuses: statuses.filter((s) => s !== "pending"), myPosts, noTags, moderation },
        page
      )
      if (version !== this.requestVersion) return
      if (!response.ok || !response.data) {
        this.setState({ loading: false, failed: true })
        return
      }
      const data = response.data
      this.setState({ loading: false, failed: false, posts: data.posts, total: data.total, page: data.page, limit: data.pageSize }, () => {
        // Refreshing behind a detail drawer must not rewrite its URL.
        if (new URL(navigator.url()).pathname === "/") {
          const url = this.getNormalizedURL()
          navigator.replaceState(`${url.pathname}${url.search}${url.hash}`)
        }
      })
    } catch {
      if (version === this.requestVersion) this.setState({ loading: false, failed: true })
    }
  }

  // Re-run the same query so edits, status changes and comments respect the
  // current filters, ordering and loaded page size, including removed records.
  public refreshPosts = async () => {
    window.clearTimeout(this.timer)
    const version = ++this.requestVersion
    const { query, view, limit, filterState } = this.state
    this.setState({ loading: true, failed: false })
    await this.fetchPosts(
      version,
      query.trim().toLowerCase(),
      view,
      limit,
      filterState.tags,
      filterState.statuses,
      filterState.myPosts,
      filterState.noTags,
      this.state.page
    )
  }

  public updateSinglePost = () => this.refreshPosts()

  private handleFilterChanged = (filterState: FilterState) => {
    this.changeFilterCriteria({ filterState }, true)
  }

  private handleSearchFilterChanged = (query: string) => {
    this.changeFilterCriteria({ query }, true)
  }

  private handleSortChanged = (view: string) => {
    this.changeFilterCriteria({ view }, true)
  }

  private clearSearch = () => {
    this.changeFilterCriteria({ query: "" }, true)
  }

  public render() {
    const { total, page, limit, loading, failed } = this.state
    const pages = Math.max(1, Math.ceil(total / limit))
    const start = total ? (page - 1) * limit + 1 : 0
    const end = Math.min(page * limit, total)
    const headerClass = this.state.query ? "c-posts-container__header c-posts-container__header--searching" : "c-posts-container__header"

    return (
      <div className="c-posts-container">
        <div className={headerClass}>
          <div className="c-posts-container__filter-col">
            <PostFilter
              tags={this.props.tags}
              activeFilter={this.state.filterState}
              filtersChanged={this.handleFilterChanged}
              countPerStatus={this.props.countPerStatus}
            />
            {!this.state.query && <PostsSort onChange={this.handleSortChanged} value={this.state.view} />}
          </div>
          <div className="c-posts-container__search-col">
            <Input
              field="query"
              ariaLabel={i18n._({ id: "home.postscontainer.query.placeholder", message: "Search" })}
              iconAriaLabel={this.state.query ? i18n._({ id: "home.search.clear", message: "Clear search" }) : undefined}
              icon={this.state.query ? IconX : IconSearch}
              onIconClick={this.state.query ? this.clearSearch : undefined}
              placeholder={i18n._({ id: "home.postscontainer.query.placeholder", message: "Search" })}
              value={this.state.query}
              onChange={this.handleSearchFilterChanged}
            />
          </div>
        </div>
        <div className="c-posts-container__list">
          {this.state.failed && (
            <div className="c-posts-container__error" role="alert">
              <p>{i18n._({ id: "home.load.failed", message: "Unable to load ideas. Please try again." })}</p>
              <Button onClick={this.refreshPosts}>{i18n._({ id: "action.retry", message: "Retry" })}</Button>
            </div>
          )}
          <ListPosts
            posts={this.state.failed && !this.state.posts ? undefined : this.state.posts}
            tags={this.props.tags}
            emptyText={i18n._({ id: "home.postscontainer.label.noresults", message: "No results matched your search, try something different." })}
            onPostClick={this.props.onPostClick}
          />
          {this.state.loading && (
            <div role="status" aria-label={i18n._({ id: "label.loading", message: "Loading" })}>
              <Loader />
            </div>
          )}
        </div>
        {!failed && (
          <nav className="c-posts-container__pagination" aria-label={i18n._({ id: "home.pagination.label", message: "Ideas pagination" })}>
            <span role="status">
              {loading
                ? i18n._({ id: "label.loading", message: "Loading" })
                : i18n._({ id: "home.pagination.range", message: "{total} total · {start}–{end}", values: { total, start, end } })}
            </span>
            <div className="c-posts-container__page-controls">
              <label htmlFor="posts-page-size">{i18n._({ id: "home.pagination.perpage", message: "Per page" })}</label>
              <select
                id="posts-page-size"
                disabled={loading}
                value={limit}
                onChange={(event) => this.changeFilterCriteria({ limit: Number(event.target.value) }, true)}
              >
                {[10, 25, 50, 100].map((size) => (
                  <option value={size} key={size}>
                    {size}
                  </option>
                ))}
              </select>
              <span>{i18n._({ id: "home.pagination.items", message: "items" })}</span>
              <button
                type="button"
                aria-label={i18n._({ id: "home.pagination.previous", message: "Previous page" })}
                disabled={loading || page <= 1}
                onClick={() => this.changeFilterCriteria({ page: page - 1 }, true)}
              >
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="m14 7-5 5 5 5" />
                </svg>
              </button>
              <span className="c-posts-container__page-number">
                {page} / {pages}
              </span>
              <button
                type="button"
                aria-label={i18n._({ id: "home.pagination.next", message: "Next page" })}
                disabled={loading || page >= pages}
                onClick={() => this.changeFilterCriteria({ page: page + 1 }, true)}
              >
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="m10 7 5 5-5 5" />
                </svg>
              </button>
            </div>
          </nav>
        )}
      </div>
    )
  }
}
