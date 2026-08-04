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
- Push all commits to the correct remote branch.

2. Database
- Verify there are pending migrations.
- Run all pending Supabase migrations against the linked project.
- Confirm every migration completed successfully.
- Verify local and remote migration history match.

3. Edge Functions
- Detect any modified or newly created Edge Functions.
- Deploy every function that needs deployment.
- Verify deployment succeeded.
- Do not redeploy unchanged functions unnecessarily.

4. Database Verification
After migrations complete:
- Verify new username generation exists.
- Verify existing usernames were migrated.
- Verify unique username constraint exists.
- Verify username validation constraint exists.
- Verify anonymous chat privacy migrations are present.
- Confirm all expected migrations are now live.

5. Smoke Test
Run appropriate verification commands:
- Ensure TypeScript still passes.
- Ensure there are no pending migrations.
- Ensure git working tree is clean.
- Ensure no files remain uncommitted.

6. Final Report

Return:
- Git commits created
- Branch pushed
- Migrations deployed
- Edge functions deployed
- Any warnings
- Final deployment status

Do not modify application logic unless deployment reveals a real issue requiring a fix. If any deployment fails, stop, explain why, fix only that deployment issue, and continue.
