# MVA Changelog

All notable changes to the Mahatao Volleyball Association (MVA) web platform are documented here.

Git commits remain the authoritative technical history. This file records meaningful features, fixes, architecture changes, and project milestones.

---

## [Unreleased]

### Admin Roster Management (Phase 05.7D.4 — Remove Before Delete Lifecycle)

* **Authoritative "Remove Before Delete" Roster Lifecycle (`lib/admin/roster-safety.ts`, `roster-actions.ts`)**:
  * Enforced authoritative rule that an `ACTIVE` roster member can **never** be hard-deleted directly, regardless of payment status (`ACTIVE -> DELETE` is strictly blocked on the server inside the database transaction with `BLOCKED_ACTIVE_STATUS`).
  * Required lifecycle: `ACTIVE` → `REMOVE FROM ROSTER` (`REMOVED`) → evaluate deletion eligibility.
  * For `REMOVED` members with never-verified payments: administrative hard deletion is permitted, explicitly purging eligible non-financial `PENDING`/`REJECTED` placeholders while strictly preserving the global `players` identity record.
  * For `REMOVED` members with verified payments: hard deletion remains blocked (`"Refund this player's verified payment before deleting."`) until full auditable refund architecture is approved.
* **Roster Member Removal (`lib/admin/roster-safety.ts`, `roster-actions.ts`)**:
  * Made "Remove from Roster" available for all `ACTIVE` members (both unpaid and verified).
  * Transitions status to `REMOVED`, setting `removed_at` and `removed_by_profile_id`, and clearing captaincy.
  * Preserves verified payments, payment methods, references, and audit history intact.
  * Enforces captain guard: active team captain removal is blocked until captaincy is reassigned.
  * Emits separate, immutable audit event `ROSTER_MEMBER_REMOVED` with required administrative reason.
* **Player Restoration (`lib/admin/roster-safety.ts`, `roster-actions.ts`)**:
  * Implemented `RESTORE TO ROSTER` action transitioning `REMOVED -> ACTIVE`.
  * Clears removal metadata (`removed_at`, `removed_by_profile_id`).
  * Re-incorporates existing verified payments into active canonical accounting without duplicating payments.
  * Emits immutable audit event `ROSTER_MEMBER_RESTORED`.
* **Canonical Accounting Invariance (`lib/admin/accounting.ts`)**:
  * Active accounting obligations adjust strictly at `ACTIVE -> REMOVED` (active count and expected fees decrease).
  * Subsequent hard deletion of an already-`REMOVED` player causes **zero** double-adjustment to active roster count, expected amount, paid count, or balance.
* **Admin UX & Modals (`components/admin/RosterMemberActions.tsx`, `/admin/registrations/[id]`)**:
  * Active players: displays only **Edit** and **Remove** actions (no Delete button shown).
  * Removed players: displays **Restore**, plus **Delete** (for unverified members) or a disabled Delete button with explanatory tooltip (`"Refund this player's verified payment before deleting."`).
  * Added distinct confirmation modals: Remove modal requires reason and explains roster detachment; Delete modal requires reason and explains permanent deletion of roster entry with global identity and audit preservation.
* **Automated Verification (`scripts/verify-phase-05-7d4.ts`)**:
  * Authored comprehensive test suite proving all 14 lifecycle points, accounting non-double-deduction, separate audit events, race condition guards, and database preservation with zero data drift.

### Roster Safety Foundation & Deletion Policies (Phase 05.7D.3)

* **Database Schema & Foreign Key Hardening (`prisma/schema.prisma`, `scripts/migrate-roster-safety-foundation.ts`)**:
  * **Removed Generic Payment Cascade**: Replaced the dangerous `ON DELETE CASCADE` on `payments.fk_payments_registration_player` with `ON DELETE RESTRICT` (PostgreSQL `confdeltype = 'r'`). Database now rejects physical deletion of any roster member linked to payment history.
  * **Roster Lifecycle Model (`roster_status`)**: Introduced `roster_status` enum (`ACTIVE`, `REMOVED`) and added `status`, `removed_at`, and `removed_by_profile_id` columns to `registration_players`.
