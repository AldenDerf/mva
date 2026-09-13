# MVA Changelog

All notable changes to the Mahatao Volleyball Association (MVA) web platform are documented here.

Git commits remain the authoritative technical history. This file records meaningful features, fixes, architecture changes, and project milestones.

---

## [Unreleased]

### Project Setup

* Created the initial Next.js application.
* Established the MVA PostgreSQL database in Supabase.
* Created and verified the initial MVA database schema.
* Added core league, category, team, player, registration, roster, and payment tables.
* Added database relationships, constraints, indexes, and timestamp triggers.
* Added user-facing registration codes.
* Added development test data and verified database relationships.
* Installed and configured Prisma ORM with Supabase PostgreSQL connection.
* Successfully introspected the existing database schema via `prisma db pull` (7 core models).
* Generated Prisma Client and verified TypeScript build.
* Installed Supabase agent skills for database best practices.

### Design System & Application Shell

* Established the official MVA visual identity, brand tokens, and color system (Primary Green `#205823`, Primary Gold `#F5D025`, Dark Gold `#B99531`, Background `#FAFAF8`, and dark neutral text `#172019`).
* Implemented modern typography using `Inter` with accessible hierarchy and responsive reflow.
* Created reusable UI foundation components: `Button`, `Badge`, `Card`, `Container`, `Section`, and `Input`.
* Built the responsive application shell featuring the official MVA logo (`public/images/MVA Official Logo.png`), desktop navigation, accessible mobile drawer (`MobileNav`), and association footer.
* Created a demonstration homepage showcasing the design system, typography, components, and core association pillars without placeholder statistical data.
* Verified WCAG 2.2 AA contrast standards, keyboard accessibility, and production build.

### Public Team Registration (Phase 04.1 — Foundation)

* Implemented safe server-side registration foundation layer in `lib/registration.ts`:
  * `getOpenLeagues`: Retrieves only leagues with `status: OPEN_FOR_REGISTRATION`.
  * `getOpenLeagueById`: Retrieves a specific open league with strict UUID validation.
  * `getLeagueCategories`: Retrieves categories for a selected open league with validation and Decimal-to-number fee serialization.
  * `validateLeagueAndCategory`: Enforces league/category association boundary and open status.
* Added Next.js Server Actions in `app/actions/registration.ts` (`fetchOpenLeaguesAction`, `fetchLeagueCategoriesAction`, `validateLeagueAndCategoryAction`) with error handling and serialization for client components.
* Created automated verification suite in `scripts/verify-phase-04-1.ts` validating all foundation functions against live Supabase test data.

### Public Team Registration (Phase 04.2 — League & Category Selection UI)

* Created the public registration entry page at `/register` (`app/register/page.tsx`) with server-side pre-fetching of open leagues and categories.
* Implemented the interactive `RegistrationWizard` client component (`app/register/RegistrationWizard.tsx`):
  * Dynamic league selection with automatic single-open-league pre-selection.
  * Dynamic category cards displaying registration fees (PHP formatted) and roster limits (min-max players).
  * Accessible radio group structure with keyboard navigation (`Enter`/`Space`) and visible selection cues.
  * Robust state handling for loading states, empty leagues, empty categories, and server validation errors.
  * Step confirmation view verifying server-side boundary validation before continuing.
* Connected the "Register Team" CTA buttons in `Header.tsx` and `MobileNav.tsx` directly to `/register`.
* Created automated verification suite in `scripts/verify-phase-04-2.ts` verifying zero database writes and complete selection flow.

### Planned

* Team Search and Creation UI (Phase 04.3).



