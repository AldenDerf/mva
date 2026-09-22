# Project Guidelines & Git Commit Rules

## Automatic Commits on Features / Updates

* **Automatic Commits**: Every time a feature, update, bug fix, or task is completed and verified, commit the changes to Git immediately.
* **Commit Messages**: Use clear, concise conventional commit messages such as `feat: ...`, `fix: ...`, `chore: ...`, `refactor: ...`, or `docs: ...`.
* **Push to GitHub**: Do not automatically push changes to GitHub. Push only when explicitly requested by the user.
* **Security**: Never commit secrets, credentials, API keys, passwords, or environment files such as `.env` or `.env.local`.

---

# MVA — Mahatao Volleyball Association

## Project Overview

This project is the web platform for the **Mahatao Volleyball Association (MVA)**.

The initial version will focus on public team registration. The platform may later expand to include:

* League management
* Team management
* Player management
* Rosters
* Payments
* Match schedules
* Results
* Standings
* Player statistics
* Team statistics

Build the system incrementally. Do not implement future modules unless explicitly requested.

---

# Technology Stack

Use the following stack unless explicitly instructed otherwise:

* Next.js 16+
* React 19+
* TypeScript
* Next.js App Router
* Tailwind CSS
* shadcn/ui
* PostgreSQL
* Supabase
* Prisma ORM
* pnpm

## Application Architecture

```text
Next.js
   ↓
Prisma
   ↓
PostgreSQL
   ↓
Supabase
```

Prisma should be the primary ORM/database access layer for the application.

Avoid unnecessarily mixing Prisma database access with Supabase database clients or raw SQL.

Supabase may still be used for services such as:

* PostgreSQL hosting
* Authentication
* Storage
* Other Supabase services when appropriate

---

# DATABASE — CRITICAL

The MVA PostgreSQL database has **already been created and tested in Supabase**.

The existing Supabase database is the **source of truth**.

## DO NOT

* Recreate the database
* Drop existing tables
* Reset the database
* Replace the existing schema
* Run destructive migrations
* Run `prisma db push` without explicit approval
* Modify the database structure without discussing the change first
* Delete existing test data without approval

The initial Prisma workflow is:

```text
Existing Supabase PostgreSQL
          ↓
    prisma db pull
          ↓
   prisma/schema.prisma
          ↓
     Prisma Client
          ↓
       Next.js
```

During initial setup, use:

```bash
pnpm prisma db pull
```

Do NOT use:

```bash
pnpm prisma db push
```

or:

```bash
pnpm prisma migrate reset
```

---

# EXISTING DATABASE

The current database contains these seven core tables:

```text
leagues
league_categories
teams
players
registrations
registration_players
payments
```

## Relationships

```text
LEAGUES
   │
   └── LEAGUE_CATEGORIES
            │
            └── REGISTRATIONS
                    ├── TEAM
                    ├── REGISTRATION_PLAYERS
                    │       └── PLAYER
                    │
                    └── PAYMENTS
```

The database already contains:

* PostgreSQL enums
* UUID primary keys
* Foreign keys
* Composite league/category integrity
* Unique constraints
* Indexes
* `updated_at` triggers
* Registration codes
* Development test data

Do not recreate these structures.

---

# DOMAIN RULES

These rules are fundamental to the MVA data model.

## League Is Not the Same as Year

MVA may organize multiple leagues in the same calendar year.

For example:

```text
2026
├── MVA Summer League
├── MVA Fiesta League
└── MVA Christmas League
```

Therefore:

**League ≠ Year/Season**

The `year` field on `leagues` is metadata only.

Never assume one league per year.

---

# LEAGUE CATEGORIES

Categories belong to a specific league.

Different leagues may have completely different categories.

Example:

```text
MVA Summer League 2026
├── Open
└── Mahatao Only

MVA Christmas League 2026
└── Open

MVA League 2027
├── Men's
└── Women's
```

Never hardcode categories in the frontend.

Categories must be retrieved dynamically from the selected league.

---

# TEAMS

A team exists independently of a league.

A team may:

* Participate in multiple leagues
* Skip leagues
* Return in a later league
* Have different rosters in different leagues

Team history should be derived from registrations.

Do NOT create fields such as:

```text
is_new_team
is_old_team
```

---

# PLAYERS

Players also exist independently of leagues.

A player may:

* Participate in multiple leagues
* Skip leagues
* Change teams
* Return in future leagues

Player identity should be reusable.

Player names are stored separately:

```text
first_name
middle_name
last_name
suffix
```

Do not use a single `full_name` field as the primary identity.

