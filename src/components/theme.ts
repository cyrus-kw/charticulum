// Light or dark mode. The page is dark when <html> has the "dark" class
// (Tailwind's dark: styles look for it; see globals.css). The viewer's
// choice is remembered in this browser; until they pick one, the page
// follows their system setting.
import { useSyncExternalStore } from "react";
import { SYSTEM_DARK, THEME_KEY as KEY } from "./themeScript";

export type Theme = "light" | "dark";

// The saved choice, or null if the viewer hasn't picked one (or the
// browser blocks storage).
function savedTheme(): Theme | null {
  try {
    const value = localStorage.getItem(KEY);
    return value === "light" || value === "dark" ? value : null;
  } catch {
    return null;
  }
}

function apply(theme: Theme) {
  document.documentElement.classList.toggle("dark", theme === "dark");
}

export function setTheme(theme: Theme) {
  apply(theme);
  try {
    localStorage.setItem(KEY, theme);
  } catch {
    // Storage blocked: the switch still works until the page reloads.
  }
}

// Call `onChange` whenever the theme changes: when <html>'s class changes,
// or when the system setting changes and the viewer hasn't picked one.
function subscribe(onChange: () => void) {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
  const query = window.matchMedia(SYSTEM_DARK);
  const followSystem = () => {
    if (!savedTheme()) apply(query.matches ? "dark" : "light");
  };
  query.addEventListener("change", followSystem);
  return () => {
    observer.disconnect();
    query.removeEventListener("change", followSystem);
  };
}

// The current theme, kept up to date. The server can't know it, so the
// server's copy of the page (and the first draw in the browser) says
// "light"; React then switches to the real value straight away.
export function useTheme(): Theme {
  return useSyncExternalStore(
    subscribe,
    () => (document.documentElement.classList.contains("dark") ? "dark" : "light"),
    () => "light",
  );
}
