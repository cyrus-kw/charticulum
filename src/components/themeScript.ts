// The part of the light/dark switch that runs before the page loads.
// It's in its own file, without React, so the server-side layout can
// import it (the rest of theme.ts only works in the browser).

export const THEME_KEY = "charticulum:theme";
export const SYSTEM_DARK = "(prefers-color-scheme: dark)";

// Runs in <head> before anything is drawn, so a dark page never flashes
// white first. It's a string because it goes into the HTML as-is, before
// React or any of our other code has loaded.
export const themeScript = `(function(){var d=matchMedia("${SYSTEM_DARK}").matches;try{var t=localStorage.getItem("${THEME_KEY}");if(t==="light"||t==="dark")d=t==="dark"}catch(e){}document.documentElement.classList.toggle("dark",d)})()`;
