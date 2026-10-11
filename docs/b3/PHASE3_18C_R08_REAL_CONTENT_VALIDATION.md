# Phase 3.18C — reconstructed R08 real-content validation and PDF crash recovery

The original R08 acceptance criteria have not been recovered. This report records the reconstructed “representative live data” scope and a new defect reproduced with that data; it does not assert closure of the unknown original audit finding.

## Read-only representative snapshot

Captured from the approved public https://lokswami.com source at 2026-10-11T11:10:44.791Z using the existing snapshot parser and source safety allowlist. No production write methods were used.

- Eight complete article bodies across Business, Indore, Madhya Pradesh, National, Politics and Regional.
- Three breaking items, three videos, three shorts, two daily e-papers and one monthly e-magazine.
- Seventeen downloaded assets verified against manifest size and SHA-256.
- Three YouTube thumbnails returned text/html in this environment. They remain recorded as unavailable; no substitute content was introduced.
- PDF metadata: Indore edition (source 6aca0495308430529c579b17), 12 pages / 7,285,234 bytes; Mumbai edition (6ac9f09f308430529c57939d), 8 pages / 14,451,800 bytes; September magazine (6ab67a054962ca75c38e8294), 32 pages / 10,279,913 bytes. pdfinfo confirmed valid, unencrypted documents and matching page counts.

The snapshot, manifest, structured source data, unavailable-asset report, verification.json and six rendered page images are retained in the separate real-content validation packet. Source PDFs and videos are not committed into Git.

## Reproduced defect and scoped correction

The existing Linux PDF.js native canvas child process crashed on real publication pages with SIGABRT (invalid pointer / double free) and SIGSEGV. The parent process contained the crash, but rejected the page render. Synthetic PDF tests alone did not expose this failure. An explicit PDFium diagnostic render succeeded.

When the PDF.js child has exited with SIGABRT or SIGSEGV, the isolated boundary now starts one fresh process and retries that page with the already-installed local PDFium renderer. The enclosing render promise retains the existing mutex and original deadline throughout recovery. A PDFium crash is rejected without another retry. Validation errors, non-native process exit codes, memory checks and timeout behavior retain their existing paths. No dependency or default-engine selection changes.

## Validation

- All 17 PDF isolation tests passed: the previous 13 cases plus both native signals recovering a correct red image and both signals rejecting in the fallback engine.
- The platform-default path with this correction successfully rendered the first and last page of all three captured PDFs (six pages, width 1200). The diagnostic harness recorded native child crashes and successful fresh-process recovery. Worker status afterward: healthy, idle, queue length zero.
- Render durations: 2.191–4.696 seconds per sampled page in this environment. These are diagnostic timings, not production performance measurements.
- Typecheck, lint and integrated CI results are recorded on the PR and final checklist.

## Remaining acceptance gates

This sample does not prove all 52 publication pages, browser appearance, real provider playback, four-role CMS workflows, Mongo-backed staging imports, migration/rollback, screen-reader behavior or field Core Web Vitals. Those require the configured isolated acceptance environment and remain explicit gates. R06 is still unidentified and is not replaced by this newly reproduced PDF defect.