* **Authoritative Deletion & Removal Policies (`lib/admin/roster-safety.ts`)**:
  * **Player Roster Deletion vs Verified Payment Boundary**: Established the fundamental rule that roster members with VERIFIED payments are strictly blocked from hard deletion and must follow the `ACTIVE -> REMOVED` lifecycle.
  * **Guarded Hard Deletion for Unverified Players**: Unverified roster members (accidental registrations) are eligible for guarded deletion; linked unverified `PENDING` placeholders are explicitly purged inside the controlled transaction rather than relying on automatic FK cascade.
  * **Global Player Identity Preservation**: Ensured deleting an unverified roster membership strictly preserves the global `players` table record.
  * **Registration Deletion Restriction**: Restricts team registration deletion eligibility strictly to registrations with `status = 'CANCELLED'`. Non-cancelled registrations are prohibited from deletion.
* **Status-Aware Query Semantics (`lib/public/teams.ts`, `lib/admin/registrations.ts`, `lib/admin/accounting.ts`)**:
  * Filtered public tournament team rosters and counts to display only `ACTIVE` roster members.
  * Augmented administrative registration details with roster status and removal metadata.

### Safe Player, Roster & Team Metadata Corrections (Phase 05.7D.2)

* **Domain Services & Concurrency Safety (`lib/admin/player-corrections.ts`, `lib/admin/team-corrections.ts`)**:
  * **Safe Player Identity Corrections**: Enables authorized editing of player personal attributes (`first_name`, `middle_name`, `last_name`, `suffix`, `contact_number`, `date_of_birth`) without schema alterations or data loss.
  * **Roster Metadata Corrections**: Supports safe updates to `jersey_number`, `position`, and `is_captain`. Captaincy reassignments are executed atomically within the same interactive transaction to enforce a single team captain invariant.
  * **Team Display Name Corrections**: Enables updating team display names with case-insensitive uniqueness checks while strictly preserving immutable system identifiers (`team.id` and URL routing `slug`).
  * **Immutable Invariants**: Fully preserves roster counts, registration IDs, expected fees, verified paid amounts, player balances, and payment completeness. No player deletions, movements, or payment reallocations occur.
  * **Audit Logging**: Emits atomic, structured audit log entries (`PLAYER_PROFILE_UPDATED`, `ROSTER_MEMBER_UPDATED`, `TEAM_PROFILE_UPDATED`) recording changed fields, before/after values, and registration context.
* **Admin UX & Modals (`components/admin/EditPlayerModal.tsx`, `components/admin/EditTeamModal.tsx`)**:
  * **Accessible Mobile-First Modals**: Clean dialogs with keyboard accessibility (`Escape` key dismissal), background scroll locking, loading indicators, and field-level validation.
  * **Multi-Registration Profile Notice**: Visual warning banner in player edit dialog informing administrators if the player profile is shared across multiple registrations.
  * **Desktop Table & Mobile Card Integration**: Integrated edit triggers seamlessly into the registration detail header and roster list.

### Admin Registration Accessibility & UX Audit Polish (Phase 05.7C.5)

* **Accessibility & Keyboard Usability (`RegistrationActionControls`, `PlayerPaymentActionControls`, `AddPlayerModal`)**:
  * **Modal Keyboard Dismissal & Scroll Lock**: Added `Escape` key listeners and background scroll locks across verification, rejection, cancellation, player payment, and roster addition dialogs to prevent keyboard traps.
  * **Accessible Names**: Added descriptive `aria-label` attributes to modal close buttons ("Close dialog"), payment action controls (e.g. "Verify payment for [Player]", "Refund payment for [Player]"), correction buttons, and registration details links.
* **Semantic Structure & Table Accessibility (`/admin/registrations`, `/admin/registrations/[id]`)**:
  * **Table Captions & Row Scopes**: Introduced screen-reader `<caption className="sr-only">` elements and `<th scope="row">` identifiers on registration and roster tables for enhanced assistive technology navigation.
  * **Pagination Navigation**: Enclosed pagination controls in semantic `<nav aria-label="Pagination Navigation">` with explicit `aria-label` attributes ("Previous page", "Next page"), `aria-disabled="true"` for inactive states, and 40px touch targets.
* **Mobile-First & Touch Usability Polish**:
  * **Enlarged Touch Targets**: Enriched touch areas for the "Back to Registrations" link, "Review Payments" anchor, search clear button, filter removal chips, and mobile card action buttons.
  * **Responsive Content Stress Testing**: Applied word-breaking and truncation safeguards to prevent mobile horizontal overflow on small viewports (360px–430px) for long team names, registrant names, and large currency amounts.
