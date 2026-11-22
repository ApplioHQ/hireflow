# Applio admin console: 5 proposed improvements

Scope: `admin.html` + its backing endpoints in `worker/worker.js`. This is a plan, not an
implementation — each item below is a candidate task for `agent_state/tasks.md`.

## 1. No UI for the per-user lookup/delete the backend already supports

`worker/worker.js:161-162` exposes `adminListUsers` (`/admin/users`) and `adminDeleteUser`
(`/admin/users/delete`), and `admin.html` does call `/admin/users` into `ALL_USERS`
(`admin.html:553-557`). But `renderUsers()` (`admin.html:988-992`) only ever writes a
single aggregate line — `"N total accounts · everything free"` — into `#user-summary`.
There is no table, no search box, and no delete button anywhere in the DOM, so
`adminDeleteUser` is dead code from the UI's perspective: the only way to use it today is
a raw `curl`/fetch call with the admin's bearer token.

This matters because the "Users & Feedback" band's own subtitle promises "Aggregate only
— individual emails stay private" as a *design choice*, but there's currently no admin
path at all for the legitimate case (a user asks to be deleted, GDPR-style, or an abusive
account needs removal) short of hand-rolling a request.

Fix: add a minimal per-user row list (masked email via the existing `_maskEmail()`
helper, signup date, plan, last-active) with a search-by-masked-pattern or
account-id field, and a delete action gated behind `confirmDialog` (same pattern already
used in `setAdminAccessFromPanel`), wired to the existing `/admin/users/delete` endpoint.

## 2. Feedback and testimonials render unbounded, with no pagination

`loadFeedback()` (`admin.html:1086-1095`) pulls the *entire* result of `/feedback/list`
into `ALL_FEEDBACK` and `renderFeedback()` (`admin.html:1097-1126`) builds one DOM node
per item with no limit; `renderTestimonials()` (`admin.html:853-880`) does the same for
`/admin/testimonials`. Both lists only grow over time and neither the client nor (as far
as the admin UI can tell) the `/feedback/list` and `/admin/testimonials` endpoints apply
a limit/cursor.

This matters because the admin page already does a full `Promise.allSettled` refresh of
every panel on load and on every manual refresh (`admin.html:558`) — as feedback volume
grows this turns into a progressively larger JSON payload and DOM render on every single
refresh, including ones that just want to check the `/status` toggles.

Fix: add a `limit`/`cursor` param to both endpoints and paginate (or at least cap to the
most recent N with a "load more"), matching the existing 10-row cap already used for
`_renderHBars`.

## 3. Destructive admin actions are confirmed inconsistently

`setMaint()` and `setAdminAccessFromPanel(false)` both gate on `confirmDialog(...)`
before calling their endpoint (`admin.html:1026-1035`, `admin.html:1010-1017`). `setAI()`
(`admin.html:1019-1024`) does not — it posts straight to `/admin/ai-disable` as soon as
the minutes field is non-empty, even though the same control allows disabling AI for up
to `10080` minutes (one week, per the `max` on `#ai-mins`, `admin.html:412`) for every
user on the product.

This matters because "disable AI for a week" is at least as disruptive as "take the site
offline for a week" or "disable the ADMIN tier" — both of which already require a
confirmation click — so the asymmetry looks like an oversight rather than a deliberate
choice, and it's the one of the three missing a safety net.

Fix: wrap the non-zero-minutes branch of `setAI()` in the same `confirmDialog` pattern
used by `setMaint()`, keeping the `setAI(0)` re-enable path (and the 1-minute re-enable
reuses) unconfirmed since those are the "undo" actions.

## 4. No audit trail for who flipped a system control, or when

`adminSetAIDisabled`, `adminSetMaintenance`, and `adminSetAdminAccess`
(`worker/worker.js:1291-1318`) write directly to a handful of flat KV keys
(`system:ai_disabled_until`, `system:maintenance_until`, admin-access flag) with no
record of which admin made the change. `renderStatus()` (`admin.html:995-1008`) can show
*that* AI is disabled and *until when*, but never *who* disabled it. Since the UI
supports both `admin` and `super` roles and nothing stops a workspace from having more
than one admin account, there's no way after the fact to tell which admin took the site
offline or disabled AI, or to see a history of these toggles.

This matters most for the highest-blast-radius actions on the page — taking the entire
product offline or disabling AI for every user — where "who did this and when" is exactly
the information you want during an incident retro.

Fix: append a small audit record (actor email/role, action, params, timestamp) to a KV
list or log on each of the three `admin*Set*` handlers, and surface the last few entries
in the existing "System Status" card (`admin.html:404-407`).

## 5. All time windows are hardcoded; there's no custom date range

Every chart and KPI on the page uses a fixed window baked into the backend response —
"Last 30 days" labels on the signups chart and daily breakdown
(`admin.html:252-253`, `admin.html:297-301`), "Last 7 days" on page views and feature
usage (`admin.html:256-257`, `admin.html:330-337`), `last7Signups`/`last30Signups` fields
consumed directly in `renderHeroCards()` (`admin.html:614-628`). There's a `.period-sel`
/ `.period-btn` CSS component already defined in the stylesheet (`admin.html:172-177`)
but it is never instantiated anywhere in the markup or JS — it looks like a dropped
feature rather than an oversight in styling alone.

This matters because diagnosing "what happened around the Oct 12 traffic spike" or
comparing two arbitrary weeks is impossible today without editing the KV/analytics
query by hand; the admin can only ever see the last 7 or 30 days relative to *now*.

Fix: either wire up the existing `.period-sel` component to let `/admin/analytics` accept
a `from`/`to` or `days` query param and re-render on change, or remove the unused CSS if
a date picker isn't planned, so the stylesheet doesn't advertise a control that doesn't
exist.
