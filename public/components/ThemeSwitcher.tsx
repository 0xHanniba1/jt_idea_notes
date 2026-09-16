import IconMoon from "@fider/assets/images/heroicons-moon.svg"
import IconSun from "@fider/assets/images/heroicons-sun.svg"
import React, { useEffect, useState } from "react"
import { Icon } from "./common"
import "./ThemeSwitcher.scss"
import { i18n } from "@lingui/core"
import { cache } from "@fider/services/cache"

type themeType = "light" | "dark"

export const ThemeSwitcher = () => {
  // Lazy initialization of the theme state
  const [currentTheme, setCurrentTheme] = useState<themeType>("light")

  useEffect(() => {
    const saved = cache.local.get("theme")
    const theme = saved === "dark" ? "dark" : "light"
    setCurrentTheme(theme)
    document.body.setAttribute("data-theme", theme)
  }, [])

  const toggleTheme = () => {
    const newTheme = currentTheme === "light" ? "dark" : "light"
    cache.local.set("theme", newTheme)
    document.body.setAttribute("data-theme", newTheme)
    setCurrentTheme(newTheme)
  }

  const icon = currentTheme === "light" ? <Icon sprite={IconMoon} className="h-5 text-gray-500" /> : <Icon sprite={IconSun} className="h-5 text-gray-500" />

  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label={i18n._({ id: "action.toggletheme", message: "Toggle theme" })}
      aria-pressed={currentTheme === "dark"}
      className="c-themeswitcher"
    >
      {icon}
    </button>
  )
}
