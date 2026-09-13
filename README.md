# Mahatao Volleyball Association (MVA)

The official web platform for the **Mahatao Volleyball Association (MVA)**, supporting volleyball operations, tournament management, and community athletic programs in the Municipality of Mahatao, Batanes.

---

## 1. Project Overview

The Mahatao Volleyball Association (MVA) is the governing body for organized volleyball tournaments and community sports development in Mahatao, Batanes.

This platform is being developed to modernize MVA's operations, provide accessible public-facing services for teams, players, and fans, and establish a reliable system for league records. The platform is built incrementally, prioritizing a robust database foundation, accessible design, and mobile-first experience.

---

## 2. Current Project Status

**Current Phase: Phase 03 — Design System & UI/UX**

Key milestones achieved in the current state:
* **Database Foundation Established**: The core PostgreSQL database has been designed, deployed, and tested in Supabase with integrity constraints, enums, triggers, and relationship structures.
* **Prisma ORM Integrated**: Prisma has been configured with driver adapters (`@prisma/adapter-pg`) and successfully introspected (`prisma db pull`) against all core tables in the Supabase database.
* **Design System & Application Shell Implemented**: Reusable UI foundation components (`Button`, `Badge`, `Card`, `Container`, `Section`, `Input`), the official brand logo lockup, desktop navigation, accessible mobile navigation drawer, and footer shell are established.
* **Demonstration Homepage**: A demonstration page showcases the brand tokens, typography scale, and foundation components without fabricated tournament statistics.
* **Upcoming**: The public team registration workflow is planned for **Phase 04** and is **NOT yet implemented**.

---

## 3. Technology Stack

