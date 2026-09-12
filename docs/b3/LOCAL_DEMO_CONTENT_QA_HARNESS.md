# LokSwami B3 — Local Demo Content & QA Fixture Harness

## 1. Overview & Purpose

The **LokSwami B3 Local Demo Content & QA Fixture Harness** provides a safe, deterministic, and repeatable development and manual-QA dataset for the LokSwami news platform. 

It allows frontend, QA, and full-stack engineers to test all reader-facing surfaces (Header/Nav shell, Homepage, Article details, Video & Swipe Shorts feeds, E-Paper and Breaking News) with rich, realistic, Hindi-first news copy and stress-test fixtures without depending on production data, external third-party services, or manual administrative entry.

### Non-Production Classification
> [!IMPORTANT]
> **LOCAL DEVELOPMENT & QA ONLY**: This harness and all associated scripts (`demo:seed`, `demo:verify`, `demo:reset`) are strictly restricted to local and QA environments. They are blocked from ever running in production.

---

## 2. Strict Safety Model & Failure Modes

The harness enforces multiple layers of safety to guarantee zero risk of data loss, credential leakage, or accidental writes to production databases.

### Safety Invariants

1. **`NODE_ENV=production` Absolute Rejection**:
   If `NODE_ENV === 'production'`, the harness aborts immediately before any database or filesystem operation.
2. **Explicit Opt-In (`LOKSWAMI_DEMO_DATA=true`)**:
   Every invocation requires `LOKSWAMI_DEMO_DATA=true` to be present in the environment. If missing or false, execution halts.
3. **Safe Localhost Default**:
   MongoDB connections are allowed by default only when pointing to safe local hostnames:
   - `localhost`
   - `127.0.0.1`
   - `::1` (IPv6 loopback)
4. **Remote Mongo Double Opt-In & Database Name Confirmation**:
   Any remote MongoDB connection (including MongoDB Atlas or staging clusters) requires two explicit confirmations:
   - `LOKSWAMI_DEMO_REMOTE_MONGO=true`
   - `LOKSWAMI_DEMO_DB_NAME=<exact_database_name>`
   The harness parses the target database name from `MONGODB_URI` and ensures it **strictly matches** `LOKSWAMI_DEMO_DB_NAME`. If the database name cannot be parsed or does not match, the harness fails closed.
5. **Credential Protection**:
   Raw MongoDB connection strings, credentials, and authentication tokens are never printed to console logs or error messages.
6. **No Unscoped Deletion**:
   Destructive database operations (`dropDatabase()`, `dropCollection()`, or unscoped `deleteMany({})`) are strictly prohibited and verified via automated static analysis. Reset operations are restricted to deterministic demo fixture IDs (`0000000000000000000000xx`) and `demo-` prefixed slugs.

---

## 3. Persistence Modes & Store Selection

The harness respects LokSwami's frozen domain boundaries and handles persistence according to the target environment:

| Condition | Selected Mode | Behavior |
| :--- | :--- | :--- |
| `MONGODB_URI` is absent | **Local File Store (`file`)** | Uses supported JSON file stores (`data/articles.json`, `data/videos.json`, `data/epapers.json`). |
| `MONGODB_URI` is configured & connects | **MongoDB Development (`mongo`)** | Uses development MongoDB collections via Mongoose models and domain repositories. |
| `MONGODB_URI` is configured but fails | **ABORT (No Silent Fallback)** | Throws an error and halts execution. |

### Why Configured Mongo Failure Aborts Rather Than Falling Back
> [!CAUTION]
> When an engineer configures `MONGODB_URI`, they expect to test production-like MongoDB behavior (indexes, transactions, `releasedSnapshot` lifecycle). If the harness silently fell back to JSON files upon connection error, the engineer would unknowingly test file storage instead of MongoDB. Demo tooling therefore fails loudly and immediately if a configured target is unreachable.

---

## 4. Domain Boundaries vs Generic Dual-Persistence

The harness coordinates fixture creation across domains, but does **not** introduce a competing dual-persistence architecture. It delegates all operations to existing domain service and repository contracts:

- **Content Domain**: `newsroomArticleRepository` / `publicArticleService`
- **Video Domain**: `VideoRepository` / `VideoService`
- **E-Paper Domain**: `EpaperRepository` / `EpaperService`

---

## 5. Fixture Inventory

All demo fixtures use deterministic Mongo ObjectIds (`0000000000000000000000xx`) and URL slugs prefixed with `demo-`.

### Articles (20 Fixtures)
The article dataset covers all 8 platform categories (`madhya-pradesh`, `national`, `politics`, `business`, `sports`, `entertainment`, `lifestyle`, `crime`) and includes typographic stress variants:

