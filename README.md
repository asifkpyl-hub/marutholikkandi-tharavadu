# മരുതോളിക്കണ്ടി തറവാട് — Cloudflare deployment

A no-build Cloudflare Workers + D1 family directory starter. Public visitors can view public member records; the admin and invited editors sign in to manage records. The browser print dialog provides PDF output (choose Save as PDF). Use the search field before printing to print a filtered view.

## Important before deployment

- This is a fresh deployment package. It does **not** contain a copy of the records currently held by the existing Higgsfield website. Export those records first and import/verify them before switching the public link.
- Keep the existing live site running until the replacement is fully tested.
- Free plans and limits are provider policies, not a lifetime hosting guarantee. Keep periodic D1 exports and a second offline copy.
- No custom domain is required; use the free `workers.dev` address.
- Do not commit passwords, `SETUP_KEY`, or `SESSION_SECRET` to Git.

## Requirements

- Node.js 20+
- A Cloudflare account
- npm

## 1. Install

```bash
npm install
npx wrangler login
```

## 2. Create the D1 database

```bash
npx wrangler d1 create marutholikkandi-family
```

Copy the returned `database_id` into `wrangler.toml`, replacing `REPLACE_WITH_DATABASE_ID`.

Apply the schema:

```bash
npm run db:migrate:remote
```

## 3. Set secrets

Generate long random values locally (do not reuse passwords):

```bash
openssl rand -hex 32
```

Set both values:

```bash
npx wrangler secret put SESSION_SECRET
npx wrangler secret put SETUP_KEY
```

Use a long random value for each. Keep the setup key temporarily; it is used only once to create the first admin.

## 4. Deploy

```bash
npm run deploy
```

Cloudflare prints the public `workers.dev` URL.

## 5. Create the first administrator

Use the URL shown by Wrangler. Replace `YOUR_SETUP_KEY` with the secret value. Do not share this request or the setup key.

```bash
curl -X POST "https://YOUR-WORKER.workers.dev/api/setup" \
  -H "content-type: application/json" \
  -H "x-setup-key: YOUR_SETUP_KEY" \
  -d '{"username":"familyadmin","display_name":"Family Administrator","password":"REPLACE_WITH_A_LONG_UNIQUE_PASSWORD"}'
```

The password must be at least 12 characters. Once the admin is created, remove the one-time setup secret:

```bash
npx wrangler secret delete SETUP_KEY
```

The admin can now sign in at the website and create editor accounts from the Editors tab. Share each editor's username and initial password privately. Editors can add and edit records; public visitors cannot.

## 6. Add family data

Sign in as admin and add members. Use parent selectors to connect generations. Set the public checkbox only for records intended for public display. Editor-created records are private by default in this starter; the admin can review and publish them.

For existing records, export them from the old app and convert them to the `family_members` columns in `migrations/0001_initial.sql`. Import only after reviewing names, parent IDs, Malayalam encoding, and visibility. Never overwrite the only copy of the original records.

## PDF

Use **കുടുംബവൃക്ഷം PDF** and choose **Save as PDF** in the browser print dialog. Search first to print a filtered subset. This starter renders member cards, not a graphical connector-line genealogy chart; a dedicated multi-generation chart and branch-specific PDF layout should be added after the actual family records and relationships are migrated and validated.

## Backups

Export the D1 database regularly:

```bash
npx wrangler d1 export marutholikkandi-family --remote --output=family-backup.sql
```

Store encrypted copies in at least two places. Test restoring a backup before relying on it.

## Security notes

- Passwords use PBKDF2-HMAC-SHA256 with 210,000 iterations and per-user random salts.
- Sessions are signed, HTTP-only, Secure, SameSite cookies with an eight-hour expiry.
- Set a strong random `SESSION_SECRET`; rotate it if compromised (this logs all users out).
- Use HTTPS only. Avoid public exposure of private addresses, phone numbers, sensitive dates, or information about living children.
- This is a starter implementation. Before putting sensitive family information online, add rate limiting / login lockout, CSRF protections for all mutation routes, a formal privacy review, and tested restore procedures.
