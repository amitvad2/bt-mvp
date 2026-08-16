# Deployment Safety

## Firebase Project Aliases

The `.firebaserc` file has two project aliases:
- `default` → `bt-mvp-prod` (PRODUCTION)
- `dev` → `bt-mvp-dev-eu` (DEVELOPMENT)

## Critical Rule: Always Target the Correct Project

When providing Firebase CLI commands (deploy rules, indexes, storage rules, etc.):

1. **Always check** which project is the active target before suggesting deploy commands.
2. **Always explicitly include `--project bt-mvp-dev-eu`** for dev deployments, or remind the user to run `firebase use dev` first.
3. **Never suggest bare `firebase deploy` commands** without specifying the project — the default alias points to production.
4. **For production deploys**, explicitly confirm with the user that they intend to deploy to prod.

### Example Safe Commands

```bash
# Deploy to DEV (always explicit)
firebase deploy --only firestore:rules --project bt-mvp-dev-eu
firebase deploy --only firestore:indexes --project bt-mvp-dev-eu

# Deploy to PROD (only after user confirms intent)
firebase deploy --only firestore:rules --project bt-mvp-prod
firebase deploy --only firestore:indexes --project bt-mvp-prod
```
