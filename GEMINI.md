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