* **Human-Readable Terminology Polish**:
  * Formatted raw database payment method enums (e.g. `BANK_TRANSFER` → `Bank Transfer`) and audit trail status transitions into clear, operator-friendly titles.

### Registration & Team Performance Polish (Phase 05.7C.4)

* **Per-Request Query Deduplication (`lib/admin/registrations.ts`, `lib/public/teams.ts`)**:
  * **Admin Registration Detail**: Wrapped `getAdminRegistrationById` with React `cache()`, eliminating duplicate database queries executed between `generateMetadata` and `AdminRegistrationDetailPage` on `/admin/registrations/[id]`.
  * **Filter Category Lookup**: Memoized `getFilterCategories` per-request to avoid redundant dropdown relation queries.
  * **Public Team Directory & Profiles**: Wrapped `getPublicTeamBySlug` and `getActivePublicLeague` with React `cache()`, eliminating duplicate tournament and team queries executed between `generateMetadata` and `TeamProfilePage` on `/teams/[slug]`.
  * **Data Freshness Guarantee**: Retained strictly request-scoped memoization, preserving real-time financial and administrative freshness across requests without cross-request caching risk.

### Admin Registration Search & Filter Interaction Polish (Phase 05.7C.3)

* **Admin Registration Filters & Search (`components/admin/RegistrationFilters.tsx`)**:
  * **Unified Search Bar**: Integrated search input with dedicated "Search" button and instant clear ("×") button, ensuring predictable Enter/submit behavior without uncontrolled keystroke requests or heavy third-party dependencies.
  * **Filter State Synchronization**: Preserved typed search text across category/status dropdown changes, preventing inadvertent query clearing.
  * **Human-Readable Labels**: Replaced raw database enums with clean human-readable titles (e.g. "Pending Payment", "Verified", "Refunded") across controls and active filter tags.
  * **Active Filter Chips & Safe Removal**: Displayed scannable active filter chips with specific accessible remove buttons that update URL state, reset pagination to page 1, and preserve other active filters.
  * **Responsive Loading & Pending Feedback**: Introduced a subtle top progress bar and active-filter spinner during transition states without blocking user input or creating visual layout shifts.
  * **Mobile-First Layout**: Refactored grid structure to seamlessly stack on mobile devices (~360px–430px) with comfortable 44px touch targets.
* **Registration List View & Context (`app/admin/(portal)/registrations/page.tsx`)**:
  * **Contextual Result Counts**: Surfaced explicit "Filtered Matches" vs "Records" in the header and paginated footer.
  * **Filtered Empty State**: Tailored empty state guidance when no registrations match active filters, complete with an accessible "Clear all filters" recovery action.

### Admin Registration Detail UX Refinement (Phase 05.7C.2)

* **Admin Registration Detail Page (`/admin/registrations/[id]`)**:
  * **Team Identity Priority**: Anchored the page top with prominent team name (`<h1>`), followed by category/division, league, reference code chip (`MVA-2026-XXXX`), and status badges.
  * **Elevated Payment Summary**: Relocated canonical accounting summary directly below the header in four accessible cards: Expected Fees, Verified Paid, Remaining Balance with explicit semantic labels (`Due` / `Settled` / `Credit`), and Payment Completeness badge with player completeness ratios (e.g. `X of Y players paid • Z players still need payment`).
  * **Prominent "Payment needs review" Banner**: Added dedicated top-level notice whenever unassigned or legacy payments exist, providing plain-language context, the unassigned verified amount, and a direct link to review payments.
  * **Responsive Player Roster**: Introduced mobile-first player cards (for ~360px–430px viewports) displaying player identity, captain badge, jersey number, position, explicit payment state badge (`Paid` vs `Unpaid`), and touch-friendly action controls without horizontal scrolling, paired with a dense scannable table on desktop (`md:` breakpoint).
  * **Refined Payment Transactions Section**: Standardized payment card presentation with human-readable unassigned payment callouts and accessible `PaymentCorrectionButton` triggers.
  * **Secondary Information Hierarchy**: Neatly organized registration metadata, authorized registrant contact info, and chronological administrative audit history in the secondary column.
