# Changelog

## 6.0.0-step1 (backend only; real API NOT verified)
- Charter724 mapping filled from the official OpenAPI file (docs/charter724-openapi.json).
- Two-step JWT login, token lifetime from expires_Utc, one re-login on 401.
- Provider error codes mapped to readable errors (providerCode kept).
- New GET /api/airports. Flight search: one-way and round trip, cabin filter, real adult/child/infant prices, rial -> toman, stable flight ids, providerRef kept for a future booking step.
- "Today" for date checks uses Asia/Tehran.
- New tools/check-live.js (read-only check). New tests (85 in total) with documented mock responses.
- Frontend unchanged. Reservations, payments, tickets and refunds remain disabled.

## 5.0.0 (demo)
- Flights: one-way / round trip, return date validation, adults / children / infants with rules (at least 1 adult, infants <= adults, adults + children <= 9), cabin class.
- Results: sort by price, duration or departure time; non-stop filter; empty state.
- Example price factors per passenger type (child 0.75, infant 0.1, round trip x2). Demo values only, never airline fares.
- New demo service: refund request (accepts only a reference that exists in this session's demo bookings; moves no money).
- New tests: tests/test_v5.js (logic) and tests/ui_smoke.js (browser, optional, needs puppeteer). `npm test` runs the Node suites.
- Unchanged: demo-only wallet, Snapp demo provider, CSP, no innerHTML, three languages.

## Not in 5.0.0
Next.js, backend, database, real authentication, admin dashboard, hotel detail pages with images/maps, seat selection, internet packages.
