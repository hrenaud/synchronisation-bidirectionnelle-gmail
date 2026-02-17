# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Bidirectional Gmail contacts synchronization tool using Google Apps Script. Two Gmail accounts each run an identical script that exports contacts as JSON to Google Drive, then reads and intelligently merges the other account's contacts. All code is in French.

## Architecture

**Runtime:** Google Apps Script (V8 engine, server-side JavaScript)
**API:** People API v1 (Advanced Service) — `People.People.*`
**Other services:** DriveApp, MailApp, ScriptApp, Session, UrlFetchApp
**No build system, package manager, linter, or automated tests.**

### Key Files

- `ContactSync_Advanced.gs` — Main script. Contains all sync logic, fusion, duplicate detection, backup, and reporting.
- Documentation files (all in French): `README.md`, `GUIDE_INSTALLATION.md`, `FUSION_INTELLIGENTE.md`, `AMELIORATIONS_CRITIQUES.md`, `CONTACTS_SANS_EMAIL.md`, `GUIDE_SECURITE.md`, `RECHERCHE_API_GOOGLE.md`, `VERIFICATION_FINALE.md`

### Data Flow

```
Account A → exports contacts JSON to Drive → Account B reads & merges
Account B → exports contacts JSON to Drive → Account A reads & merges
```

Each sync: auto-backup → export → import → merge → update → email report.

### People API Usage

- **List contacts:** `People.People.Connections.list('people/me', {personFields: PERSON_FIELDS, pageSize: 1000})` with pagination
- **Create:** `People.People.createContact(person, {personFields: ...})`
- **Update:** `People.People.updateContact(person, resourceName, {updatePersonFields: '...'})`  — requires fresh `etag`
- **Photos:** `People.People.updateContactPhoto({photoBytes: base64}, resourceName)` — separate call
- **Field types:** string-based (`'mobile'`, `'home'`, `'work'`, `'other'`) — no `ContactsApp.Field.*`
- **Notes:** stored as `biographies[0].value` with `contentType: 'TEXT_PLAIN'`

### Core Algorithms

**Contact matching priority:** email (normalized) → phone (normalized) → name (normalized). Contacts with none of these are skipped.

**Intelligent fusion (`fusionnerDeuxContacts`):** Keeps the most complete name, unions all unique phones/emails/addresses (after normalization), copies missing photos, combines notes. Never deletes data.

**Phone normalization:** strips formatting, converts `00` → `+`, adds `+33` for French numbers starting with `0`, validates ≥3 digits (supports short numbers).

**Conflict resolution:** `CONFIG.STRATEGIE_CONFLIT` — `'merge'` (default, combines all data) or `'recent'` (last modified wins).

### Configuration

All config is in the `CONFIG` object at the top of the `.gs` file. The only required setting:
```javascript
COMPTE_SECONDAIRE: 'other-account@gmail.com'
```

### Testing & Debugging

Run these functions directly in the Apps Script editor:
- `simulerSynchronisation()` — dry-run showing what would change
- `creerSauvegardeSecurite()` — manual backup
- `configurerSyncDrive()` — sets up daily automatic trigger
- `syncViaGoogleDrive()` — manual sync execution

Set `CONFIG.DEBUG_MODE = true` for detailed console logging.

## Conventions

- All code, comments, variable names, function names, and documentation are in **French**
- No deletions during sync — only additions and updates
- Auto-backups (last 7 kept) are created before each sync
- Email reports sent after each sync cycle