* **Registration Detail Loading Experience**:
  * Added `app/admin/(portal)/registrations/[id]/loading.tsx` with header, payment summary tiles, mobile card roster, desktop table, and transaction history skeleton matching the actual layout.
  * Enforced accessible loading semantics (`role="status"`, `aria-busy="true"`, `aria-label`, and `motion-reduce:animate-none`).

### Registration UX & Loading Experience (Phase 05.7C.1)

* **Admin Registration List UX Refinement (`/admin/registrations`)**:
  * Prioritized clear operational information hierarchy: Team name as primary anchor, followed by Division, Payment State, Balance, Player Completeness, Registration Status, and Primary Action.
  * Restructured mobile cards for 360px, 390px, and 430px viewports with comfortable ~46px touch targets, eliminating dense 3-column crowding and avoiding horizontal overflow.
  * Replaced technical database jargon (*"Legacy Unallocated"* / *"Contains unallocated legacy payment records"*) with clear, human-readable copy: *"Payment needs review"* accompanied by plain-language explanation and a direct link to review unassigned payments.
  * Enhanced desktop table hierarchy with prominent Team & Division display, contextual Balance indicators (Settled vs Due), accessible reference code chips, and touch-friendly actions.
  * Refined `RegistrationFilters` search placeholders, select inputs, filter chip removal buttons, and reset controls with accessible touch targets (44px min height).
* **Admin & Public Loading Experience**:
  * Created `app/admin/(portal)/registrations/loading.tsx` with responsive desktop table and mobile card skeleton representations matching the real page structure.
  * Created `app/teams/loading.tsx` for the public tournament directory with header, division tabs, search bar, and team card grid skeletons.
  * Created `app/teams/[slug]/loading.tsx` for the public team profile and roster page.
  * Maintained MVA visual identity (green/gold/neutral tokens), layout stability, and accessibility with `role="status"` and `motion-reduce:animate-none`.

### Admin Payment Monitoring & Payment Details Correction (Phase 05.7B)

* **Dedicated Admin Payment Monitoring (`/admin/payments`)**:
  * Implemented dedicated portal route (`app/admin/(portal)/payments/page.tsx`) protected by administrative authorization boundary (`requireAdmin()`).
  * Activated `/admin/payments` navigation item in `components/admin/AdminShell.tsx`.
  * Built high-performance data querying engine (`lib/admin/payments.ts`) with narrow relation selects and server-side pagination (default 20 items).
  * Implemented safe, parameterized tokenized full-name search across split player name columns (`first_name`, `middle_name`, `last_name`, `suffix`), plus registration code, reference number, and team name search.
  * Supported server-side filters for payment status (`PENDING`, `VERIFIED`, `REJECTED`, `REFUNDED`), payment method (`CASH`, `GCASH`, `BANK_TRANSFER`, `OTHER`), league division/category, verified-registration-only, and team payment completeness (`COMPLETE`, `INCOMPLETE`).
  * Optimized completeness candidate selection: base payment filters (search, status, method, category, verified-only) narrow down candidate registration IDs first, eliminating unnecessary accounting computation for unrelated registrations.
  * Clean early return on empty candidate or qualifying registration sets without unnecessary database queries or synthetic IDs.
  * Reused preloaded candidate accounting map during payment list view item enrichment, eliminating redundant database queries.
  * Enforced critical completeness filter rule: qualifying registrations are evaluated against canonical accounting before payment counting and pagination, ensuring pagination counts accurately reflect the full filtered dataset.
  * Reused canonical accounting model (`lib/admin/accounting.ts`) via single-pass batch map (`getBatchRegistrationAccounting`), eliminating N+1 accounting queries.
  * Mobile-first payment card layout for 360px, 390px, and 430px viewports displaying player identity, team payment summary box, and touch-friendly actions without horizontal scrolling.
  * Clean desktop table view for wider viewports with balanced column density.
* **Dedicated Payment Correction Service (`lib/admin/payment-corrections.ts`)**:
  * Built atomic correction domain service that updates EXISTING payment rows and strictly prohibits creating new payment rows.
  * Allowed mutable business fields strictly limited to `payment_method` and `reference_number`.
  * Strictly protected immutable fields: `id`, `registration_id`, `registration_player_id`, `amount`, `status`, `created_at`, `verified_at`, `verified_by_profile_id`, and registration status.
  * Concurrency and stale-state protection: aborts with `STALE_STATE` without mutation or audit log if expected values differ from current database state.
  * No-op guard: aborts with `NO_CHANGE` without updating rows or creating audit logs if new values match current database values.
  * Non-empty reason policy (minimum 5 characters) enforced across all payment statuses.
  * Created immutable `admin_audit_logs` record with action `PAYMENT_DETAILS_CORRECTED` preserving complete before/after values, reason, and actor identity.
  * Surfaced legacy unallocated payments (`registration_player_id = null`) explicitly without attributing them to players.
