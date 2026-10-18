"use client";

import { useEffect, useState } from "react";

// A date in the viewer's own time zone and format. The server doesn't know
// those, so the time is filled in once the page reaches the browser.
export function LocalTime({ iso }: { iso: string }) {
  const [text, setText] = useState<string | null>(null);
  useEffect(() => setText(new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })), [iso]);
  return <time dateTime={iso}>{text ?? " "}</time>;
}
