"use client";

import { useTransition } from "react";
import { deleteChartAction } from "../../app/actions";
import { Button } from "../ui";

export function DeleteChartButton({ id, name }: { id: string; name: string }) {
  // pending is true while the server deletes it, so the button can't be
  // pressed twice.
  const [pending, startTransition] = useTransition();
  return (
    <Button
      variant="danger"
      disabled={pending}
      aria-label={`Delete ${name}`}
      onClick={() => {
        if (window.confirm(`Delete “${name}”? This can't be undone.`)) {
          startTransition(() => deleteChartAction(id));
        }
      }}
    >
      Delete
    </Button>
  );
}
