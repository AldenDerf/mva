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
  * Updated open league name to `MVA 2026 Mahatao Volleyball League` and streamlined public registration UI by removing public league dates.
  * Added division tags (Men's, Women's, and Mixed / Co-ed Division) and clarified mixed/co-ed roster guidance for All Mahatao / Mahatao Only category records.
  * Accessible radio group structure with keyboard navigation (`Enter`/`Space`) and visible selection cues.
  * Robust state handling for loading states, empty leagues, empty categories, and server validation errors.
  * Step confirmation view verifying server-side boundary validation before continuing.
* Connected the "Register Team" CTA buttons in `Header.tsx` and `MobileNav.tsx` directly to `/register`.
### Public Team Registration (Phase 04 — Per-Player Fees & Incomplete Roster Support)

* Clarified and implemented the MVA registration rate of ₱300.00 per player (dynamically derived from `league_categories.registration_fee` rather than hardcoded or treated as a fixed team fee).
* Added dynamic roster fee calculation formula: `total = registered player count × ratePerPlayer`.
* Sourced roster limits dynamically from `league_categories.min_players` (as the final roster requirement) and `league_categories.max_players`, eliminating all hardcoded roster constants.
* Permitted submissions with fewer than `category.min_players` while displaying clear "Incomplete — X/{category.min_players} players" visual indicators and reminders to finalize the roster before the competition deadline.
* Added live-updating roster counters and fee calculation displays as players are added or removed during the registration process, with enforcement of `category.max_players`.
* Preserved all existing database structures, category limits, and server-side integrity validations without modifying the Prisma schema.

### Public Team Registration (Phase 04.3 — Team Information & Team Roster Public Registration UX)

* Implemented user-friendly 5-step registration wizard flow (`RegistrationWizard.tsx`) with simple language tailored for team representatives:
  * **Choose Division (Step 1)**: Presents tournament and category cards with dynamic ₱300/player fees, division tags, and roster limits.
  * **Your Team (Step 2)**: Provides clear options for "I have an existing team" (with search filter, past member loading, and duplicate division detection) and "I'm creating a new team" (team name input and player additions).
  * **Roster Management**: Dynamically loads previous team members while keeping historical records isolated; allows retaining, removing, and adding players; live updates player count, complete/incomplete status, and total fee assessment.
  * **Your Information (Step 3)**: Collects registrant details (First Name, Middle Name, Last Name, Suffix, Contact Number, Email) with clear guidance that the registrant does not have to be the team captain.
  * **Team Captain (Step 4)**: Requires selecting the captain exclusively from players in the current tournament roster.
  * **Review & Submission (Step 5 & 6)**: Comprehensive summary card detailing team name, division, members, captain, registrant, fee calculation, and incomplete roster notice; creates the registration with `PENDING_PAYMENT` status, creates an initial assessed payment record, and displays the official trigger-generated registration code (e.g. `MVA-2026-0003`).
* Added server actions and database helpers in `lib/registration.ts` and `app/actions/registration.ts`:
  * `fetchExistingTeamsAction` / `getExistingTeams`: Retrieves existing teams annotated with division registration status.
  * `fetchTeamPreviousMembersAction` / `getTeamPreviousMembers`: Retrieves past players from previous registrations without mutating historical data.
  * `submitTeamRegistrationAction` / `createRegistration`: Executes transactional registration creation with comprehensive server-side validations, player reuse/creation, trigger-assigned registration codes, and pending payment tracking.
* Created automated verification suite `scripts/verify-phase-04-3.ts` confirming all 15 core Phase 04.3 requirements pass.

### Public Team Registration (Phase 04 — Public Registration MVP Finalization)

* Finalized the complete, mobile-first public team registration MVP ready for live launch on the MVA Facebook page.
* Streamlined player entry to minimize friction: only player names are required (First Name, Last Name, optional Middle Name, optional Suffix); jersey numbers and positions are not required for initial submission and have been removed from the public form.
* Enforced official dynamic roster status messaging based on `category.min_players`:
  * Below minimum: `"⚠️ Roster incomplete — X/Y players"` with guidance `"You can submit your registration now. Additional players can be added later."`
  * At or above minimum: `"✓ Roster complete — X/Y players"`.
* Ensured registrations with any valid player count ($\ge 1$) can be submitted and begin in `PENDING_PAYMENT` status without blocking.
* Retained dynamic fee calculation derived directly from database category registration fee ($X \text{ players} \times \text{category.registration\_fee}$).
* Preserved strict separation between Registrant (team submitter/representative) and Team Captain (selected from current tournament roster).
* Maintained database safety with zero schema modifications, full transactional integrity, and PostgreSQL trigger-generated user-facing registration codes.
* Cleaned up public category selection cards by removing public-facing minimum-player descriptions pending formal announcement.
* Established the 3 tournament categories for the active league: "Mahatao Only" (Mixed/Co-ed), "Open Conference — Men's Division", and "Open Conference — Women's Division", preserving ₱300/player fees, 6/12 roster values, and full foreign-key integrity for historical registrations.
* Streamlined public player entry form to First Name, Middle Name (Optional), and Last Name fields, removed the "Max 12 players" header description, and enforced explicit team captain selection without auto-defaulting.

### Planned

* Payment Verification Workflow & Management (Future Phases).
