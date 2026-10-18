"use client";

import { MoonIcon, SunIcon } from "./icons";
import { HEADER_BUTTON, TOGGLE_SIZE } from "./SidePanel";
import { setTheme, useTheme } from "./theme";

// Light/dark mode. Shows the mode it switches to: a moon in light mode, a
// sun in dark.
export function ThemeToggle() {
  const theme = useTheme();
  return (
    <button
      type="button"
      aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
      title={theme === "dark" ? "Light mode" : "Dark mode"}
      onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
      style={{ width: TOGGLE_SIZE, height: TOGGLE_SIZE }}
      className={HEADER_BUTTON}
    >
      {theme === "dark" ? <SunIcon /> : <MoonIcon />}
    </button>
  );
}
