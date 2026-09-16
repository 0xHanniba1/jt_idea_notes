import React from "react"
import { Dropdown } from "@fider/components"
import { i18n } from "@lingui/core"
import IconChat from "@fider/assets/images/heroicons-chat-alt-2.svg"
import IconClock from "@fider/assets/images/heroicons-clock.svg"
import { HStack } from "@fider/components/layout"

interface PostsSortProps {
  value: string
  onChange: (value: string) => void
}

export const PostsSort: React.FC<PostsSortProps> = ({ value = "recent", onChange }) => {
  const options = [
    { value: "recent", label: i18n._({ id: "home.postfilter.option.recent", message: "Recent" }), icon: IconClock },
    { value: "most-discussed", label: i18n._({ id: "home.postfilter.option.mostdiscussed", message: "Most Discussed" }), icon: IconChat },
  ]

  const selectedItem = options.find((x) => x.value === value) || options[0]

  return (
    <div>
      <Dropdown
        renderHandle={
          <HStack className="c-post-sort-btn">
            {i18n._({ id: "home.postsort.label", message: "Sort by:" })} {selectedItem.label}
          </HStack>
        }
      >
        {options.map((o) => (
          <Dropdown.ListItem key={o.value} onClick={() => onChange(o.value)} icon={o.icon} checked={value === o.value}>
            <span className={value === o.value ? "text-semibold" : ""}>{o.label}</span>
          </Dropdown.ListItem>
        ))}
      </Dropdown>
    </div>
  )
}