---

# REGISTRATIONS

A registration represents:

```text
Specific Team
+
Specific League
+
Specific Category
+
Specific Roster
```

A team can therefore have different registrations across different leagues.

The same team cannot register more than once in the same league/category.

---

# REGISTRANT VS CAPTAIN

The person submitting the registration is **not necessarily the captain**.

The registrant may be:

* Team leader
* Captain
* Team member
* Authorized representative

Therefore:

```text
registrant ≠ captain
```

Keep registrant information separate from roster information.

---

# CAPTAIN

Captain status belongs to the registration roster.

The existing database uses:

```text
registration_players.is_captain
```

Do not add permanent captain information to `teams`.

A team may have a different captain in another league.

---

# PLAYER POSITION

Player position belongs to the registration roster:

```text
registration_players.position
```

Do not add a permanent position to `players` unless explicitly approved.

A player may have a different position in another league.

Positions should remain flexible rather than being unnecessarily restricted to a database enum.

Examples:

* Setter
* Outside Hitter
* Opposite
* Middle Blocker
* Libero
* Utility
* Other

---

# ROSTER RULES

Roster limits are defined per league category:

```text
min_players
max_players
```

The application must validate roster size against the selected category.

Do not assume that the current test data represents the final competition roster size.

---

# REGISTRATION STATUS

The existing registration statuses are:

```text
PENDING_PAYMENT
VERIFIED
REJECTED
CANCELLED
```

New public registrations should normally begin as:

```text
PENDING_PAYMENT
```

Do not automatically verify registrations without explicit business logic.

---

# PAYMENTS

Payments are separate records from registrations.

Payment methods:

```text
CASH
GCASH
BANK_TRANSFER
OTHER
```

Payment statuses:

```text
PENDING
VERIFIED
REJECTED
REFUNDED
```

Do not embed payment information directly inside the registration model.

---

# REGISTRATION CODE

Registrations have a user-facing registration reference.

Examples:

```text
MVA-2026-0001
MVA-2026-0002
```

Use the registration code when displaying or referencing a registration to users.

Do not expose internal UUIDs unnecessarily.

---

# PUBLIC REGISTRATION FLOW

The intended MVP flow is:

```text
Public Registration Page
        ↓
Select League
        ↓
Select Category
        ↓
Search Existing Team
        OR
Create New Team
        ↓
Enter Registrant Information
        ↓
Add Players
        ↓
Assign Jersey Numbers
        ↓
Assign Positions
        ↓
Select Captain
        ↓
Review Registration
        ↓
Submit
        ↓
PENDING_PAYMENT
```

If there is only one league currently open for registration, the UI may automatically select it.

Only leagues with:

```text
OPEN_FOR_REGISTRATION
```

should normally be available to the public registration form.

---

# MOBILE-FIRST REQUIREMENT

The public registration process should be designed primarily for mobile users.

Use:

* Responsive layouts
* Large touch targets
* Clear form labels
* Simple navigation
* Appropriate input types
* Clear validation messages
* Minimal unnecessary steps

---

# ACCESSIBILITY

Use accessible web practices:

* Semantic HTML
* Proper labels
* Keyboard navigation
* Accessible form controls
* Visible focus states
* Meaningful validation messages
* Appropriate ARIA attributes where necessary

---

# SECURITY

Never trust client-side input.

Important validation must happen on the server.

Validate:

* League
* Category
* Team
* Player information
* Roster size
* Registration status
* Payment information

Never expose:

* Database passwords
* API secrets
* Private keys
* Service-role keys
* Other credentials

Never hardcode secrets in source code.

---

# ENVIRONMENT VARIABLES

Use environment variables for credentials and connection strings.

Local secrets should be stored in:

```text
.env.local
```

Never commit:

```text
.env
.env.local
.env.*.local
```

or other files containing secrets.

---

# PRISMA SETUP

Use the Prisma version already installed in the project unless there is a specific reason to upgrade or downgrade.

Respect the existing Prisma configuration.

Before making Prisma configuration changes, inspect:

```text
prisma.config.ts
```

and:

```text
prisma/schema.prisma
```

The first database operation should be introspection:

```bash
pnpm prisma db pull
```

After introspection, verify:

* All seven tables exist as Prisma models
* Relationships are correct
* UUID fields are correct
* PostgreSQL enums are represented correctly
* Numeric/decimal fields are correct
* Timestamp fields are correct
* Unique constraints are preserved
* Composite foreign keys are preserved
* Registration code uniqueness is preserved

Do not modify the Supabase database simply to make Prisma happy.

