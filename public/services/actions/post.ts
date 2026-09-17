import { http, Result, querystring } from "@fider/services"
import { Post, ImageUpload, UserNames, Comment, normalizePostView } from "@fider/models"

export const getAllPosts = async (): Promise<Result<Post[]>> => {
  return await http.get<Post[]>("/api/v1/posts")
}

export const getPost = async (postNumber: number): Promise<Result<Post>> => {
  return await http.get<Post>(`/api/v1/posts/${postNumber}`)
}

export const getComments = async (postNumber: number): Promise<Result<Comment[]>> => {
  return await http.get<Comment[]>(`/api/v1/posts/${postNumber}/comments`)
}

export interface SearchPostsParams {
  query?: string
  view?: string
  limit?: number
  tags?: string[]
  noTags?: boolean
  myPosts?: boolean
  statuses?: string[]
}

export interface PostPagination {
  total: number
  page: number
  pageSize: number
}

export interface PostsPage extends PostPagination {
  posts: Post[]
}

const postSearchURL = (params: SearchPostsParams, page?: number): string => {
  const qsParams = querystring.stringify({
    page,
    tags: params.tags,
    statuses: params.statuses,
    query: params.query,
    view: params.view ? normalizePostView(params.view) : undefined,
    limit: params.limit,
    notags: params.noTags ? "true" : undefined,
    myposts: params.myPosts ? "true" : undefined,
  })
  return `/api/v1/posts${qsParams}`
}

export const searchPosts = async (params: SearchPostsParams): Promise<Result<Post[]>> => http.get<Post[]>(postSearchURL(params))

export const searchPostsPage = async (params: SearchPostsParams, page: number): Promise<Result<PostsPage>> => http.get<PostsPage>(postSearchURL(params, page))

export const findSimilarPosts = async (query: string): Promise<Result<Post[]>> => {
  const params = querystring.stringify({ query: query })
  return await http.get<Post[]>(`/api/v1/similarposts${params}`)
}

export const deletePost = async (postNumber: number, text: string): Promise<Result> => {
  return http
    .delete(`/api/v1/posts/${postNumber}`, {
      text,
    })
    .then(http.event("post", "delete"))
}

export const subscribe = async (postNumber: number): Promise<Result> => {
  return http.post(`/api/v1/posts/${postNumber}/subscription`).then(http.event("post", "subscribe"))
}

export const unsubscribe = async (postNumber: number): Promise<Result> => {
  return http.delete(`/api/v1/posts/${postNumber}/subscription`).then(http.event("post", "unsubscribe"))
}

export const getTaggableUsers = async (userFilter: string): Promise<Result<UserNames[]>> => {
  return http.get<UserNames[]>(`/api/v1/taggable-users${querystring.stringify({ query: userFilter })}`)
}

export const createComment = async (postNumber: number, content: string, attachments: ImageUpload[]): Promise<Result> => {
  return http.post(`/api/v1/posts/${postNumber}/comments`, { content, attachments }).then(http.event("comment", "create"))
}

export const updateComment = async (postNumber: number, commentID: number, content: string, attachments: ImageUpload[]): Promise<Result> => {
  return http.put(`/api/v1/posts/${postNumber}/comments/${commentID}`, { content, attachments }).then(http.event("comment", "update"))
}

export const deleteComment = async (postNumber: number, commentID: number): Promise<Result> => {
  return http.delete(`/api/v1/posts/${postNumber}/comments/${commentID}`).then(http.event("comment", "delete"))
}
interface ToggleReactionResponse {
  added: boolean
}

export const toggleCommentReaction = async (postNumber: number, commentID: number, emoji: string): Promise<Result<ToggleReactionResponse>> => {
  return http.post<ToggleReactionResponse>(`/api/v1/posts/${postNumber}/comments/${commentID}/reactions/${emoji}`)
}

interface SetResponseInput {
  status: string
  text: string
  originalNumber: number
}

export const respond = async (postNumber: number, input: SetResponseInput): Promise<Result> => {
  return http
    .put(`/api/v1/posts/${postNumber}/status`, {
      status: input.status,
      text: input.text,
      originalNumber: input.originalNumber,
    })
    .then(http.event("post", "respond"))
}

interface CreatePostResponse {
  id: number
  number: number
  title: string
  slug: string
  isApproved: boolean
}

export const createPost = async (title: string, description: string, attachments: ImageUpload[], tags: string[]): Promise<Result<CreatePostResponse>> => {
  return http.post<CreatePostResponse>(`/api/v1/posts`, { title, description, attachments, tags }).then(http.event("post", "create"))
}

export const updatePost = async (postNumber: number, title: string, description: string, attachments: ImageUpload[]): Promise<Result> => {
  return http.put(`/api/v1/posts/${postNumber}`, { title, description, attachments }).then(http.event("post", "update"))
}
