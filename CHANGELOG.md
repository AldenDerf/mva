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

### Planned

* Build the public MVA team registration system.