If Prisma cannot represent something correctly, report the issue before changing the database.

---

# DO NOT BUILD YET

Unless explicitly requested, do not create additional database models or major modules for:

* Matches
* Match schedules
* Results
* Standings
* Player statistics
* Team statistics
* Referees
* Venues
* Tournaments
* Notifications
* Announcements
* Advanced roles
* Payment gateways

These belong to future phases.

---

# DATABASE CHANGE POLICY

If a requested feature appears to require a database change:

1. Explain why the change is needed.
2. Show the proposed database change.
3. Check it against the existing MVA domain model.
4. Ask for approval before applying structural or destructive changes.

Never silently redesign the database.

---

# DEVELOPMENT WORKFLOW

For every task:

1. Read this `GEMINI.md`.
2. Inspect the existing code before making changes.
3. Reuse existing components and patterns where appropriate.
4. Make the smallest reasonable change.
5. Test the change.
6. Check for TypeScript/build/lint errors.
7. Verify the feature works.
8. Commit verified changes using a conventional commit message.
9. Do not push to GitHub unless explicitly requested.

---

# CURRENT PRIORITY

The immediate task is:

```text
Next.js
+
Prisma
+
Existing Supabase PostgreSQL
```

First establish a reliable Prisma connection to the existing MVA database.

After successful Prisma introspection, verify the generated schema.

Do not begin major UI development until the database connection and Prisma representation have been verified.

---

# SUCCESS CRITERIA

The initial setup is complete when:

```text
[x] Next.js project runs
[x] Prisma is installed
[x] Supabase PostgreSQL connection works
[x] prisma db pull succeeds
[x] Seven MVA tables are represented in Prisma
[x] Relationships are correct
[x] Enums are correct
[x] UUIDs are correct
[x] Registration code is represented correctly
[x] No existing Supabase data was deleted
[x] No destructive database operation was performed
[x] Verified changes are committed to Git
```

## CHANGELOG POLICY

Maintain `CHANGELOG.md` as a concise human-readable history of meaningful project changes.

Update `CHANGELOG.md` when completing a significant:

- Feature
- Bug fix
- Architecture change
- Database change
- Security improvement
- User-facing improvement
- Major milestone

Do NOT add changelog entries for every minor code edit, refactor, formatting change, or typo fix.

Git commits remain the authoritative technical history of all code changes.

Use Git commits for detailed change tracking and `CHANGELOG.md` for important project milestones and user-facing changes.

When a meaningful task is completed and verified:

1. Update `CHANGELOG.md` if appropriate.
2. Commit the code and changelog together.
3. Use a clear conventional commit message.
4. Do not push to GitHub unless explicitly requested.


Maintain CHANGELOG.md for meaningful project updates. Git commits remain the detailed technical history. Update the changelog only for significant features, fixes, architecture changes, database changes, security improvements, or major milestones. Do not add entries for every minor code change.

# MVA UI/UX Design System

## Brand Identity

The Mahatao Volleyball Association website should visually reflect:

* Volleyball
* Mahatao
* Community
* Competition
* Energy
* Professionalism
* Local identity

The uploaded official MVA logo is the primary brand reference.

The visual identity is based primarily on:

* Deep athletic green
* Gold/yellow
* White
* Neutral dark text
* Soft neutral surfaces

Do not use the logo colors mechanically on every UI element. Maintain visual hierarchy and accessibility.

## Color System

Use these as the starting brand tokens:

* Primary Green: `#205823`
* Primary Gold: `#F5D025`
* Dark Gold: `#B99531`
* Background: `#FAFAF8`
* Surface: `#FFFFFF`
* Text: `#172019`
* Muted Text: `#5F6B61`
* Border: `#DDE3DE`

Colors may be adjusted when necessary to meet accessibility requirements.

Do not use gold/yellow as small body text on white backgrounds.

Do not use color alone to communicate status.

## Accessibility

Target WCAG 2.2 Level AA.

Prioritize:

* Text contrast
* Keyboard accessibility
* Visible focus states
* Accessible labels
* Semantic HTML
* Responsive reflow
* Accessible forms
* Clear validation messages
* Adequate interactive target sizes
* Screen-reader-friendly controls

Normal body text should target at least a 4.5:1 contrast ratio.

## Visual Style

The MVA website should feel:

* Modern
* Athletic
* Clean
* Professional
* Community-oriented
* Energetic without being flashy

Avoid:

* Excessive gradients
* Excessive glassmorphism
* Excessive shadows
* Excessive animations
* Overly decorative interfaces
* Generic SaaS aesthetics
* Excessive green/yellow combinations
* Cluttered layouts

