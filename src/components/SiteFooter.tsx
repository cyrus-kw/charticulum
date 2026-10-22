"use client";

// "use client" only so this file can read PANEL_HEADER_HEIGHT: SidePanel.tsx
// is a client file, and a server component can't use its plain values.
import Link from "next/link";
import { Fragment } from "react";
import { GitHubIcon, MailIcon } from "./icons";
import { HEADER_BUTTON, PANEL_HEADER_HEIGHT, TOGGLE_SIZE } from "./SidePanel";

const LINKS = [
  // mailto: opens the visitor's email app with a new message to this address.
  { href: "mailto:hello@charticulum.com", label: "Email hello@charticulum.com", icon: <MailIcon /> },
  { href: "https://github.com/cyrus-kw/charticulum", label: "Charticulum on GitHub", icon: <GitHubIcon /> },
];

// Pages written out after the copyright, each with a grey dot before it:
// "© 2026 Charticulum · Privacy · Terms".
const PAGES = [
  { href: "/privacy", label: "Privacy" },
  { href: "/terms", label: "Terms" },
];

// The line across the bottom of the site's pages. It's as tall as the
// account row at the bottom of the planner's side panel, so the two match.
// The copyright and the Privacy and Terms pages are on the left; the
// contact links sit at the far right, styled like the side panel's buttons,
// each with a small label that shows when pointed at.
export function SiteFooter() {
  return (
    <footer style={{ height: PANEL_HEADER_HEIGHT + 1 }} className="border-t border-zinc-200 dark:border-zinc-800">
      <div className="mx-auto flex h-full max-w-5xl items-center px-4 text-sm text-zinc-500">
        © 2026 Charticulum
        {PAGES.map(({ href, label }) => (
          // Fragment: groups the dot and the link without adding a box
          // around them, so they line up with the text like plain words.
          <Fragment key={href}>
            <span aria-hidden className="px-2">
              ·
            </span>
            <Link href={href} className="hover:text-zinc-800 dark:hover:text-zinc-200">
              {label}
            </Link>
          </Fragment>
        ))}
        {/* ml-auto: take up all the spare room on the left, pushing the
            links to the right end. */}
        <div className="ml-auto flex gap-1">
          {LINKS.map(({ href, label, icon }) => (
            <a
              key={href}
              href={href}
              // The icon has no words, so aria-label is what screen readers
              // say, and data-tooltip is the label shown when it's pointed
              // at (see Tooltips.tsx).
              aria-label={label}
              data-tooltip={label}
              // A new tab for GitHub; mailto opens the email app instead.
              target={href.startsWith("http") ? "_blank" : undefined}
              rel={href.startsWith("http") ? "noreferrer" : undefined}
              className={HEADER_BUTTON}
              style={{ width: TOGGLE_SIZE, height: TOGGLE_SIZE }}
            >
              {icon}
            </a>
          ))}
        </div>
      </div>
    </footer>
  );
}
