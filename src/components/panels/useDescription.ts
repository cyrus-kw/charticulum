"use client";

import { useEffect, useState } from "react";

// Descriptions already fetched, by school and object, so selecting the
// same course again shows it straight away. It lives as long as the page.
const fetched = new Map<string, string | null>();

// An object's description, fetched from the server when it's first asked
// for (the planner page doesn't include them; see openChart). Undefined
// while loading; null if the object has none or the request failed.
export function useDescription(schoolId: string, objectId: string): string | null | undefined {
  const key = `${schoolId}/${objectId}`;
  // The key is stored with the result, so a result for a course that's no
  // longer selected is never shown for the new one.
  const [result, setResult] = useState<{ key: string; description: string | null }>();

  useEffect(() => {
    if (fetched.has(key)) return;
    // If another course is selected before this answer arrives, the
    // answer is still remembered but not shown.
    let current = true;
    fetch(`/api/schools/${encodeURIComponent(schoolId)}/objects/${encodeURIComponent(objectId)}`)
      .then((response) => (response.ok ? response.json() : { description: null }))
      .catch(() => ({ description: null }))
      .then(({ description }: { description: string | null }) => {
        fetched.set(key, description);
        if (current) setResult({ key, description });
      });
    return () => {
      current = false;
    };
  }, [key, schoolId, objectId]);

  if (fetched.has(key)) return fetched.get(key);
  return result?.key === key ? result.description : undefined;
}