* **UI Components & Integrations**:
  * Implemented reusable, accessible `PaymentCorrectionModal` with unmounted child form state reset.
  * Added `PaymentCorrectionButton` to existing payments in Section E of `/admin/registrations/[id]`.
  * Created `PaymentFilters` with URL query parameters and responsive loading transition feedback.
  * Added mobile card and desktop table skeleton loading experience in `app/admin/(portal)/payments/loading.tsx`.
* **Verification Suite (`scripts/verify-phase-05-7b.ts`)**:
  * Created 61-point automated verification suite testing search tokens, filters, completeness before pagination, candidate narrowing, empty candidate handling, legacy payments, correction mutations, concurrency guards, no-ops, audit log payloads, and regression preservation.
  * Enforced strict database safety probe (`current_database() === "mva_dev"` on local socket) and clean teardown.

### Admin Accounting Foundation & Team Payment Summary (Phase 05.7A)

* **Canonical Server-Side Accounting Domain (`lib/admin/accounting.ts`)**:
  * Established single source of truth for fee calculations, eliminating ad-hoc single-payment queries across admin screens.
  * Official rate: ₱300.00 per roster member; calculates expected fees from ACTUAL official roster count (`registration_players`), eliminating any assumption of a 12-player maximum cap.
  * Pure calculation engine (`calculateRegistrationAccounting`) returning expected amount, verified paid amount, balance, paid/unpaid player counts, and explicit payment completion status (`COMPLETE` / `INCOMPLETE`).
  * Strict distinction between registration status (`VERIFIED`/`PENDING_PAYMENT`/etc.) and payment completeness (`COMPLETE`/`INCOMPLETE`).
  * Roster member payment definition: paid if and only if linked to an active `VERIFIED` per-player payment record (`registration_player_id = rp.id`).
  * Handled legacy / unallocated payments (`registration_player_id = null`): surfaced separately as `unallocatedVerifiedAmount` and audited via anomaly flags; does not falsely mark individual players as paid or team payment as complete.
  * Concurrency and history protection: respects DB partial unique constraint (`uq_payments_active_verified_player`) preventing double-counting of multiple payment rows.
  * Added tournament-wide summary aggregator (`getTournamentAccountingSummary`) scoped to the active league context (`getActivePublicLeague`).
  * Added classification utility (`classifyVerifiedTeams`) for listing all verified, verified complete, and verified incomplete teams.
* **Admin Registrations List Refactoring (`app/admin/(portal)/registrations/page.tsx` & `lib/admin/registrations.ts`)**:
  * Replaced obsolete `latestPayment` snapshot with full canonical accounting breakdown (Expected, Paid, Balance, Roster, Paid Players, and Payment Completeness).
  * High-performance single batch query selecting `registration_players` and legacy payments without N+1 query overhead.
  * Mobile-first responsive card layout for 360px, 390px, and 430px viewports displaying a 3-column accounting grid, payment completeness, and comfortable touch targets.
* **Admin Dashboard Financial Overview (`app/admin/(portal)/page.tsx` & `lib/admin/dashboard.ts`)**:
  * Added Tournament Accounting Overview section displaying Total Expected Fees, Total Verified Paid, Total Outstanding Balance, and Verified Teams breakdown (Payment Complete vs Incomplete).
  * Updated Recent Registrations table and mobile cards to reflect canonical accounting figures.
* **UI & Accessibility Components (`components/admin/StatusBadges.tsx`)**:
  * Added `PaymentCompletionBadge` rendering explicit, accessible badges for `"Payment Complete"` and `"Payment Incomplete"` with semantic icons and high-contrast typography, never relying on color alone.
* **Automated Verification Suite (`scripts/verify-phase-05-7a.ts`)**:
  * Built comprehensive 16-test suite covering all 11 required scenarios: 12-player complete, partial pending payments, 8-player roster, 15-player roster (no cap), refunded payment deduction, rejected/pending payment exclusion, legacy payment separation, zero-player abnormal stability, and historical row deduplication.
  * Enforced strict local PostgreSQL safety probe (`current_database() === "mva_dev"`, user, local IP) and complete fixture teardown.