The logo should remain the primary brand identifier.

## Layout

Use a strong visual hierarchy.

Prefer:

* generous whitespace
* clear sections
* readable typography
* consistent spacing
* restrained card usage
* clear primary actions
* mobile-first layouts

Do not turn every piece of content into a card.

## Navigation

Keep the primary navigation simple.

Suggested main navigation:

* Home
* Leagues
* Teams
* Players
* About

The primary CTA should be:

**Register Team**

On mobile, use a simple accessible navigation menu.

## Typography

Use a modern, highly readable sans-serif typeface such as Inter or Manrope.

Use stronger display typography only for major headings or sports branding.

Body text must prioritize readability over stylistic effects.

## Public Registration UX

The team registration experience is the first major user-facing feature.

Design it as a focused multi-step flow:

1. League & Category
2. Team Information
3. Players
4. Review & Submit

The registration process must be:

* Mobile-first
* Simple
* Clear
* Progressive
* Easy to recover from errors
* Accessible
* Fast to understand

Avoid presenting the entire registration process as one extremely long form on mobile.

## Components

Prefer a consistent design system using reusable components.

Before creating a new component, check whether an existing component can be reused.

Buttons, inputs, cards, badges, dialogs, tables, and navigation elements should have consistent visual behavior.

## Responsive Design

Design for mobile first.

Then progressively enhance for:

* tablet
* laptop
* desktop
* large desktop

The registration flow must remain comfortable on small phone screens.

## Motion

Use animation sparingly.

Animation should communicate:

* transition
* feedback
* state change
* hierarchy

Do not use animation simply for decoration.

Respect reduced-motion preferences.

## Brand Asset

The official MVA logo supplied by the project owner is the authoritative logo.

Do not recreate the logo using text, CSS, or a different generated graphic.

Use the official asset when available in the project.

---

## UI/UX Design Standard

### Design foundation

For all new UI work and UI refactoring in the MVA project, follow Google Material Design usability, interaction, accessibility, and responsive-design principles while preserving the existing MVA visual identity.

Material Design is a UX foundation.

DO NOT make the application look like a clone of Google, Gmail, Google Admin, or another Google product.

The MVA design system and branding remain the visual source of truth.

### Mobile-first

The MVA application must be designed mobile-first.

Many users and administrators may access the system primarily from smartphones.

Requirements:

- Start with small-screen usability before desktop enhancement.
- Avoid unnecessary horizontal scrolling.
- Important actions must be comfortably tappable.
- Prefer approximately 44–48px touch targets where practical.
- Do not place critical actions too close together.
- Layouts must work well around common mobile widths such as 360px, 390px, and 430px.
- Desktop layouts may become denser when additional screen space is available.

### Visual hierarchy

Every screen should make it obvious:

1. Where the user is.
2. What information is most important.
3. What requires attention.
4. What the primary next action is.

Do not give every piece of information equal visual weight.

For information-heavy admin screens, prioritize decision-making information first and progressively expose secondary details.

### Progressive disclosure

Avoid overwhelming users with all available information at once.

Show essential operational information first.

Secondary, historical, technical, or auditing information may be exposed through:

- detail views
- expandable sections
- dialogs
- tooltips/help text
- secondary actions

when appropriate.

### Human-readable language

Admin interfaces must be understandable to non-technical MVA officers.

Do not expose database terminology or implementation terminology as primary user-facing copy.

For example, avoid presenting:

"Legacy Unallocated Payment"

as the primary message.

Prefer something understandable such as:

"Payment needs review"

with supporting text such as:

"This registration has an older payment that isn't assigned to a specific player."

Technical terminology may still appear as secondary information when useful for auditing or troubleshooting.

### Interaction states

Interactive components must provide appropriate states where applicable:

- default
- hover
- focus
- active/pressed
- selected
- disabled
- loading
- success
- warning
- error

Never leave users wondering whether an action is processing.

### Loading experience

Use appropriate loading indicators, skeletons, Suspense boundaries, or route-level loading UI where they improve perceived performance.

Loading states should preserve enough layout context to reduce unnecessary visual shifting.

Do not add loading animations purely for decoration.

### Empty and error states

Empty states must explain:

- what is missing
- whether it is normal
- what the user can do next

Error messages should explain the problem in plain language and provide a recovery action whenever possible.

### Forms

Forms should:

- group related fields logically
- use clear labels
- minimize unnecessary fields
- provide understandable validation messages
- preserve entered information when recoverable errors occur
- make required vs optional fields clear
- place primary actions predictably

