"use client";

import { themeScript } from "./themeScript";

// The <script> in <head> that sets light or dark before the page is drawn.
// In the server's HTML it runs as normal code. If React ever has to draw
// the page again in the browser (it does after a page crashes), React
// can't run scripts, and it warns about any it finds. So in the browser
// the tag is marked type="text/plain" ("just text, not code"), which React
// accepts quietly. The theme was set long before by then, so nothing is lost.
export function ThemeScript() {
  // typeof window: there's no window on the server, only in the browser.
  const inBrowser = typeof window !== "undefined";
  return (
    <script
      // The type differs between the server's HTML and the browser on
      // purpose; this stops React warning about that difference.
      suppressHydrationWarning
      type={inBrowser ? "text/plain" : undefined}
      dangerouslySetInnerHTML={{ __html: themeScript }}
    />
  );
}
