# DESIGN.md

How Charticulum looks, and the rules that keep it looking like one app.
Follow these when building or changing anything on screen, and update this
file when a design decision changes.

The overall feel: quiet, soft, and consistent. The chart is the star, so
the UI around it stays neutral (greys, white boxes, thin borders) and saves
color for things that mean something (seasons, requisite lines, problems).

## Colors

### Surfaces and text

Light mode avoids pure white pages and pure black text (they felt harsh).
The custom colors live in `src/app/globals.css` under `@theme`, which
turns each into Tailwind classes (`bg-page`, `text-ink`, ...):

| Token | Light | Used for |
| --- | --- | --- |
| `page` | `#f8fafd` | the page behind everything |
| `band` | `#f0f4f9` | every other term column on the chart |
| `line` | `#c4c7c5` | dividers and card outlines |
| `ink` | `#1f1f1f` | main text (near-black, not black) |

Dark mode uses Tailwind's zinc greys: page `zinc-950` (`#09090b`), boxes
`zinc-900`, borders `zinc-800`, text `zinc-100`. Shaded columns are
`white/5`.

- **Boxes** (panels on the chart, menus, popups, cards): `bg-white`, dark
  `bg-zinc-900`.
- **Borders**: `zinc-200` (dark `zinc-800`) for boxes and dividers;
  `zinc-300` (dark `zinc-700`) for form fields and secondary buttons.
- **Secondary text** (hints, labels, dates, the copyright): `zinc-500`.
- **Panel headings**: `text-xs font-semibold uppercase tracking-wide
  text-zinc-500` (dark `zinc-400`).

### Meaning colors

Color always means something; never use it just for decoration.

- **Sky blue** is the accent: primary buttons (`sky-600`, hover `sky-700`),
  the selected tab's underline, the selected card's ring (`sky-500`), focus
  outlines (`sky-500`), the account circle, and "info" tags.
- **Rose (red)** means a problem or a destructive action: broken requisite
  arrows (`#e11d48`), the issue count on a card, credits over a limit,
  Delete/Remove buttons and the trash icon, "bad" tags.
- **Emerald (green)** means good: "good" tags (e.g. Issues at 0).
- **Seasons** each have a tint, shared by term titles, single-season course
  cards, and season tags (`SEASON_TINT` in `src/components/ui.tsx`):

  | Season | Light | Dark |
  | --- | --- | --- |
  | Fall | orange-100 | deep orange `#4f2a08` |
  | Winter | baby blue, sky-100 | sky-950 |
  | Spring | green, emerald-100 | emerald-950 |
  | Summer | baby yellow `#fff5ba` | deep yellow `#4a3f05` (stock dark yellows look brown) |

  Dark shades are picked to be about equally dark, so no season stands out.
- **Pre-Credit** column: a light sky wash (`sky-50`, dark `sky-950/40`).
- **Requisite lines**: one color per course that others depend on, from
  `COURSE_COLORS` in `src/planner/layout.ts` (blue, teal, violet, amber,
  green, cyan, ochre). Red is deliberately left out of that list: a red
  line only ever means "out of order".

### Light and dark mode

Every element needs a `dark:` style. The page follows the system setting
until the person picks one with the moon/sun button, which is then
remembered in that browser. The theme is set before the page draws, so a
dark page never flashes white.

## Shape and depth

- **Corners**: `rounded-md` on boxes, buttons, cards, inputs, menus, and
  tooltips; `rounded` (smaller) on tags; `rounded-full` on the account
  circle and the card issue badge.
- **Shadows**: `shadow-sm` on things resting on the chart (cards, button
  groups, chart boxes, the floating sidebar button); `shadow-md` on things
  that pop up (account menu, tooltips); `shadow-lg` on right-click menus.
- **Borders** are 1px; course cards have a 2px border (in the course's line
  color when it has dependents). External (Pre-Credit) cards have a dashed
  border.
- **Scrollbars** are thin and see-through grey everywhere, with an
  invisible track (`globals.css`), instead of each browser's wide default.

## Type

- The browser's sans-serif font, at small sizes: `text-sm` for most UI,
  `text-xs` for secondary text, tags, and panel headings.
- Course codes on chart cards are `font-mono font-semibold` ("CS 101");
  in the Selected box the code is the regular font, bold.
- Tags are title case ("4 Credits"); `Badge` does this itself.
- The wordmark: "Charticulum" (`text-base font-semibold`) above the slogan
  "Chart your curriculum" (`text-xs text-zinc-500`, never wrapping).

## Sizes and alignment

