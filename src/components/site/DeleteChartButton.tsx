"use client";

import { useTransition } from "react";
import { deleteChartAction } from "../../app/actions";
import { askToConfirm } from "../ConfirmDialog";
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
      onClick={async () => {
        if (await askToConfirm({ message: `Delete “${name}”? This can't be undone.`, confirmLabel: "Delete", danger: true })) {
          startTransition(() => deleteChartAction(id));
        }
      }}
    >
      Delete
    </Button>
  );
}
