AGENTS.md
Project: Kids Story App (V1)

This repository contains a multi-tenant family storytelling app built with:

Next.js (App Router)

Supabase (Auth + Postgres + RLS)

Tailwind CSS

TypeScript (strict mode)

The goal of V1 is to support:

One Universe per family

Invite-only membership

Roles: parent, grandparent, kid

Story creation wizard

Permanent library

Read-only share links

Core Architectural Principles
1. Supabase is the source of truth

All data lives in Supabase Postgres.

Row Level Security (RLS) enforces multi-tenancy.

Never bypass RLS in client code.

Never expose service role keys to the browser.

2. Multi-Tenant Isolation

A user may only access data in universes where they have membership.

Do not:

Query by universe_id from client alone.

Assume client-provided universe_id is trustworthy.

Always:

Rely on RLS enforcement.

Validate via server-side Supabase client when performing privileged operations.

3. Migrations Only

All schema changes must:

Be written as SQL migrations in:
supabase/migrations/

Be idempotent only if absolutely necessary.

Never modify schema directly in the dashboard without a migration.

When updating schema:

Create a new migration file.

Do not edit old migration files.

Assume migrations are production history.

Allowed Commands

Codex may run:

npm run dev

npm run build

npm run lint

npm run typecheck

supabase db push

Codex must NOT:

Run destructive OS-level commands.

Delete unrelated directories.

Modify files outside this repository.

Expose environment variables in logs.

Environment Variables

The following may exist locally:

NEXT_PUBLIC_SUPABASE_URL

NEXT_PUBLIC_SUPABASE_ANON_KEY

SUPABASE_SERVICE_ROLE_KEY (server only)

OPENAI_API_KEY (optional for story generation)

Rules:

Never leak secrets to client components.

Service role key must only be used server-side.

If an API key is missing:

Stub the feature so the app still builds and runs.

Coding Standards

Use strict TypeScript.

Prefer Server Actions for writes.

Use Zod for validating user input.

Never trust client data blindly.

Fail fast with clear error messages.

Story Generation Rules (V1)

If LLM key exists:

Generate title + story content.

If LLM key missing:

Return deterministic placeholder story.

Do not crash the build.

Store:

Prompt as JSON

Content as text

Status defaults to "approved"

Definition of Done (Feature Work)

A feature is complete when:

It compiles

It passes lint

It typechecks

It respects RLS

It does not introduce security regressions

It does not break existing routes

What NOT to Do

Do not:

Re-architect the app without instruction

Add unnecessary dependencies

Convert server components to client components unnecessarily

Bypass RLS for convenience

Expose private data in share routes

Build Order Priority

When implementing features:

Data layer correctness

Security (RLS + role enforcement)

Server logic

UI

Polish

Never build UI first if backend logic is incomplete.

If Uncertain

If requirements are ambiguous:

Choose the simplest secure implementation.

Document assumptions in a comment.

Do not over-engineer.

Tone & Behavior

Act as a senior staff engineer:

Small safe changes

Incremental commits

Clear reasoning

No dramatic rewrites

Production-grade mindset