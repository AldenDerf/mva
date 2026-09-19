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

### Public Team Registration (Phase 04 — Registration Success & Reference Page)

* Added dedicated, mobile-first registration success route at `/register/success?ref=...` displaying official registration confirmation.
* Updated `RegistrationWizard` to automatically redirect users upon successful team submission to `/register/success?ref=MVA-2026-XXXX` using the authoritative trigger-generated registration code.
* Implemented secure database validation function `getRegistrationByReference` and Server Action `fetchRegistrationByReferenceAction`:
  * Validates registration codes against the database source of truth.
  * Sanitizes public output by stripping sensitive personal data (registrant contact numbers, emails, addresses, and player personal records).
  * Returns friendly "Registration Reference Not Found" state with "Back to Registration" action for invalid or non-existent references.
* Implemented client-side HTML5 Canvas PNG reference generator (`downloadReferenceImage.ts`):
  * Produces high-resolution (1200×1420) reference images branded with the official MVA logo, deep athletic green (`#205823`) header, and gold (`#F5D025`) accents.
  * Includes tournament title ("MVA 2026 Mahatao Volleyball League"), team name, division, registration reference code, status badge, and official record-keeping instruction.
  * Mobile-friendly and optimized for saving directly to phone photo galleries or presenting to MVA tournament organizers.
* Provided "Register Another Team" action returning users to `/register` with a clean, unpolluted registration flow.
* Maintained complete architectural compatibility with future roster-management workflows without modifying the Prisma schema.
* Clarified initial registration vs final roster rules:
  * Supported initial team registrations with any player count ($\ge 1$, including 1, 5, 11, 12, 15+ players) with no maximum-player rejection.
  * Retained the ₱300/player fee assessment ($N \times \text{₱}300$) dynamically based on actual registered players.
  * Cleaned up Step 2 UI in `RegistrationWizard`: removed minimum requirement descriptions from the header and Current Roster section, and updated the Roster Status badge to "Ready to Register".
* Simplified Public Team Registration Flow:
  * Removed "I have an existing team" and "I'm creating a new team" options, existing-team searches, selectors, radio cards, and previous member loading from the public registration flow.
  * Streamlined Step 2 to ask directly for the "Team Name" and user-added roster players starting with a clean, empty roster.
  * Simplified player entry to only request the player's full name (First Name, Middle Name [Optional], Last Name), removing jersey number and position prompts from public registration.
  * Preserved server-side duplicate registration protection ensuring a team cannot be registered more than once in the same league division.
  * Reused existing team identity records seamlessly in the database backend when matching names are submitted across new tournaments.
  * Retained backend team lookup and member historical query structures for future Admin portal use.


### Public Team Registration (Phase 04 — Final Verification & Database Isolation)

* Established complete production database safety and isolation by reproducing the live schema in the local development database `mva_dev` with 1:1 architectural fidelity.
* Verified all PostgreSQL-native database behaviors in local development: `generate_registration_code()`, `generate_registration_code_trigger`, `update_updated_at_column()`, updated-at triggers, identity sequences, and check constraints (`chk_category_players`, `chk_payment_amount`, `chk_jersey_number`).
* Switched local development environment to `localhost:5432/mva_dev` via `.env.local` while keeping production Supabase credentials safely isolated and strictly read-only.
* Executed end-to-end automated verification suite (`scripts/verify-phase-04-final.ts`) covering all core Phase 04 scenarios:
  * Minimal registration (1 player allowed, fee = ₱300, `PENDING_PAYMENT`, official code generated).
  * 5 players and 11 players registration (variable roster size accepted without 12-player minimum block).
  * Explicit team captain requirement and validation (must be in submitted roster, single captain only).
  * Server-side duplicate registration prevention (same team in same league category rejected safely).
  * Domain-compliant team identity reuse across distinct league divisions.
  * Server-authoritative fee assessment strictly calculated from database category fee (₱300/player).
  * Public registration reference lookup (`/register/success?ref=...`) with complete data privacy safeguards.
* Passed all quality gates: `pnpm prisma validate`, `pnpm lint`, and `pnpm build` with zero errors.
* Formally closed Phase 04 — Public Team Registration.

### Admin Management (Phase 05.1C — Database Foundation)

* Added administrative schema models in `prisma/schema.prisma` and applied to PostgreSQL:
  * `profiles`: Links Supabase Auth `auth_user_id` (UUID) to application identity (`display_name`, `email`).
  * `admin_access`: Explicit administrator authorization mapping (`role = 'ADMIN'`, `is_active = true`).
  * `admin_audit_logs`: Audit trail storage linking administrative actions to `profiles.id` (`action`, `entity_type`, `entity_id`, `metadata`).