### Public Teams & Official Rosters (Phase 05.6B)

* **Public Teams Directory (`/teams`)**:
  * Implemented mobile-first directory showcasing official participating teams with active `VERIFIED` registrations.
  * Added responsive division filtering dynamically derived from live verified league categories.
  * Added instant case-insensitive, whitespace-trimmed team name search with clear button and accessible no-results empty states.
  * Built responsive team cards displaying team name, division badge, official roster player count, and graceful logo fallback (athletic initials emblem and volleyball icon).
* **Public Team Profile & Official Roster (`/teams/[slug]`)**:
  * Built mobile-native team profile view resolving verified teams by slug without exposing internal IDs.
  * Implemented mobile-native roster cards displaying athletic jersey badges, full player names (with natural wrapping), positions, and gold `CAPTAIN` badges.
  * Enforced official business rule: NO maximum 12-player cap (all verified players >= 12 rendered completely).
  * Roster ordering: jersey-numbered players sorted numerically ascending, followed by unnumbered players sorted alphabetically by name.
  * Strict security: unverified, pending, rejected, cancelled, or unknown slugs strictly return 404 (`notFound()`).
* **Player Profile Photos & Accessible Image Lightbox (`components/public/PlayerPhoto.tsx`)**:
  * Added player profile photo support on official public rosters, ready for future Admin photo uploads.
  * Mobile-first avatar presentation: responsive dimensions (`w-10 h-10 sm:w-11 sm:h-11 rounded-full`) with `object-cover` to prevent card distortion or horizontal overflow.
  * Polished fallback avatar: generates initials from player's first and last name (e.g. Juan Dela Cruz → JD) styled with athletic green/gold gradient (`#205823` / `#F5D025`); non-clickable to prevent opening empty viewers.
  * Client-side image error resilience: automatically falls back to initials avatar if a remote photo URL fails to load.
  * Mobile-native photo viewer / lightbox: tapping on mobile or clicking on desktop opens a focused, centered lightbox over the page without page navigation or URL leaks.
  * Full accessibility & dialog semantics: `role="dialog"`, `aria-modal="true"`, visible 44x44px touch-target close button, Escape key dismissal, backdrop tap/click dismiss, background body scroll lock (`overflow: hidden`) with clean restoration, and return of focus to trigger element.
* **Privacy by Query Design (`lib/public/teams.ts`)**:
  * Strict Prisma `select` projections ensuring sensitive fields never leave the query layer: player contact numbers, dates of birth, registrant contact/email, registration notes, payment records, and admin access/audit logs are completely excluded.
  * Visibility decoupled from payment status: verified teams remain visible regardless of payment status.
* **Navigation & Platform Cleanup**:
  * Updated desktop and mobile drawer navigation to point directly to `/teams` (preserving the `MobileNav` portal architecture).
  * Cleaned up stale public-facing statements on the homepage (`app/page.tsx`), updating the minimum 12-player target notice and linking the banner directly to live registration.
* **Architectural Hardening & Multi-League Scope Isolation**:
  * Scoped public directory (`getPublicTeams`) and team profiles (`getPublicTeamBySlug`) strictly to the active tournament context (`getActivePublicLeague`).
  * Filtered out historical, completed, archived, and draft leagues so past registrations never leak into the active directory.
  * Implemented defensive team deduplication in `getPublicTeams` ensuring a team never appears more than once even when multiple historical or multi-category verified registrations exist.
  * Verified that historical rosters can never leak or override the active tournament roster.
  * Documented current schema characteristics and Phase 06 recommendations for multi-season support (such as explicit featured league flags or `/leagues/[leagueSlug]/teams` URL scoping).
* **Verification**:
  * Created expanded 95-point automated verification suite in `scripts/verify-phase-05-6b-public-teams.ts` with local database safety probe (`mva_dev` on localhost).
  * Verified 100% pass across all regression suites (Phase 05.6A, per-player payments, Phase 05.4C, 05.4AB, 05.3, 05.2).
  * Verified zero horizontal overflow across all required mobile and desktop viewports (360px, 390px, 430px, 768px, 1280px).

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

### In Progress / Awaiting Review