### Accessibility

Maintain:

- semantic HTML
- keyboard accessibility
- visible focus indicators
- accessible labels
- appropriate ARIA only where necessary
- sufficient contrast
- readable text sizes
- accessible form validation
- reasonable touch targets

Do not sacrifice accessibility for visual minimalism.

### MVA visual identity

Preserve the existing MVA visual language, including where appropriate:

- green / gold / neutral identity
- existing typography
- existing spacing conventions
- rounded surfaces
- existing component patterns
- consistent public/admin branding

Do not introduce a completely separate Material-style component system unless explicitly requested.

Use Material Design principles to improve usability rather than replace MVA branding.

### Admin UX

Admin interfaces should optimize for operational work.

For lists such as registrations, payments, teams, and players, prioritize information needed to make the next administrative decision.

For example, registration management may prioritize:

- Team
- Division
- Payment state
- Balance
- Player/payment completeness
- Registration state
- Primary action

Supporting information should remain available without overwhelming the initial view.

### Destructive and consequential actions

Actions such as:

- deleting records
- changing verified information
- modifying payment records
- removing players
- changing registration state

must use appropriate safety patterns.

Use confirmation when appropriate and clearly communicate the consequence.

Never make destructive actions visually compete with the primary normal workflow.

### Performance-conscious UX

Good UX includes performance. Performance is an essential aspect of both correctness and user experience.

The MVA system must feel responsive on both mobile and desktop devices, including for users on slower hardware or unstable mobile network connections.

Before adding client-side JavaScript or additional data fetching:

- determine whether it is actually necessary
- prefer Server Components where appropriate
- avoid unnecessary client components
- avoid duplicate queries
- avoid loading data that is not needed for the current view
- preserve pagination for potentially large datasets
- optimize perceived performance without compromising correctness

