# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Bidirectional Gmail contacts synchronization tool using Google Apps Script. Two Gmail accounts each run an identical script that exports contacts as JSON to Google Drive, then reads and intelligently merges the other account's contacts. All code is in French.

## Architecture

**Runtime:** Google Apps Script (V8 engine, server-side JavaScript)
**API:** People API v1 (Advanced Service) — `People.People.*`, `People.ContactGroups.*`
**Other services:** DriveApp, MailApp, ScriptApp, Session, UrlFetchApp, PropertiesService
**No build system, package manager, linter, or automated tests.**

### Key Files

- `ContactSync_Advanced.gs` — Main script. Contains all sync logic, fusion, duplicate detection, contact groups sync, backup, and reporting.
- Documentation files (all in French): `README.md`, `GUIDE_INSTALLATION.md`, `FUSION_INTELLIGENTE.md`, `AMELIORATIONS_CRITIQUES.md`, `CONTACTS_SANS_EMAIL.md`, `GUIDE_SECURITE.md`, `RECHERCHE_API_GOOGLE.md`, `VERIFICATION_FINALE.md`

### Data Flow

```
Account A → exports contacts + groups JSON (v2) to Drive → Account B reads, maps groups, translates memberships & merges
Account B → exports contacts + groups JSON (v2) to Drive → Account A reads, maps groups, translates memberships & merges
```

Each sync: auto-backup (1/day) → export → import → map groups → translate memberships → merge → update → email report.

### People API Usage

- **List contacts:** `People.People.Connections.list('people/me', {personFields: PERSON_FIELDS, pageSize: 1000})` with pagination
- **Create:** `People.People.createContact(person, {personFields: ...})` — without memberships (added post-creation)
- **Update:** `People.People.updateContact(person, resourceName, {updatePersonFields: '...'})`  — requires fresh `etag`, without memberships
- **Photos:** `People.People.updateContactPhoto({photoBytes: base64}, resourceName)` — separate call
- **Memberships:** `People.ContactGroups.Members.modify({resourceNamesToAdd: [...]}, groupResourceName)` — post create/update
- **Contact Groups:** `People.ContactGroups.list()`, `People.ContactGroups.create()` — for group mapping
- **Field types:** string-based (`'mobile'`, `'home'`, `'work'`, `'other'`) — no `ContactsApp.Field.*`
- **Notes:** stored as `biographies[0].value` with `contentType: 'TEXT_PLAIN'`
- **Single-value fields:** `genders` — API rejects multiple values per source

### Core Algorithms

**Contact matching priority:** email (normalized) → phone (normalized) → name (normalized) → organization. Contacts with none of these are skipped.

**Intelligent fusion:** ALL fields are merged without data loss. Dedicated fusion for names, phones, emails, addresses, organizations, notes, birthdays, photos. Generic fusion (`fusionnerChampsGenerique`) for all other fields (nicknames, relations, events, urls, etc.) — union without duplicates via JSON comparison. Single-value fields (`genders`) keep one entry only.

**All 25 People API fields** are read and synced: names, emailAddresses, phoneNumbers, addresses, biographies, photos, organizations, birthdays, nicknames, relations, events, urls, imClients, userDefined, externalIds, calendarUrls, sipAddresses, locations, occupations, interests, skills, genders, memberships, miscKeywords, clientData.

**Contact groups sync:** Groups are exported alongside contacts (v2 format). On import, source groups are matched to local groups by name, missing user groups are created. Membership IDs are translated from source→local before sync. System group `myContacts` is ignored (auto-assigned). Memberships are added via `ContactGroups.Members.modify` (not via createContact/updateContact which causes "entity not found" errors).

**Phone normalization:** strips formatting, converts `00` → `+`, adds `+33` for French numbers starting with `0`, validates ≥3 digits (supports short numbers).

**API throttling:** `appelAvecRetry()` adds 100ms delay between API calls + retry with 30s/60s backoff on quota exceeded.

**Execution time guard:** `tempsDepasse()` checks elapsed time. Limit adapts to account type: 5 min for free accounts (6-min Apps Script limit), 28 min for Workspace/pro accounts (30-min limit). Controlled via `COMPTE_PRO` script property.

**Sync progress persistence:** When interrupted by time limit, `syncDirection` saves processed contact keys to `sync_progress.json` on Drive. Next run loads and skips already-processed contacts (instant, 0 API calls). Progress expires after 24h. Deleted automatically when sync completes fully.

**Change detection before API calls:** `mettreAJourContact` runs all fusion checks first (Phase 1, no API calls). If no changes detected, returns `false` immediately. Only fetches fresh etag + updates when changes exist (Phase 3). This avoids wasting 2+ API calls per unchanged contact.

**Conflict resolution:** `CONFIG.STRATEGIE_CONFLIT` — `'merge'` (default, combines all data) or `'recent'` (last modified wins).

### Configuration

Config externalized via `PropertiesService.getScriptProperties()`:
```javascript
COMPTE_SECONDAIRE: 'other-account@gmail.com'  // required — set via configurerCompte() or Project Settings
EMAIL_RAPPORT: 'your-gmail@gmail.com'          // recommended (avoids DMARC blocks on custom domains)
COMPTE_PRO: 'true'                             // 'true' for Workspace (28 min limit), omit or 'false' for free (5 min limit)
```

Other settings in `CONFIG` object in code (PREFIX_NOTES, DEBUG_MODE, STRATEGIE_CONFLIT, etc.).

### Drive Export Format

**v2 (current):** `{ version: 2, contacts: [...], groupes: [...] }`
**v1 (legacy):** raw array of contacts — import function handles both formats.

### Testing & Debugging

Run these functions directly in the Apps Script editor:
- `simulerSynchronisation()` — dry-run showing what would change
- `creerSauvegardeSecurite()` — manual backup (auto: 1/day, keeps last 7)
- `configurerCompte()` — one-time setup of script properties
- `configurerSyncDrive()` — sets up daily automatic trigger
- `syncViaGoogleDrive()` — manual sync execution

Set `CONFIG.DEBUG_MODE = true` for detailed console logging.

## Conventions

- All code, comments, variable names, function names, and documentation are in **French**
- **No data loss** — all fields are merged (union), never overwritten or deleted
- No deletions during sync — only additions and updates
- Auto-backups: 1 per day max, last 7 kept (= 7 days of history)
- Email reports sent after each sync cycle (via `envoyerRapport()` with try/catch for DMARC)
- Memberships handled via `ContactGroups.Members.modify`, never via `createContact`/`updateContact`
- Error handling: individual contact errors don't block sync (try/catch per contact in `syncDirection`)
- "Not found" contacts are logged as warnings and skipped
- Notes fusion never adds timestamps (avoids infinite sync loops where every contact is marked modified)
- Sync progress saved to `sync_progress.json` on Drive when interrupted; loaded on next run to skip already-processed contacts