#### Phase 05.4A — Admin Registration List & Phase 05.4B — Admin Registration Detail
* **Phase 05.4A: Admin Registration List** (`/admin/registrations`):
  * Built read-only registration list view powered by Server Components and Prisma queries (`getAdminRegistrations`).
  * Database-level sorting (`created_at DESC`, newest registrations first) and server-side pagination with sanitized bounds.
  * Server-side search across registration code, team name, and registrant name.
  * Server-side filtering by registration status, payment status, and dynamic category division options (`getFilterCategories`).
  * Responsive dual-layout presentation: full data table for desktop view and structured card presentation for mobile view.
  * Informative empty states differentiating between general absence of records and zero-result filter matches.
  * Connected AdminShell navigation link (`/admin/registrations`) with active path indicators for desktop sidebar and mobile drawer.
* **Phase 05.4B: Admin Registration Detail** (`/admin/registrations/[id]`):
  * Built read-only registration detail view (`app/admin/(portal)/registrations/[id]/page.tsx`) powered by `getAdminRegistrationById`.
  * Comprehensive two-column layout showing registration overview, tournament league, division limits, team info, and registrant contact details.
  * Complete tournament roster table displaying player name, captain badges, optional jersey numbers, and flexible positions.
  * Payment information card showing fee calculations, payment method, reference number, verification timestamps, and graceful handling of registrations without payment records.
  * Dedicated 404 handler (`not-found.tsx`) for invalid UUIDs or non-existent registration records.
* **Verification & Testing**:
  * Added automated end-to-end verification suite in `scripts/verify-phase-05-4ab.ts` with strict database safety probe (`mva_dev` on local host).
  * 23/23 tests passed covering read invariants, search, filters, pagination, relation joins, and clean post-test fixture removal.
  * Zero regression on Phase 05.2 (9/9 pass) and Phase 05.3 (17/17 pass).
  * Clean TypeScript (`tsc --noEmit`), ESLint (`pnpm lint`), and Next.js production build (`pnpm build`).

* **Phase 05.4C: Registration Status Mutations & Audit Logging** `[IMPLEMENTED / AWAITING REVIEW]`:
  * Implemented domain service `lib/admin/registration-mutations.ts` with strict state machine validation (`PENDING_PAYMENT` → `VERIFIED`, `REJECTED`, `CANCELLED`; `VERIFIED` → `CANCELLED`; terminal states for `REJECTED` and `CANCELLED`).
  * Enforced atomic transactions (`prisma.$transaction`) binding registration status updates with immutable audit log inserts into `admin_audit_logs`.
  * Preserved `verified_at` timestamp history when cancelling verified registrations, populated `verified_at` upon verification, and retained null when rejected.
  * Preserved absolute separation of payment records (`payments.status` and `payments.verified_at` untouched) and registration notes (`registrations.notes` untouched).
  * Built Server Action `app/admin/(portal)/registrations/[id]/actions.ts` with strict `requireAdmin()` boundary, input validation, and Next.js cache revalidation (`revalidatePath`).
  * Created interactive Client Component `components/admin/RegistrationActionControls.tsx` supporting status-driven actions, under-minimum roster dispensation warnings, payment status notices, and mandatory reason dialogs.
  * Added Section F (Administrative Audit Trail) to the registration detail page displaying chronological status transitions, actors, and reasons.
  * Created automated end-to-end verification suite in `scripts/verify-phase-05-4c.ts` (42/42 tests passing) with strict local `mva_dev` database safety guard and fixture cleanup.
  * Confirmed zero regressions on Phase 05.2 (9/9 pass), Phase 05.3 (17/17 pass), and Phase 05.4A/B (23/23 pass).

