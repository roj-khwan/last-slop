# Copilot Build Guide — Butter & Bloom Pâtisserie QR Ordering

> **How to use this file:** Put it in the repo root (or copy it to `.github/copilot-instructions.md`) so Copilot always has it as context. Then work through **Section 9 — Build prompts** in order, one prompt at a time in Copilot Chat (Agent/Edit mode). The database is created by hand in Supabase using `README.md` — Copilot must **not** create or migrate tables.

---

## 1. What we're building

A QR-code table-ordering web app for a pastry shop ("Butter & Bloom Pâtisserie"). Staff open a table and get a QR code. The customer scans it, browses the menu, manages a cart, sends orders to the kitchen, and views an itemized bill. Kitchen staff see incoming orders live.

Six routes:

| Route | Audience | Summary |
|---|---|---|
| `/` | Anyone | Shop name + links to `/generate-qr` and `/kitchen` |
| `/generate-qr` | Front staff | Open a table, show QR, force-close stuck sessions |
| `/order/[token]` | Customer | Menu browsing with category tabs |
| `/cart/[token]` | Customer | Cart review/edit, send order to kitchen |
| `/bill/[token]` | Customer | Itemized bill, request bill (closes session) |
| `/kitchen` | Kitchen | Live order board |

## 2. Hard rules for Copilot

1. **Next.js latest, App Router, plain JavaScript** (`.js`, no TypeScript). Every page that uses hooks/state/browser APIs starts with `"use client"`.
2. **Dependencies allowed:** `next`, `react`, `react-dom`, `@supabase/supabase-js`. Nothing else (no Tailwind, no UI kits, no state libraries, no QR library).
3. **Dynamic route params are a Promise.** In `[token]` pages always do:
   ```js
   import { use } from "react";
   const { token } = use(params);
   ```
   Never write `const { token } = params`.
4. **Env vars only:** `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`. Never hardcode keys. Never use a `service_role` key. Commit `.env.example` (placeholders), never `.env.local`.
5. **Do not create tables, run migrations, or edit SQL.** Schema is fixed (Section 3).
6. **Customer URLs use the session token (UUID), never the raw table number.** Staff pages (`/generate-qr`, `/kitchen`) may show table numbers.
7. **Styling:** one `app/globals.css`, mobile-first, warm pastry palette (cream background, rose/pink accent, dark brown text). Large touch targets (min 44px). Kitchen and staff pages use big, high-contrast text.
8. **Money:** Supabase returns `numeric` as strings — wrap with `Number()`. Display with a helper `formatBaht(n)` → `฿1,234` (use `Intl.NumberFormat("th-TH")`, no decimals unless needed).
9. **Handle errors visibly:** every Supabase call checks `error` and shows a friendly message; show loading states; never leave a blank screen.
10. Keep code simple and commented briefly. No premature abstractions.

## 3. Data model (already exists in Supabase)

**`sessions`**
| Column | Type | Notes |
|---|---|---|
| id | bigint PK | |
| table_number | int | |
| token | uuid unique | random per session; used in customer URLs |
| status | text | `'open'` \| `'closed'` |
| total_amount | numeric | set when closed |
| created_at | timestamptz | |
| closed_at | timestamptz | set when closed |

A **partial unique index** guarantees only one `open` session per `table_number`. Inserting a second one fails with Postgres error code `23505` — handle it gracefully (treat as "table already open").

**`menu_categories`**: `id`, `name`, `sort_order`

**`menu_items`**: `id`, `category_id`, `name`, `price` (numeric), `is_available` (boolean)

**`orders`**
| Column | Type | Notes |
|---|---|---|
| id | bigint PK | |
| session_id | bigint FK → sessions.id | |
| table_number | int | |
| items | jsonb | snapshot: `[{ "item_id": 1, "name": "Velvet Moon Slice", "price": 120, "quantity": 2 }]` |
| status | text | `'received'` → `'preparing'` → `'served'` |
| created_at | timestamptz | |

`orders` has Realtime enabled.

## 4. File structure

```
app/
  layout.js               // html shell, imports globals.css, metadata title
  globals.css
  page.js                 // home
  generate-qr/page.js
  order/[token]/page.js
  cart/[token]/page.js
  bill/[token]/page.js
  kitchen/page.js
components/
  CustomerHeader.js       // shop name, "Table N", nav links: Menu / Cart (count) / Bill
  SessionGate.js          // loads session by token, renders status screens or children
  ConfirmDialog.js        // reusable modal (title, body, cancel + confirm buttons)
lib/
  supabaseClient.js       // createClient from env vars
  cart.js                 // localStorage cart helpers
  format.js               // formatBaht, minutesSince
.env.example
.gitignore                // node_modules, .next, .env.local
```

## 5. Shared behavior