- **The 30px row**: chart button groups, header buttons (sidebar toggle,
  theme, dashboard link, footer icons), and the chart name box are all
  30px tall (`TOGGLE_SIZE`). Things meant to line up share this.
- **The 61px band**: the sidebar's header, the sidebar's account row, and
  the site footer are all `PANEL_HEADER_HEIGHT + 1` tall (15px inset, 30px
  button, 15px inset, plus a 1px border). The site's top bar is 56px
  (`h-14`).
- **15px inset** from the chart's edges for everything floating on it
  (matches React Flow's panel margin), and the sidebar button sits at the
  same spot whether the sidebar is open or shut.
- **8px gap** between the boxes on the chart's top right.
- Sidebar width: 250–560px; dragging it under 160px closes it.
- Site pages are centered at `max-w-5xl` with a 16px side gutter
  (`px-4`).

## Components

Reuse these instead of restyling by hand; they live in
`src/components/ui.tsx` unless noted.

- **`Button`**: `primary` (sky, white text) for the one main action;
  `secondary` (white with a border) for most; `ghost` (no border) for
  quiet ones; `danger` (rose text) for deleting.
- **`Select`, `inputClass`**: form fields with the same border and
  padding. `compact` shrinks a select to a tag's height.
- **`Badge`**: the small tag. Tones: neutral, bad, good, info, or a season.
  `square` for a single digit or icon.
- **`Panel`**: a section with an uppercase heading and a divider below.
- **`Tabs`**: tabs with a sky underline on the chosen one.
- **`HEADER_BUTTON`** (`SidePanel.tsx`): the look of square icon buttons:
  grey icon, light grey background on hover.
- **Chart button groups** (`controlGroup` in `ChartFlow.tsx`): a white
  box with dividers between icon buttons, e.g. undo | redo.
- **Popups** (account menu, tooltips): white box, `zinc-200` border,
  `rounded-md`, `shadow-md`; dark `zinc-900` with a `zinc-800` border.
  Menu items are `px-2 py-1.5 text-sm` with a `zinc-100` hover.

## Icons

All icons live in `src/components/icons.tsx` and are drawn the same way:
a 24-unit grid shown at 16px, 2-unit strokes, rounded ends and corners,
outline only (no fills), in the text color. Add new ones there; never
draw an icon inline or use an icon font. Brand icons (GitHub) are traced
as outlines too, so they match.

Controls are icon-only where the icon is clear (undo/redo, zoom, sidebar,
theme, trash, footer links). Every icon-only control has an `aria-label`
and a tooltip.

## Hover labels (tooltips)

- Write `data-tooltip="..."` on the element, never `title="..."`.
  `src/components/Tooltips.tsx` (mounted once in the root layout) draws
  every one in the popup style above, so they all match.
- They appear after 300ms of pointing (straight away with Tab), below the
  element or above it near the window's bottom, and slide to stay on
  screen. A `\n` starts a new line.
- They hide on click, drag, scroll, or Escape, and don't show on touch.

## Hover, focus, and disabled

- Hover: a light grey background (`zinc-100`, dark `zinc-800`) on
  buttons and menu items; colored buttons go one shade darker. Tinted
  chips (like the add-term choices) use `brightness-95` (dark
  `brightness-125`).
- Focus: a 2px `sky-500` outline, only for keyboard focus
  (`focus-visible`).
- Disabled: faded (`opacity-35` to `50`) with a not-allowed cursor; a
  disabled choice still says why in its tooltip.

## Motion

Short and subtle: about 100–220ms (fades, the sidebar sliding shut,
arrowheads gliding around a card). Everything that moves respects
`prefers-reduced-motion`. Things that would be in the way while moving
(like tooltips) simply hide.

## The chart

- Terms are columns; every other column is shaded (`band`), and each
  term's title is tinted with its season.
- Cards are white (or their season's tint if offered in only one season),
  with the course code on top and the name below. Zoomed out, a card
  shows just the code.
- Arrows are straight lines in the course's color, solid for
  prerequisites and dashed for courses taken together; red and thicker
  when out of order.
- When a course is traced, everything unrelated fades to 25%.
- Floating on the chart: undo/redo and the plan's name top left; Selected,
  Issues, and Requirements top right as separate boxes of the same width.

## Site pages

The dashboard, Schools, and Account pages share a top bar (wordmark,
links, theme button, account circle) and a footer (© 2026 Charticulum,
with email and GitHub icons at the right end). The planner has neither
and fills the window; its sidebar carries the wordmark at the top and
the account at the bottom instead.
