# Filter-bar `/en/` locale — checkpoint

## Status
- **S156:** labels localized (Type/Price/Sort/Date, options, Free entry/Ticketed, Clear/Reset/Close).
- **S157:** chip **behavior** shipped — **type + price filter IN-PAGE** on `/en/` (client-side, compose, narrow, empty-state, live count); **date NAVIGATES** to `/en/{time}/` hubs (re-pointed from bare-root Greek combos). EL unchanged (combo navigation). Also S157: EN hub **H1 + date-group headers + "Related Pages" heading** localized.

## How it works (S157)
- `.event-card` root carries `data-type` + `data-price-type` (page.ts). `.filter-bar` carries `data-locale`; `.filter-result-count` carries `data-events-word`.
- On `/en/`, type/price panel options get `data-filter-dim`/`data-filter-value`; the script (`renderFilterBarScript`, guarded `document.documentElement.lang === 'en'`) intercepts clicks → composes `(type AND price)` over `.event-card`s, updates count, toggles `.filter-empty-state`, hides empty date-groups. Date options re-point to `/en/{time}/` (today/tomorrow omitted on `/en/` when count<3 to avoid the inventory 404).
- Date stays navigation because in-page date can only *narrow* a hub's rendered window (broader windows aren't in the DOM) + needs client-side TZ/window math.

## Remaining `/en/` leaks (NOT yet fixed — next locale pass)
1. **Related-Pages LINKS** (`renderRelatedPages`, page.ts ~353): the section *heading* is localized (S157), but its **links are still Greek labels + bare-root Greek-combo URLs** (`/open-${type}`, `/this-week`, "Όλες οι …", "Ελεύθερη είσοδος …"). Same combo-leak class as the old filter chips — can't be cleanly `/en/`-fied (no `/en/` combos). Defer with the combo work. (Interim: English "Related Pages" heading over Greek links — mildly incoherent; flagged.)
2. **Search overlay** (`search-overlay.ts`, `search-clear-btn` aria `Καθαρισμός`) — the 5th locale-unaware surface. Still Greek on `/en/`.
3. **Live mobile click-test pending:** S157 verified markup + script-parse + logic; the actual in-page filter interaction was NOT browser-tested (no headless browser in the build env). Confirm on the live `/en/` site (mobile): Type→Concerts narrows, +Price composes, toggle clears, count/empty-state update.

## Owner: Dev, post-demo (related-page links + search overlay = next locale pass).