### 5.1 Session guard (used by every customer page)
`SessionGate` takes `token` and fetches the session **by token regardless of status**, then:
- No row found (or token isn't a valid UUID) → full-screen "**Invalid link.** Please ask staff for a new QR code."
- `status === 'closed'` → full-screen "**Thank you for visiting Butter & Bloom!** This table has been closed." (show `total_amount` if present)
- `status === 'open'` → render children, passing `session` (id, table_number, token) down (render-prop or context).

Validate the UUID format with a regex before querying, to avoid a Postgres cast error.

### 5.2 Cart storage (`lib/cart.js`)
- Cart lives in `localStorage` under the key `cart:<token>` (so carts are per session and disappear with it).
- Shape: `[{ item_id, name, price, quantity }]`.
- Exports: `getCart(token)`, `addToCart(token, item, qty=1)`, `setQuantity(token, item_id, qty)`, `removeFromCart(token, item_id)`, `clearCart(token)`, `cartCount(cart)`, `cartTotal(cart)`.
- Quantity per line clamps to **1–10**. Adding an item already in the cart increases its quantity (still capped at 10).
- Dispatch a `window` custom event `cart-updated` on every change; `CustomerHeader` and the floating cart bar listen for it (and `storage`) to stay in sync.
- Wrap `localStorage` access in try/catch and guard against SSR (`typeof window`).

### 5.3 Customer navigation
`CustomerHeader` on all customer pages: shop name, "Table N", and links **Menu** → `/order/<token>`, **Cart (n)** → `/cart/<token>`, **Bill** → `/bill/<token>`.

## 6. Page specs

### 6.1 `/` (home)
Shop name "Butter & Bloom Pâtisserie", a short tagline, and two large links: **Open a table** → `/generate-qr`, **Kitchen display** → `/kitchen`.

### 6.2 `/generate-qr` (staff)
1. Form: **Table number** (positive integer, required). Button **Open table**.
2. On submit:
   - Look for `sessions` where `table_number = N` **and** `status = 'open'`.
   - **If found** → show a prominent warning box (red/orange): "This table already has an open order. Please close it first." with a **Close old order** button. Do not create a new session.
   - **If not found** → insert `{ table_number }` and read back the row (`.select().single()`) to get the generated `token`. If the insert fails with code `23505`, treat it as the "already open" case above.
3. **Close old order** opens a `ConfirmDialog` showing: table number, "Open for N minutes" (from `created_at`), number of orders placed, running total (sum of `price × quantity` across that session's orders). Buttons **Cancel** (back to the warning) and **Confirm close**.
   - Confirm → `update sessions set status='closed', closed_at=now(), total_amount=<running total> where id=<id> and status='open'` (the `status='open'` filter prevents double-closing).
   - On success: close dialog, remove warning, return to the form **with the entered table number still filled in**. Do **not** auto-open a new session — staff press **Open table** again.
4. **Success view** after opening: QR image (`<img>`) from
   `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(url)}`
   where `url = window.location.origin + "/order/" + token`. Below it: "Table 7", the full URL as text, a **Copy link** button (`navigator.clipboard`, with "Copied!" feedback), and **Open another table** (resets the form).
5. Big text, simple layout — staff use this quickly.

### 6.3 `/order/[token]` (customer menu)
Wrapped in `SessionGate` + `CustomerHeader`.
- Fetch `menu_categories` (ordered by `sort_order`) and `menu_items` where `is_available = true`.
- Category **tabs** (horizontally scrollable on mobile). Selecting a tab shows that category's items.
- Each item card: name, price (`formatBaht`), and an **Add** button (adds 1 to the cart; card briefly shows the current quantity in cart, e.g. "In cart: 2").
- **Floating bottom bar** (fixed): "View cart · N items · ฿total", linking to `/cart/<token>`. Hidden when the cart is empty.
- If the URL has `?sent=1`, show a dismissible green banner "Order sent to the kitchen! 🧁".

### 6.4 `/cart/[token]` (customer cart)
Wrapped in `SessionGate` + `CustomerHeader`.
- List cart lines: name, unit price, quantity stepper (− / +, 1–10), line total, and a remove (✕) button.
- Show **Subtotal** (sum of line totals) and a note "Prices in THB. Your final bill is on the Bill page."
- Empty cart → friendly empty state with a **Back to menu** button.
- **Send to kitchen** button (disabled if empty or while submitting):
  1. Re-check the session is still `open` (fetch by id).
  2. Re-fetch current `price`/`is_available` for the cart's item ids. If any item is now unavailable, remove it from the cart, show a message, and stop. If prices changed, update the cart prices and show a message asking the customer to review, then stop.
  3. Insert **one** row into `orders`: `{ session_id, table_number, items: [{item_id, name, price, quantity}], status: 'received' }`.
  4. On success: `clearCart(token)` and navigate to `/order/<token>?sent=1` (`useRouter().push`).
- Prevent double-submit (disable button while the request is in flight).

### 6.5 `/bill/[token]` (customer bill)
Wrapped in `SessionGate` + `CustomerHeader`.
- Fetch all `orders` for this session, ordered by `created_at`.
- **Itemized bill table:** aggregate all items across orders by `item_id` **and** `price` → columns: Item, Qty, Unit price, Line total. Then a bold **Grand total**.
- **Your orders** section: each order with time, its items, and a status pill (Received / Preparing / Served).
- No orders yet → "You haven't ordered anything yet" and the request button is disabled.
- **Request bill** button → `ConfirmDialog` ("Close this table and request your bill? You won't be able to order more.") showing the grand total.
  - Confirm → `update sessions set status='closed', closed_at=now(), total_amount=<grand total> where id=<id> and status='open'`.
  - Then show a full-screen thank-you: "Thank you! Please pay **฿X** at the counter."
- Note under the total: "Payment is made at the counter."

### 6.6 `/kitchen` (staff)
- On load, fetch `orders` with `status in ('received','preparing')`, oldest first.
- Subscribe with Supabase Realtime to `postgres_changes` on `public.orders` for **INSERT** and **UPDATE**; update local state accordingly (add new, update changed, drop `served`). Unsubscribe on unmount (`supabase.removeChannel`).
- Responsive grid of large cards: **Table number** (huge), time ordered (and "x min ago"), each item as `2 × Velvet Moon Slice`.
- Buttons: **Start preparing** (`received` → `preparing`, card turns amber) and **Served** (→ `served`, card disappears immediately).
- Big fonts, high contrast, readable from a distance. Empty state: "No active orders 🎂".

## 7. Acceptance criteria (summary)

- Opening a table creates a session with a random token; QR points to `/order/<token>`.
- No customer URL ever contains the raw table number.
- Cart persists across `/order` ↔ `/cart` navigation and survives refresh, per session.
- Sending an order inserts exactly one `orders` row with a price snapshot; kitchen shows it live.
- Bill totals equal the sum of `price × quantity` across all the session's orders.
- Closing (by staff or by customer bill request) makes the token show the thank-you screen.
- Re-opening the same table yields a **different** token; the old link no longer works.
- Full manual test list is in `README.md` → *Test checklist*.

## 8. Style notes

- Palette: cream `#FFF8F0`, blush pink `#F4A6B8`, deep rose `#C2185B`, cocoa text `#4A2C2A`, amber `#F2A93B` for "preparing", green `#4CAF50` for success.
- Rounded corners (12–16px), soft shadows, system font stack.
- Buttons: full-width on mobile for primary actions.

## 9. Build prompts (paste one at a time, in order)

**Prompt 1 — Scaffold**
```text
Read COPILOT_BUILD_GUIDE.md fully; it is the spec for this whole project and its rules apply to everything you write.
Create the Next.js project skeleton (App Router, JavaScript): package.json with next, react, react-dom, @supabase/supabase-js and scripts dev/build/start; next.config.js; .gitignore (node_modules, .next, .env.local); .env.example with NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY placeholders; lib/supabaseClient.js; lib/format.js (formatBaht, minutesSince); app/layout.js; app/globals.css (palette + base styles from Section 8); app/page.js as described in 6.1. Do not touch README.md.
```

**Prompt 2 — Shared pieces**
```text
Following Sections 5 and 4 of COPILOT_BUILD_GUIDE.md, create lib/cart.js, components/ConfirmDialog.js, components/SessionGate.js and components/CustomerHeader.js. SessionGate must use the status screens from 5.1 and validate the token as a UUID before querying. Remember params are handled in pages, not here.
```

**Prompt 3 — Staff QR page**
```text
Implement app/generate-qr/page.js exactly as specified in Section 6.2 of COPILOT_BUILD_GUIDE.md, including the "Close old order" warning + confirm dialog flow, handling of Postgres error 23505, and keeping the table number in the form after closing.
```

**Prompt 4 — Menu page**
```text
Implement app/order/[token]/page.js as specified in 6.3. Use `import { use } from "react"` and `const { token } = use(params)`. Wrap the content in SessionGate and CustomerHeader, use lib/cart.js for the cart, and add the floating cart bar and the ?sent=1 banner.
```

**Prompt 5 — Cart page**
```text
Implement app/cart/[token]/page.js as specified in 6.4, using use(params) for the token. Include the re-validation steps before inserting the order, double-submit protection, and redirect to /order/<token>?sent=1 on success.
```

**Prompt 6 — Bill page**
```text
Implement app/bill/[token]/page.js as specified in 6.5, using use(params). Aggregate items by item_id and price, show the orders list with status pills, and implement the request-bill confirm dialog, session close update, and thank-you screen.
```

**Prompt 7 — Kitchen page**
```text
Implement app/kitchen/page.js as specified in 6.6 with Supabase Realtime (INSERT and UPDATE on public.orders), cleanup on unmount, and large readable cards.
```

**Prompt 8 — Review pass**
```text
Review the whole project against COPILOT_BUILD_GUIDE.md Sections 2 and 7. Check: no raw table numbers in customer URLs, use(params) everywhere for [token] pages, no hardcoded keys, all Supabase errors handled, no unused imports, `npm run build` passes. List any deviations and fix them.
```

After Prompt 8, follow `README.md` (Supabase setup → env vars → deploy → test checklist).
