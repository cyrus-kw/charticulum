"use client";

import { useRef, type ClipboardEvent, type KeyboardEvent } from "react";
import { cn, FIELD_FOCUS } from "../ui";

export const CODE_LENGTH = 6;

// An empty code: one blank per box.
export const emptyCode = () => Array<string>(CODE_LENGTH).fill("");

// Six boxes for a 6-digit code, one digit each. Typing a digit moves on to
// the next box, Backspace in an empty box goes back, and pasting (or a
// phone filling in the code from the email) spreads the digits across the
// boxes. The whole code is sent with the form as `name`, from a hidden box.
export function CodeBoxes({
  name,
  value,
  onChange,
  readOnly = false,
  autoFocus = false,
}: {
  name: string;
  // One string per box: a digit, or "" while empty.
  value: string[];
  onChange: (value: string[]) => void;
  readOnly?: boolean;
  autoFocus?: boolean;
}) {
  // The six <input> elements, so focus can be moved between them.
  const boxes = useRef<(HTMLInputElement | null)[]>([]);
  const focus = (index: number) => boxes.current[Math.max(0, Math.min(CODE_LENGTH - 1, index))]?.focus();

  // Put `digits` into the boxes starting at `start`, then move to the box
  // after the last one filled.
  const fill = (start: number, digits: string) => {
    const next = [...value];
    const usable = digits.replace(/\D/g, "").slice(0, CODE_LENGTH - start);
    [...usable].forEach((digit, i) => (next[start + i] = digit));
    onChange(next);
    focus(start + usable.length);
  };

  const onKeyDown = (index: number) => (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Backspace" && !value[index] && index > 0) {
      event.preventDefault();
      const next = [...value];
      next[index - 1] = "";
      onChange(next);
      focus(index - 1);
    } else if (event.key === "ArrowLeft") {
      event.preventDefault();
      focus(index - 1);
    } else if (event.key === "ArrowRight") {
      event.preventDefault();
      focus(index + 1);
    }
  };

  const onPaste = (index: number) => (event: ClipboardEvent<HTMLInputElement>) => {
    event.preventDefault();
    fill(index, event.clipboardData.getData("text"));
  };

  return (
    <div className="flex gap-2">
      <input type="hidden" name={name} value={value.join("")} />
      {value.map((digit, index) => (
        <input
          key={index}
          ref={(element) => {
            boxes.current[index] = element;
          }}
          aria-label={`Digit ${index + 1} of ${CODE_LENGTH}`}
          // Phones offer the code from the email on the first box.
          autoComplete={index === 0 ? "one-time-code" : "off"}
          // The number keypad on phones.
          inputMode="numeric"
          autoFocus={autoFocus && index === 0}
          readOnly={readOnly}
          value={digit}
          // Selecting the digit on focus means typing replaces it.
          onFocus={(event) => event.target.select()}
          onChange={(event) => {
            const typed = event.target.value.replace(/\D/g, "");
            if (typed.length > 1) fill(index, typed);
            else {
              const next = [...value];
              next[index] = typed;
              onChange(next);
              if (typed) focus(index + 1);
            }
          }}
          onKeyDown={onKeyDown(index)}
          onPaste={onPaste(index)}
          className={cn(
            // Same corners and border as the app's other text boxes.
            "h-12 w-full min-w-0 rounded-md border border-zinc-300 bg-white text-center text-xl font-medium tabular-nums",
            FIELD_FOCUS,
            "dark:border-zinc-700 dark:bg-zinc-900",
            readOnly && "text-zinc-500",
          )}
        />
      ))}
    </div>
  );
}
