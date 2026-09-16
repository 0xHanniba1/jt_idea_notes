import "./ShowPost.page.scss"

import React from "react"

import { Comment, Post, Tag } from "@fider/models"
import { Header } from "@fider/components"
import { PostDetails } from "@fider/components/PostDetails"

interface ShowPostPageProps {
  post: Post
  subscribed: boolean
  comments: Comment[]
  tags: Tag[]
  attachments: string[]
}

export default function ShowPostPage(props: ShowPostPageProps) {
  return (
    <>
      <Header />
      <div id="p-show-post" className="page container">
        <PostDetails
          postNumber={props.post.number}
          initialPost={props.post}
          initialSubscribed={props.subscribed}
          initialComments={props.comments}
          initialTags={props.tags}
          initialAttachments={props.attachments}
        />
      </div>
    </>
  )
}