1. `demo-madhya-pradesh-metro-expansion`: Lead MP story, standard length.
2. `demo-national-highway-inauguration`: National infrastructure lead.
3. `demo-business-indore-startups-funding`: Business sector report.
4. `demo-sports-ranji-trophy-mp-victory`: Sports coverage.
5. `demo-politics-assembly-session-budget`: Political developments.
6. `demo-lifestyle-ujjain-heritage-tourism`: Cultural and tourism feature.
7. `demo-entertainment-bhopal-film-festival`: Arts & culture report.
8. `demo-crime-cyber-crime-prevention-drive`: Law enforcement update.
9. `demo-breaking-indore-traffic-diversion-morning`: Short breaking news variant (6 words).
10. `demo-breaking-weather-alert-madhya-pradesh-long`: Long breaking news variant (24 words).
11. `demo-breaking-extreme-emergency-multiline`: Extreme breaking news variant (48 words, multiline wrap).
12. `demo-stress-short-headline`: Ultra-short headline stress case.
13. `demo-stress-long-headline`: Very long headline with multiple sub-clauses (180 characters).
14. `demo-stress-long-summary`: Extended summary stress test (500+ characters).
15. `demo-stress-no-image`: Fallback placeholder verification (no image provided).
16. `demo-stress-long-body`: Extended editorial content with deep heading hierarchy (3000+ words).
17. `demo-stress-zero-views`: Reader UI display with 0 views.
18. `demo-stress-large-views`: Reader UI display with high formatted view counts (1,250,000+ views).
19. `demo-stress-english-mixed-script`: Mixed Devanagari / Latin script typography verification.
20. `demo-stress-search-density`: Search indexing keyword density stress case.

### Videos (7 Fixtures)
Landscape (16:9) video fixtures with realistic durations (45s to 18m) and Hindi metadata:
- State budget analysis, highway drone footage, Indore startup documentary, sports highlights, Ujjain temple documentary, cyber security guide, tech spotlight.

### Swipe Shorts (8 Fixtures)
Vertical (9:16) video fixtures for the mobile swipe experience:
- Weather alert, gold price update, cricket winning shot, political press bite, street food spotlight, traffic update, startup tip, heritage snippet.

#### Swipe Short Publication Invariant
> [!IMPORTANT]
> **No Orphan Shorts**: LokSwami's frozen video contract requires every published Swipe short to link to a publicly published Article (`articleId`). Every demo short is linked to a deterministic published demo article (`000000000000000000000001` through `000000000000000000000008`).

### E-Paper & E-Magazine Fixtures
- **Indore Edition (Published)**: Released edition with 2 pages and interactive hotspot article coordinates. In Mongo mode, includes full `releasedSnapshot` lifecycle data.
- **Ujjain Edition (Draft)**: Unpublished draft edition for verification of administrative isolation.
- **E-Magazine (Mongo Mode Only)**: 4-page monthly feature edition.

#### Mode Capability Boundary
- In **Mongo Mode**: Full support for E-Paper, E-Magazine, and `EPaperArticle.releasedSnapshot`.
- In **File Mode**: Only standard newspaper editions (`StoredEPaper`) are seeded. E-Magazine and story-level snapshots are reported as `SKIPPED — unsupported by current file-store contract` and are not treated as failures.

---

## 6. Breaking News Contract

Breaking News does **not** use a separate entity; it is an `Article` record with `isBreaking: true` and `workflow.status: 'published'`.
- The public reader ticker resolves breaking news via `publicArticleService.getBreakingArticles()`.
- Automated TTS generation is disabled. Demo fixtures use local audio paths where applicable or exercise layout/ticker typography without audio.

---

## 7. Scenarios

The harness supports targeted scenarios for focused QA:

| Scenario | Description | Fixture Counts |
| :--- | :--- | :--- |
| `full` | Complete platform dataset (default) | 20 Articles, 7 Videos, 8 Shorts, 2 EPapers, 1 Magazine |
| `shell` | Reader Navigation & Header QA | 20 Articles, 1 Short Breaking, 6 Videos, 6 Shorts, 1 EPaper, 1 Magazine |
| `homepage` | Reader Homepage layout QA | 16 Articles, 6 Videos, 6 Shorts, 1 EPaper, 1 Magazine |
| `article` | Article typography & edge-case QA | 20 Articles (all stress variants) |
| `video` | Video and Shorts swipe feeds QA | 10 Articles, 7 Videos, 8 Shorts |
| `epaper` | E-Paper and Magazine reader QA | 2 EPapers (Indore released, Ujjain draft), 1 Magazine |
| `breaking-short` | Single short breaking headline ticker | 20 Articles (1 active short breaking) |
| `breaking-long` | Extended multiline breaking ticker | 20 Articles (1 active long breaking) |

---

## 8. CLI Usage Guide

All commands are executed from the workspace root. Ensure `LOKSWAMI_DEMO_DATA=true` is set:

### Windows PowerShell
```powershell
$env:LOKSWAMI_DEMO_DATA="true"
npm run demo:seed
npm run demo:verify
npm run demo:reset
```

### Linux / macOS / Bash
```bash
export LOKSWAMI_DEMO_DATA=true
npm run demo:seed
npm run demo:verify
npm run demo:reset
```

### Seeding a Specific Scenario
```bash
npm run demo:seed -- --scenario=shell
npm run demo:seed -- --scenario=homepage
npm run demo:seed -- --scenario=article
npm run demo:seed -- --scenario=video
npm run demo:seed -- --scenario=epaper
npm run demo:seed -- --scenario=breaking-short
npm run demo:seed -- --scenario=breaking-long
```

### Dry Run Mode (Preview Changes)
```bash
npm run demo:seed -- --dry-run
npm run demo:reset -- --dry-run
```

### Verifying Seeded Fixtures
```bash
npm run demo:verify
npm run demo:verify -- --scenario=shell
```

---

## 9. Reader Manual QA Checklists

### Shell & Navigation (`--scenario=shell`)
- [ ] Header masthead renders "लोकस्वामी" branding cleanly across breakpoints.
- [ ] Breaking news ticker displays active short headline with red tag.
- [ ] Desktop navigation links (`मध्य प्रदेश`, `देश`, `राजनीति`, `ई-पेपर`, etc.) navigate correctly.
- [ ] Mobile drawer navigation opens smoothly with accessible focus trapping.
- [ ] Theme switcher toggles light and dark modes cleanly.

### Homepage Grid (`--scenario=homepage`)
- [ ] Hero article card displays Hindi headline, summary, and thumbnail without text clipping.
- [ ] Secondary article grid adapts responsively (1 col mobile, 2 col tablet, 3-4 col desktop).
- [ ] Category news sections display relevant items.
- [ ] Video carousel displays 16:9 thumbnails and durations.
- [ ] E-Paper widget displays current Indore edition thumbnail and link.

### Article Reader Details (`--scenario=article`)
- [ ] Check `demo-stress-short-headline`: Header typography remains balanced.
- [ ] Check `demo-stress-long-headline`: Headline wraps cleanly without overlapping metadata.
- [ ] Check `demo-stress-no-image`: Fallback placeholder SVG renders gracefully.
- [ ] Check `demo-stress-long-body`: Deep headings (H2-H4), blockquotes, lists render properly.
- [ ] Check `demo-stress-english-mixed-script`: Font rendering of mixed Hindi/English looks natural.
- [ ] Check `demo-stress-large-views`: View counter formats large numbers correctly.

### Video & Swipe Shorts (`--scenario=video`)
- [ ] Video feed displays 16:9 cards with duration badge.
- [ ] Shorts feed displays 9:16 vertical cards.
- [ ] Clicking a Short opens the full-screen swipe view.
- [ ] Swiping up/down moves to the next/previous short.
- [ ] "संबंधित खबर" (Related News) button in Short viewer navigates to the linked demo article.

### E-Paper Reader (`--scenario=epaper`)
- [ ] Indore published edition is accessible and displays Page 1.
- [ ] Clicking hotspot areas highlights the story boundaries.
- [ ] Clicking a story opens the story detail modal.
- [ ] Draft Ujjain edition is **not** visible in the public archive.
- [ ] (Mongo mode) Monthly magazine edition displays cleanly.

---

## 10. Troubleshooting & FAQ

**Q: `demo:seed` aborts with `Refusing to run demo seeding: NODE_ENV=production`.**
*A*: You are running in a production environment or have `NODE_ENV=production` set. The demo harness is forbidden in production. Switch to `NODE_ENV=development`.

**Q: `demo:seed` aborts with `Refusing to run demo seeding: LOKSWAMI_DEMO_DATA=true is required`.**
*A*: Set the environment variable before running: `$env:LOKSWAMI_DEMO_DATA="true"` (PowerShell) or `export LOKSWAMI_DEMO_DATA=true` (Bash).

**Q: `demo:seed` aborts with `Refusing to target remote MongoDB without explicit opt-in`.**
*A*: If you intentionally intend to seed a non-localhost development database, you must supply both `$env:LOKSWAMI_DEMO_REMOTE_MONGO="true"` and `$env:LOKSWAMI_DEMO_DB_NAME="<exact_db_name>"`.

**Q: `demo:seed` aborts with `Configured MONGODB_URI failed to connect`.**
*A*: MongoDB was configured but is unreachable. Check your local MongoDB service or connection string. To use file-backed storage instead, clear the `MONGODB_URI` environment variable.

**Q: Why does E-Magazine show as `SKIPPED` in file mode?**
*A*: Under the frozen Architecture specification, file-backed storage only supports standard newspaper editions (`StoredEPaper`). E-Magazines and release snapshots require MongoDB.
