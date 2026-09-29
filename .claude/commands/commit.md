---
description: Deploy all completed work (git, Supabase migrations, edge functions) and leave the repo + project fully synchronized
---

# Final Deployment & Git Cleanup

Goal:
Deploy all completed work from the recent phases and leave the repository and Supabase project fully synchronized.

Tasks:

1. Git
- Review all uncommitted changes.
- Verify there are no accidental files, secrets, temporary files, or debug code.
- Stage everything that belongs to these completed phases.
- Create logical commit(s) with clear commit messages.
- If a commit relates to a `ROADMAP.md` item, update `ROADMAP.md` in that same commit (status, commit hash, move to Done / Waiting on a store build).
- Push all commits to the correct remote branch.

2. Database
- Check whether there are pending migrations.
- Run all pending Supabase migrations against the linked project.
- Confirm every migration completed successfully.
- Verify local and remote migration history match.

3. Edge Functions
- Detect any modified or newly created Edge Functions.
- Deploy every function that needs deployment.
- Verify deployment succeeded.
- Do not redeploy unchanged functions unnecessarily.

4. Database Verification
For each migration applied in this run (skip this step if none were):
- Verify every object it creates or changes exists live (tables, columns, constraints, indexes, functions, triggers, policies, views) — query the catalog read-only.
- For any new or replaced `SECURITY DEFINER` function: confirm `search_path` is set and EXECUTE is revoked from `PUBLIC`/`anon`/`authenticated` unless a grant is intended.
- For any new or changed RLS policy on a write table: confirm it uses `auth.uid()` and never `USING (true)` / `WITH CHECK (true)`.
- For data backfills: spot-check that existing rows were migrated.
- Confirm nothing an installed app build still uses was renamed or dropped.
- For an Edge Function that depends on a new migration, deploy the migration first, then call the function once to confirm it responds correctly.

5. Smoke Test
Run appropriate verification commands:
- Ensure TypeScript still passes.
- Ensure there are no pending migrations.
- Ensure tests still pass.
- Ensure git working tree is clean, except files the user explicitly excluded (list them in the report).

6. Final Report

Return:
- Git commits created
- Branch pushed
- Migrations deployed
- Edge functions deployed
- Any warnings
- Final deployment status

Do not modify application logic unless deployment reveals a real issue requiring a fix. If any deployment fails, stop, explain why, fix only that deployment issue, and continue.