For comprehensive architectural, data-fetching, database, bundle, and route-level guidelines, refer to [Next.js Performance & Optimization Standards](#nextjs-performance--optimization-standards) below.

### Existing architecture first

Before redesigning an existing screen:

1. Inspect the current implementation.
2. Understand the business rules.
3. Identify reusable components.
4. Preserve working functionality.
5. Improve incrementally.
6. Avoid rebuilding working features without a clear reason.

UI/UX refactoring must NOT silently alter:

- business rules
- payment calculations
- canonical accounting
- authorization
- audit behavior
- registration rules
- database relationships

unless the task explicitly requires those changes.

### Consistency rule

Before creating a new component or interaction pattern, inspect whether the project already has an equivalent reusable pattern.

Prefer consistency over unnecessary novelty.

If a new pattern is genuinely better, implement it in a reusable way when practical.

---

# NEXT.JS PERFORMANCE & OPTIMIZATION STANDARDS

Performance is an explicit project-wide engineering requirement for the MVA platform. It is a fundamental element of both system correctness and user experience.

The MVA web application must deliver fast, predictable, and responsive interactions across diverse devices and network environments—especially ordinary mobile smartphones on variable cellular connections—without compromising security, auditability, or data integrity.

## Core Priority Order

Whenever architectural, design, or implementation tradeoffs arise, strictly adhere to this priority order:

1. Correct business behavior
2. Security and authorization
3. Financial / data integrity
4. Accessibility
5. User-perceived responsiveness
6. Server / database efficiency
7. Client bundle efficiency
8. Micro-optimization

```text
CORRECTNESS → SECURITY → DATA INTEGRITY → PERFORMANCE
```

**Non-Negotiable Rule**: Optimization must NEVER compromise payment correctness, authorization, auditability, registration rules, or data integrity. A 50 ms raw performance gain is **never** worth weakening payment reconciliation, security checks, canonical accounting, or code maintainability.

---

## Architectural & Implementation Principles

Base all performance decisions on modern Next.js 16+ App Router best practices, taking into account the repository's React 19 and Prisma architecture. Always inspect the actual route behavior and data requirements before choosing an optimization—do not optimize mechanically.

### 1. Server Components by Default

Prefer React Server Components (RSC) by default for components that:

- Primarily read data;
- Render static or dynamic layout/content;
- Do not require browser APIs (e.g. `window`, `localStorage`);
- Do not require client-side state (`useState`, `useReducer`) or event listeners (`onClick`, `onChange`).

Guidelines:

- Use `"use client"` only when client-side interactivity or browser APIs are strictly necessary.
- Never convert an entire page or route subtree into a Client Component merely because one nested element needs client state or interactivity.
- Push `"use client"` boundaries as far down the component tree as practical (isolate interactive leaves).
- Server Components eliminate client hydration overhead, reduce client JavaScript bundle size, and keep database access closer to the source.

### 2. Data Fetching

Avoid unnecessary, duplicate, or oversized database and data-fetching operations.

Before introducing a query:

1. **Inspect existing data**: Check what data the page or parent component has already fetched.
2. **Reuse existing queries**: Determine whether an existing query or relation can safely provide the needed data without overfetching.
3. **Select required fields/relations**: Avoid fetching full relations or sensitive fields that the current view does not render.
4. **Enforce boundaries**: Never execute unrestricted queries where pagination, limit clauses, or search filters are appropriate.
5. **Parallelize independent queries**: For independent asynchronous operations, use parallel execution (such as `Promise.all()`) when:
   - The operations do not depend on each other's results;
   - Doing so preserves overall correctness;
   - It does not cause connection contention or unsafe database behavior.
6. **Preserve sequential ordering when required**: Do NOT parallelize operations that require strict transactional ordering or depend on the output of prior operations.

### 3. Avoid Avoidable Data Waterfalls

Actively inspect routes for sequential awaiting of independent promises:

```typescript
// AVOIDABLE WATERFALL: independent queries executed sequentially
const teams = await getTeams();
const leagues = await getLeagues();
const categories = await getCategories();
```

Instead, where queries are genuinely independent, execute them concurrently or co-locate them with React Suspense:

```typescript
// CONCURRENT: independent queries executed together
const [teams, leagues, categories] = await Promise.all([
  getTeams(),
  getLeagues(),
  getCategories(),
]);
```

Where appropriate, use:

- Parallel fetching with `Promise.all()`;
- Component-level data fetching wrapped in React Suspense boundaries;
- Architectural preloading patterns.

*Note*: Do not optimize mechanically. If query B requires an ID produced by query A, the dependency is legitimate and must remain sequential.

### 4. Loading and Streaming

Leverage Next.js App Router loading and streaming patterns to enhance perceived performance:

- Use `loading.tsx` for route-level loading states.
- Wrap slow or secondary data sections in React `<Suspense>` boundaries to allow progressive page streaming.
- Design meaningful skeleton UI that mirrors the layout of the incoming content to avoid Cumulative Layout Shift (CLS).
- Ensure loading indicators appear promptly and communicate that the system is actively working.

Rules:

- Do NOT add loading screens, spinners, or skeletons merely for decoration.
- Never introduce artificial delays or timers just to display an animated loading state.

### 5. Caching Must Be Intentional

Do NOT assume that every database query or route response should be cached. Cache decisions must be deliberate and context-aware.

Before introducing caching or revalidation:

- Evaluate change frequency: How often does the underlying data change?
- Evaluate freshness expectations: Does the user expect to see live changes immediately?
- Evaluate operational risk: Could stale data cause an administrative error or duplicate payment?
- Evaluate authorization: Does the data vary based on the user's role or identity? Never cache sensitive authorization decisions unsafely.

#### Public Read-Heavy Data vs. Admin Operational Data

- **Public Read-Heavy Routes** (e.g., public league overviews, team rosters, schedules):
  - Caching and revalidation (e.g., ISR or time-based revalidation) may be evaluated where content changes infrequently and real-time freshness is not critical.
- **Admin, Payment, and Registration Routes** (e.g., registration review, payment reconciliation, balances):
  - **Prioritize freshness and absolute correctness**.
  - Do NOT introduce aggressive caching that could lead administrators to act on stale balances, unrecorded payments, outdated verification statuses, or incorrect roster states.
  - Rely on fresh server-side reads to ensure decision-making data is authoritative.

Always follow the caching semantics of the installed Next.js version (Next.js 16+ App Router conventions) rather than outdated assumptions from earlier versions.

### 6. Database Performance

Performance optimization directly encompasses database behavior and Prisma usage.

When developing data-heavy pages and queries:

- **Eliminate N+1 query patterns**: Use Prisma's `include` or `select` to fetch related records in unified queries, rather than querying in loops.
- **Avoid duplicate queries**: Avoid fetching identical datasets repeatedly across sibling or parent-child components within the same request lifecycle.
- **Select specific fields**: Use `select` to limit payloads when querying wide tables with unused text or auditing columns.
- **Preserve database-level pagination**: Always enforce `take` and `skip` (or cursor-based pagination) for potentially large datasets. Never load an entire table into memory merely to slice or paginate on the server or client.
- **Filter and sort at the database level**: Let PostgreSQL handle sorting, filtering, and counting through indexed columns.
- **Strict Database Safety**: Do NOT casually alter or add database indexes. If a performance issue suggests a missing index:
  1. Document and explain the observed query bottleneck;
  2. Propose the specific index or schema adjustment;
  3. Evaluate it against the existing MVA data model and indexing strategy;
  4. Obtain explicit approval before modifying the database.

### 7. Bundle Size and Client JavaScript

Keep client-side JavaScript minimal, intentional, and strictly budgeted:

- Avoid unnecessary Client Components.
- Do not import large third-party utility libraries when native JavaScript or concise helper functions suffice.
- Ensure server-only code (Prisma, database credentials, server utilities) never leaks into client bundles.
- Avoid duplicate utility functions and excessive global state containers.
- When considering a client dependency:
  - Check if a lightweight alternative exists;
  - Evaluate if the functionality can run entirely on the server;
  - Consider dynamic imports if the feature is heavy and accessed infrequently.
- Do not sacrifice code clarity or maintainability merely to shave negligible bytes.

### 8. Images

Follow Next.js image optimization best practices:

- Prefer `next/image` over raw `<img>` tags for images supported by Next.js optimization.
- Provide explicit `width` and `height` (or use `fill` with a sized container) to prevent layout shift.
- Use responsive `sizes` attribute for images rendered across multiple viewport widths.
- Reserve `priority` exclusively for above-the-fold Largest Contentful Paint (LCP) assets (e.g., hero images).
- Do not eagerly load all images on a page; let non-critical images load lazily.
- Always display the official MVA logo and official brand assets accurately, maintaining correct aspect ratios and visual fidelity.

### 9. Fonts

- Use Next.js font optimization (`next/font`) for primary typography (e.g., Inter, Manrope).
- Load only the required font weights, styles, and subsets.
- Do not introduce additional font families without explicit design rationale.

### 10. Third-Party Scripts

- Treat every third-party script as an operational, performance, and security risk.
- Before adding any script, evaluate:
  - Is it strictly necessary?
  - What is its impact on page performance, TBT (Total Blocking Time), and LCP?
  - What are the privacy, data governance, and security implications?
  - Can it be deferred or loaded off the critical rendering path?
- Use Next.js `<Script>` with appropriate strategies (`afterInteractive`, `lazyOnload`) when third-party integration is required.

### 11. Dynamic Imports and Code Splitting

- Consider dynamic imports (`next/dynamic` or `React.lazy`) for heavy, non-critical client features that are not required on initial page render (e.g., complex export dialogs, interactive charting widgets, or heavy modal sheets).
- Do NOT dynamically import components routinely or for small components. Dynamic imports introduce additional network requests and chunk overhead; use them only when measurable bundle reductions justify the split.

### 12. Navigation

- Preserve fast client-side navigation provided by the Next.js App Router.
- Always use `<Link>` or `router.push()` for internal navigation; avoid hard `<a href>` links that trigger full-page browser reloads unless intentionally resetting the application state.
- Avoid navigation patterns that unnecessarily discard server-rendered layouts or cause redundant data refetching.

### 13. Mobile and Slow Network Performance

The MVA platform is **mobile-first**. Real-world users in Mahatao and tournament venues will frequently access the system using entry-level or mid-range mobile devices on cellular networks.

- Always evaluate performance with mobile constraints in mind (modest CPU, constrained RAM, high latency, limited bandwidth).
- Do not test or judge performance solely on high-spec developer laptops with high-speed fiber connections.
- Keep payloads compact and minimize client-side JavaScript execution.
- Ensure the public registration flow (`/register`) and team directories load smoothly and reliably under adverse network conditions.

### 14. Perceived Performance & Optimistic UI Boundaries

Performance is as much about user perception as it is about raw response times:

- Provide immediate visual feedback on interactive elements (buttons, inputs, toggles).
- Use route-level loading skeletons to maintain visual structure during page transitions.
- Prevent Cumulative Layout Shift by reserving space for dynamically loaded content.
- Use optimistic UI cautiously and **ONLY** where business logic permits safe recovery.
- **CRITICAL PAYMENT RULE**: Do **NOT** use optimistic updates for financial, payment, or balance operations unless the architecture explicitly provides an atomic, bulletproof rollback mechanism. Payment verification, adjustments, and reconciliation must always reflect confirmed server state. Never visually present a financial operation as successful before the server has fully verified and committed it.

### 15. Measure Before Complex Optimization

Do not introduce architectural complexity, premature caching layers, or esoteric abstractions based merely on guesses or assumptions.

When addressing a suspected performance issue:

1. **Identify the bottleneck**: Measure before modifying. Is the slowdown in database queries, network latency, server rendering, payload size, client hydration, or asset downloads?
2. **Inspect the implementation**: Examine the current code, Prisma query logs, and React component tree.
3. **Apply the minimal fix**: Implement the smallest, most direct optimization that resolves the bottleneck.
4. **Verify and measure**: Confirm both the performance gain and the functional correctness of the change.
5. **Use available tooling**: Utilize browser DevTools (Network, Performance, Lighthouse), Next.js build stats, and Prisma query logging when investigating performance.

Avoid premature micro-optimizations (e.g., indiscriminately wrapping every calculation in `useMemo` or callbacks in `useCallback` without an actual render bottleneck).

---

## Route-Specific Performance Framework

Evaluate performance requirements and trade-offs according to route archetype:

### Public Routes (`/register`, `/teams`, `/teams/[slug]`, `/`)
- **Primary Goals**: Fast initial server render, minimal client JavaScript, high mobile network resilience, smooth step-by-step UX.
- **Strategies**:
  - Keep interactive client boundaries isolated to form inputs and step controllers.
  - Deliver lightweight initial HTML.
  - Safe caching and revalidation where public data is stable.
  - Immediate tactile feedback on touch interactions.

### Admin Routes (`/admin/registrations`, `/admin/registrations/[id]`, `/admin/payments`, etc.)
- **Primary Goals**: Absolute data correctness, real-time freshness, efficient operational workflows, zero stale financial data.
- **Strategies**:
  - Prioritize fresh server-side data fetching over caching.
  - Enforce server-side pagination, sorting, and filtering on large tables.
  - Eliminate duplicate accounting or verification queries.
  - Clear, unambiguous pending states for consequential administrative actions.
  - Smooth client transitions between views without sacrificing data integrity.

---

## Performance Review Checklist

Before declaring a meaningful feature or route implementation complete, review this checklist:

- [ ] **Client JS**: Is unnecessary client-side JavaScript avoided? Are `"use client"` directives pushed to leaf components?
- [ ] **Server Components**: Are Server Components utilized by default for data reading and page layout?
- [ ] **Waterfalls**: Are avoidable sequential `await` waterfalls eliminated using parallel fetching or Suspense?
- [ ] **Query Efficiency**: Are duplicate database queries and N+1 query patterns avoided?
- [ ] **Selective Fetching**: Is only the necessary data and relational fields being fetched?
- [ ] **Pagination**: Is database-level pagination enforced for potentially large datasets?
- [ ] **Caching Freshness**: Is caching applied appropriately without risking stale data on admin, payment, or registration screens?
- [ ] **Loading UX**: Does the route have an appropriate loading state (`loading.tsx` or `<Suspense>`) that prevents layout shifts?
- [ ] **Mobile Usability**: Does the route load and operate smoothly on mobile devices under throttled network conditions?
- [ ] **Asset Optimization**: Are images using `next/image` with proper dimensions, and are fonts optimized via `next/font`?
- [ ] **Correctness & Safety**: Did the optimization preserve all business rules, canonical accounting, security, authorization, and accessibility standards?

---

## Performance Anti-Patterns

Avoid these common pitfalls across the codebase:

1. **`"use client"` by Default**: Turning entire pages or large container components into Client Components out of habit or convenience.
2. **Duplicate Querying**: Querying the same database records independently in multiple components during a single request.
3. **In-Memory Table Slicing**: Fetching hundreds or thousands of rows from PostgreSQL only to paginate or filter them in JavaScript memory.
4. **Client-Side Heavy Filtering**: Downloading unpaginated datasets to the client browser for client-side search or filtering.
5. **Aggressive Financial Caching**: Caching payment summaries, team balances, or registration review states, causing administrators to see stale financial records.
6. **Premature Memoization**: Scattering `useMemo` and `useCallback` everywhere across simple components without measuring or demonstrating a rendering performance problem.
7. **Decorative Loading Delays**: Using `setTimeout` or artificial delays to force loading animations to show.
8. **Unjustified Dynamic Imports**: Dynamically importing tiny components, which creates unnecessary chunk fragmentation and latency.
9. **Heavy Dependencies for Minor Tasks**: Importing large third-party libraries (e.g., date libraries, utility lodash-like suites) for simple logic that native JavaScript handles easily.
10. **Complexity Over Clarity**: Introducing convoluted caching, state machines, or abstractions that make code unreadable and fragile without delivering a measurable, meaningful benefit.
