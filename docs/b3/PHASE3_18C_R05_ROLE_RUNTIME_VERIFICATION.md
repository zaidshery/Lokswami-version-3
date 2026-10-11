# Phase 3.18C R05 — publication role guidance correction

## Recovered finding and reproduction

Earlier audit records recovered on 11 October 2026 identify a discrepancy: Copy Editor/Admin guidance promises E-Paper/E-Magazine preparation/release while runtime publication pages/actions are Super Admin only. The full audit text was not available verbatim. PR #38's reconstructed role-contract verification did not inspect this stale guidance sufficiently and did not close the discrepancy.

The mismatch is reproduced in lib/admin/roleWorkflowGuide.ts and the Markdown/HTML/PDF role SOP: Copy Editor was told to prepare publication pages/OCR/hotspots; Admin was told to upload/release issues. Compare lib/auth/permissions.ts PAGE_ACCESS and canCreateEpaper/canEditEpaper/canPrepareEpaperForPublish/canManageEpaperAssignments/canPublishEpaper/canDeleteEpaper, the publication service guards, protected page boundaries and existing permission tests.

## Authoritative contract and scoped correction

The established runtime permissions and their regression coverage define Super Admin-only publication CMS access. Guidance now follows that contract. Permission grants are not expanded.

| Publication CMS action (both E-Paper and E-Magazine) | Reporter | Copy Editor | Admin | Super Admin |
| --- | --- | --- | --- | --- |
| View desk/edition/issue | No | No | No | Yes |
| Upload/create and edit metadata | No | No | No | Yes |
| Edit pages, OCR and hotspots | No | No | No | Yes |
| Assign/prepare for release | No | No | No | Yes |
| Release/publish and archive/delete | No | No | No | Yes |

Copy Editor and Admin hand quality notes/requests to Super Admin; an editorial assignment does not grant publication CMS access. Normal article/story/video workflows keep their existing permissions. Public released reader pages remain accessible. E-Paper stays daily/edition-based and E-Magazine stays monthly.

The in-app workflow guide, Markdown SOP, HTML SOP and generated PDF agree on this policy. The PDF is regenerated from the corrected HTML and visually checked. Its print table spacing is adjusted only to retain the eight-page layout.

## Validation and remaining gate

Existing publication permission, API role guard, Super Admin page-boundary and workflow-guide suites validate the runtime matrix and corrected help text. A regression rejects the former Copy Editor publication-desk/OCR/hotspot instruction. Full CI/build/browser smoke and independent exact-head review are recorded on the PR.

Authenticated four-role publication workflows still require R06's verified isolated DB/media/outbound environment and QA credentials. Synthetic guard coverage does not establish live CMS UAT.