* Enabled PostgreSQL Row-Level Security (RLS) on all three administrative tables with a default-deny posture against direct browser PostgREST queries.

### Admin Management (Phase 05.2 — Authentication & Authorization)

* Installed and integrated `@supabase/supabase-js` (`v2.116.0`) and `@supabase/ssr` (`v0.12.7`).
* Implemented clean separation between browser Supabase client (`lib/supabase/client.ts`), server client (`lib/supabase/server.ts`), and session refresh proxy (`lib/supabase/proxy.ts`, `proxy.ts`).
* Configured Next.js 16 `proxy.ts` for proactive session refresh across protected route boundaries.
* Built server-side administrator authorization engine in `lib/auth/admin.ts`:
  * `verifyAdminAuthorization(authUserId)`: Validates active `ADMIN` role from `profiles` and `admin_access` in PostgreSQL via Prisma.
  * `getAdminContext()`: Resolves authenticated Supabase user and returns safe `AdminContext` or `null`.
  * `requireAdmin()`: Enforces server-side guard on administrative Server Components and Actions; safely redirects unauthenticated users to `/admin/login` and unauthorized users to `/admin/login?error=access_denied`.
* Created administrator login portal at `/admin/login` (`app/admin/login/page.tsx`, `LoginForm.tsx`) adhering to the MVA design system, with accessible inputs, loading states, generic error handling, and no public admin signup.
* Created Server Actions in `app/admin/actions.ts` (`adminLoginAction`, `adminLogoutAction`) with session revocation on unauthorized authentication attempts.
* Built minimal authenticated admin landing page at `/admin` (`app/admin/page.tsx`) displaying verified administrator identity and logout capability.
* Created safe, idempotent local developer provisioning script (`scripts/provision-admin.ts`) with strict safety probes.
* Implemented automated authorization test suite (`scripts/verify-phase-05-2.ts`) verifying all 5 security boundaries (unauthenticated, authenticated without profile, authenticated with inactive admin, and authenticated with active admin).

### Admin Management (Phase 05.3 — Admin Shell & Dashboard)

* Built the reusable authenticated Admin Shell (`components/admin/AdminShell.tsx`) adhering to the MVA brand identity:
  * Desktop sidebar with official MVA logo branding, navigation items (Dashboard active, Registrations/Payments/Teams marked as future phase placeholders), administrator profile card, and sign-out capability.
  * Desktop header with contextual section title, live authorization badge, and responsive layout.
  * Mobile navigation drawer rendered through a React portal to `document.body` (`createPortal`), preventing backdrop-filter containing block and clipping issues on mobile devices.
* Established server-side authorization layout guard in `app/admin/(portal)/layout.tsx`:
  * Enforces `requireAdmin()` once for all nested protected admin routes without duplicating database checks across individual child pages.
  * Leaves public `/admin/login` unaffected outside the portal route group to avoid redirect loops.
* Conditionally isolated public application shell from admin portal:
  * Updated `Header.tsx` to automatically omit public navigation on `/admin/*` routes.
  * Created `ConditionalFooter.tsx` client wrapper to omit public footer on `/admin/*` routes.
* Implemented server-side read-only dashboard data layer in `lib/admin/dashboard.ts`:
  * `getDashboardSummaryCounts`: Fetches database-level counts for Pending Registrations (`status = 'PENDING_PAYMENT'`), Verified Registrations (`status = 'VERIFIED'`), Pending Payments (`status = 'PENDING'`), and Total Registrations.
  * `getRecentRegistrations`: Retrieves the latest 5 tournament registrations with joined team names, categories, primary payments, and player counts.
* Built read-only Admin Dashboard at `/admin` (`app/admin/(portal)/page.tsx`):
  * Page header with "Read-Only" indicator and development database connection status.
  * 4 summary metric cards (Pending Registrations, Verified Registrations, Pending Payments, Total Registrations) with distinctive status color accents.
  * Responsive recent registrations view: full data table on desktop and compact card view on mobile.
  * Accessible empty state with explanatory guidance when no team submissions exist yet.
* Created automated verification suite in `scripts/verify-phase-05-3.ts` verifying summary queries, recent registrations relation joins, and clean post-test fixture removal.
* Passed all automated checks: `pnpm build`, `pnpm lint`, and 100% pass on Phase 05.2 and Phase 05.3 verification test suites.

### Planned

* Phase 05.4 — Registration Management (Review, Verify, Reject, and Roster Administration).
* Phase 05.5 — Payment Verification & Tracking.
* Phase 05.6 — Team & Player Management.