* **Framework**: [Next.js](https://nextjs.org/) (v16.3.5) with App Router & Turbopack
* **UI Library**: [React](https://react.dev/) (v19.2.8)
* **Language**: [TypeScript](https://www.typescriptlang.org/) (v5.x)
* **Styling**: [Tailwind CSS](https://tailwindcss.com/) (v4) with custom theme tokens
* **Design System**: Accessible components adhering to [shadcn/ui](https://ui.shadcn.com/) patterns
* **Database**: [PostgreSQL](https://www.postgresql.org/) hosted on [Supabase](https://supabase.com/)
* **ORM & Data Access**: [Prisma ORM](https://www.prisma.io/) (v7.10.0) with `@prisma/adapter-pg`
* **Package Manager**: [pnpm](https://pnpm.io/) (v11.25.0)

---

## 4. Application Architecture

```text
Next.js (App Router)
       ↓
Prisma Client (@prisma/adapter-pg)
       ↓
PostgreSQL
       ↓
    Supabase
```

> [!IMPORTANT]
> **Supabase PostgreSQL is the database source of truth.**
> All Prisma schemas and client models reflect the live database via introspection. Prisma serves as the primary ORM/database access layer in Next.js.

---

## 5. Database Domain Model

The database contains seven core domain entities:

1. **`leagues`** — Tournaments and leagues organized by MVA (e.g., Summer League, Fiesta League). Note: *League ≠ Year/Season*.
2. **`league_categories`** — Divisions belonging to a specific league (e.g., Open, Mahatao Only) with defined roster limits (`min_players`, `max_players`) and fees.
3. **`teams`** — Teams that exist independently of specific leagues and can participate across multiple tournaments.
4. **`players`** — Reusable individual player identities storing name components separately (`first_name`, `middle_name`, `last_name`, `suffix`).
5. **`registrations`** — Specific team entries for a specific league and category, tracking status (`PENDING_PAYMENT`, `VERIFIED`, etc.) and a user-facing `registration_code` (e.g. `MVA-2026-0001`).
6. **`registration_players`** — Tournament roster members linking players to a registration with team-specific roles (`is_captain`, `jersey_number`, `position`).
7. **`payments`** — Payment records associated with registrations, supporting multiple methods (`CASH`, `GCASH`, `BANK_TRANSFER`, `OTHER`) and verification tracking.

---

## 6. Project Structure

```text
mva/
├── .agents/             # Agent guidelines, rules, and installed skills
├── app/                 # Next.js App Router
│   ├── globals.css      # Design tokens, color palette, and base typography
│   ├── layout.tsx       # Root layout with Inter font, metadata, and application shell
│   └── page.tsx         # Demonstration homepage showcasing the design system
├── components/          # Reusable UI & layout components
│   ├── layout/          # Application shell: BrandLogo, Header, MobileNav, Footer
│   └── ui/              # Primitive components: Button, Badge, Card, Container, Section, Input
├── lib/                 # Shared utilities and database singletons
│   └── prisma.ts        # PrismaClient singleton with PrismaPg driver adapter
├── prisma/              # Prisma configuration
│   └── schema.prisma    # Introspected Prisma schema (read-only source of models)
├── public/              # Static public assets
│   └── images/          # Brand assets including "MVA Official Logo.png"
├── CHANGELOG.md         # Human-readable history of meaningful project milestones
├── GEMINI.md            # Authoritative project instructions, domain rules, and guidelines
├── package.json         # Project scripts and dependencies
├── pnpm-workspace.yaml  # pnpm v11 workspace and build-script permissions
├── prisma.config.ts     # Prisma 7 configuration file with native environment loading
└── tsconfig.json        # TypeScript configuration with @/* path aliases
```

---

## 7. Development Setup

### Prerequisites
* **Node.js**: v20+ or v24+
* **pnpm**: v11+ (`corepack enable pnpm` or `npm install -g pnpm`)

### Installation & Local Run
```bash
# 1. Clone the repository
git clone <repository-url>
cd mva

# 2. Install dependencies
pnpm install

# 3. Generate Prisma Client
pnpm prisma generate

# 4. Start development server
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

### Verification & Testing Commands
```bash
# Check code linting
pnpm lint

# Verify TypeScript and production build
pnpm build
```

### Safe Database Commands
```bash
# Introspect existing database into schema.prisma (Safe)
pnpm prisma db pull

# Re-generate Prisma Client types after introspection (Safe)
pnpm prisma generate
```

> [!CAUTION]
> **Destructive Commands Prohibited**
> Do **NOT** run `pnpm prisma db push`, `pnpm prisma migrate reset`, or any schema-dropping scripts without explicit authorization from the project owner. The live Supabase database is the authoritative source of truth.

---

## 8. Environment Variables

Local database connectivity requires an environment file at `.env.local` in the project root:

```env
# Connect to Postgres via the shared transaction-mode pooler (for application queries)
DATABASE_URL="postgresql://<user>:<password>@<host>:6543/postgres?pgbouncer=true"

# Connect to Postgres via the shared session-mode pooler (for schema introspection)
DIRECT_URL="postgresql://<user>:<password>@<host>:5432/postgres"
```

> [!WARNING]
> Never commit `.env`, `.env.local`, API keys, passwords, or database credentials. All `.env*` files are ignored in `.gitignore`.

---

## 9. Design System

The MVA design system reflects an athletic, clean, and community-centered identity:

* **Official Brand Colors**:
  * Primary Green: `#205823` (Brand anchor, primary actions, focused elements)
  * Primary Gold: `#F5D025` (Badges, accents, highlights)
  * Dark Gold: `#B99531` (High-contrast gold accents on light surfaces)
  * Canvas Background: `#FAFAF8` (Warm, non-fatiguing light neutral)
  * Surface White: `#FFFFFF` (Card and modal containers)
  * Text (Neutral Dark): `#172019` (High readability, WCAG 2.2 AA compliant)
  * Muted Text: `#5F6B61` (Secondary metadata and labels)
  * Border: `#DDE3DE` (Subtle dividers)
* **Typography**: Clean sans-serif using **Inter** with display and body scale.
* **Mobile-First UX**: Responsive layouts, large touch targets (minimum 44px), and zero horizontal overflow.
* **Accessibility Target**: WCAG 2.2 Level AA compliance, visible keyboard focus rings, semantic HTML, and screen-reader considerations.
* **Brand Asset**: The official logo (`public/images/MVA Official Logo.png`) is preserved in its exact aspect ratio.

---

## 10. Development Guidelines

All contributors and AI agents must read [GEMINI.md](file:///c:/nextjs-projects/ts/mva/GEMINI.md) before writing code.

1. **Database Preservation**: Never run destructive database operations or drop existing tables.
2. **Security**: Never commit secrets, service-role keys, or `.env` files.
3. **Commit Convention**: Use conventional commits (`feat: ...`, `fix: ...`, `chore: ...`, `docs: ...`, `refactor: ...`).
4. **Changelog**: Update [CHANGELOG.md](file:///c:/nextjs-projects/ts/mva/CHANGELOG.md) for meaningful milestones and architecture updates.
5. **Git Push Policy**: Do not automatically push commits to GitHub. Push only when explicitly requested by the project owner.

---

## 11. Project Roadmap

* **Phase 01 — Database & Architecture** `[Complete]`
  * Supabase PostgreSQL schema, relational constraints, enums, triggers, test data.
* **Phase 02 — Next.js + Prisma Connection** `[Complete]`
  * Prisma 7 configuration, driver adapters, introspection, live query verification.
* **Phase 03 — Design System & UI/UX** `[Current Phase]`
  * Brand tokens, foundation components, application shell, responsive navigation, demo page.
* **Phase 04 — Public Team Registration** `[Planned Next]`
  * Multi-step registration flow (League & Category, Team Information, Roster, Review & Submit).
* **Phase 05 — Admin Management** `[Planned]`
* **Phase 06 — League Operations** `[Planned]`
* **Phase 07 — Matches & Results** `[Planned]`
* **Phase 08 — Statistics & Standings** `[Planned]`

---

## 12. License

The licensing decision for this project is currently not specified.
