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

### Planned

* Build the public MVA team registration system.