* **Phase 05: Per-Player Payment Architecture & Admin Verification** `[IMPLEMENTED / VERIFIED]`:
  * Designed and implemented non-destructive per-player payment architecture (₱300 per member) preserving 100% of historical registration-level payments.
  * Added nullable `registration_player_id` and `verified_by_profile_id` foreign keys to `payments` table on local `mva_dev` database.
  * Added PostgreSQL partial unique index `uq_payments_active_verified_player` (`WHERE status = 'VERIFIED'`) physically preventing duplicate verified payments per roster player.
  * Implemented pure state machine and domain mutation service in `lib/admin/player-payment-mutations.ts` (`PENDING` → `VERIFIED`, `REJECTED`; `VERIFIED` → `REFUNDED`; terminal state for `REFUNDED`).
  * Enforced domain independence: Team Registration Status ≠ Player Roster Membership ≠ Player Payment Status.
  * Created Server Action `updatePlayerPaymentAction` in `app/admin/(portal)/registrations/[id]/payment-actions.ts` with strict authorization check (`requireAdmin()`) and cache revalidation.
  * Created interactive Client Component `components/admin/PlayerPaymentActionControls.tsx` displaying individual payment badges and modal controls for payment verification and refunds.
  * Enhanced Admin Registration Detail View (`app/admin/(portal)/registrations/[id]/page.tsx`): added Payment Status column to Tournament Roster table and real-time roster payment summary counter.
  * Updated public registration submission (`lib/registration.ts`) to automatically generate individual ₱300 payment assessments for each registered roster member.
  * Flagged roster limits discrepancy (schema default: min 6, max 12 vs official MVA business rule: min 12, no maximum).
  * Built automated verification suite in `scripts/verify-per-player-payments.ts` (43/43 tests passing) confirming DB safety probe, historical payment preservation, per-player payment verification, duplicate prevention, and clean fixture teardown.
  * Confirmed 100% zero regressions across Phase 05.2 (9/9 pass), Phase 05.3 (17/17 pass), Phase 05.4A/B (23/23 pass), Phase 05.4C (54/54 pass), and Next.js production build (`pnpm build`).

* **Phase 05.6A: Admin Add Player to Verified Team** `[IMPLEMENTED / VERIFIED]`:
  * Implemented domain mutation service `lib/admin/roster-mutations.ts` enabling authenticated administrators to directly add individual players to the official roster of an existing `VERIFIED` team registration.
  * Eligibility invariant: Enforced server-side that players can only be added to registrations with `status === "VERIFIED"`; attempts on other statuses (`PENDING_PAYMENT`, `REJECTED`, `CANCELLED`) are rejected.
  * Player identity & roster fields: Supports `first_name` (required), `last_name` (required), `middle_name` (optional), `suffix` (optional), `jersey_number` (optional, 0-99), `position` (optional, max 50 chars), and `is_captain` (default `false`).
  * Roster limit business rule: Enforced official MVA business rule of **NO MAXIMUM ROSTER LIMIT**; rosters can expand to 13, 14, or more players, isolating new additions from obsolete database category limits (`max_players = 12`).
  * Duplicate protection & concurrency: Normalized whitespace and case for names; safely rejects duplicate submissions on the same roster while avoiding harmful global name uniqueness constraints; serializable transaction isolation prevents race conditions.
  * Atomic transaction & initial payment: Binds player identity resolution/creation, `registration_players` roster linkage, initial ₱300.00 `PENDING` payment assessment (`payments.registration_player_id`), and immutable administrative audit log (`PLAYER_ADDED_TO_ROSTER`) in a single rollback-safe interactive transaction.
  * Admin Server Action: Created `addPlayerToRosterAction` in `app/admin/(portal)/registrations/[id]/roster-actions.ts` with strict `requireAdmin()` authorization boundary, input validation, and Next.js cache revalidation.
  * Admin UI: Added accessible `AddPlayerModal` (`components/admin/AddPlayerModal.tsx`) integrated directly into the Tournament Roster section header on `/admin/registrations/[id]`, displaying only when registration status is `VERIFIED`.
  * Audit history query: Extended `getAdminRegistrationById` in `lib/admin/registrations.ts` to include `REGISTRATION_PLAYER` audit records in the administrative audit trail.
  * Automated testing: Created comprehensive verification suite in `scripts/verify-phase-05-6a.ts` (38/38 tests passing) with local `mva_dev` safety probe, eligibility checks, duplicate rejection, concurrency protection, roster expansion beyond 12 members, atomic rollback verification, and complete fixture cleanup.
  * Regression testing: Confirmed 100% pass across all existing suites: Phase 05.2 (9/9), Phase 05.3 (17/17), Phase 05.4A/B (23/23), Phase 05.4C (54/54), Per-Player Payments (43/43), and clean Next.js production build (`pnpm build`).

### Planned

* Future Planned — Admin Edit Roster Member (Jersey Number, Position, Captaincy; pending roadmap numbering).
* Phase 05.7 — Public Individual Player Registration & Join Requests.
