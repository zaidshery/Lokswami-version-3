# Lokswami Newsroom CMS - Role SOP

Version: 1.2
Reviewed against the CMS: 4 August 2026
Publication permissions reviewed against runtime: 11 October 2026
Audience: Super Admin, Admin, Copy Editor, and Reporter

This is the daily operating guide for the Lokswami newsroom CMS. Menu names and
workflow actions below match the role-aware CMS. A staff member should only see
the tools allowed for their assigned role.

## 1. Sign in and orient yourself

1. Open `https://lokswami.com/signin?redirect=/admin` (or the equivalent staging
   domain supplied by the newsroom).
2. Sign in with your staff login ID/email and password, or the approved Google
   account when that option is enabled.
3. Confirm the panel name and role badge at the top of the CMS.
4. Use the language and light/dark theme controls if needed.
5. On mobile, use the bottom dock for daily tools and the menu button for the
   complete role-authorized navigation.

Never share a staff login. Lock or sign out of a shared device when leaving it.

## 2. The newsroom handoff

```text
REPORTER                   COPY EDITOR                    ADMIN
Create story package  ->   Claim/start review       ->   Assign/approve
Save draft                Proofread and fact-check      Schedule/publish
Submit for review         Request changes or            Push/share/monitor
Revise if returned        mark ready for approval
```

Normal workflow states:

```text
Draft -> Submitted -> Assigned/In Review -> Copy Edit -> Ready for Approval
      -> Approved -> Scheduled or Published
```

Exception paths:

- `Changes Requested`: the reporter revises and submits again.
- `Rejected`: the Reporter cannot reopen it directly; Admin must return it to an
  editable state before correction and resubmission.
- `Archived`: the content is removed from the active workflow.

## 3. Draft safety and recovery

Article editing uses both local browser recovery and server autosave.

- Watch the save-status chip. `Saved` is the safest point to leave the page.
- Use **Save draft** or `Ctrl+S` / `Cmd+S` before a handoff or long pause.
- The same browser tab resumes its own current draft quietly.
- A draft from another tab/session shows one inline notice: **Browser recovery
  copy available**.
  - Choose **Restore recovery copy** when that copy contains work you need.
  - Choose **Discard old copy** when it is stale or already replaced.
  - The form and publish actions stay locked until this choice is resolved.
- Inserting an image or table is an editor action; it should not submit the form
  or repeatedly show the recovery notice.
- Wait for image/audio upload completion before submitting or closing the tab.
- If the CMS reports a version conflict, stop. Open the saved draft, compare the
  two versions, and reload the latest article before changing workflow status.

## 4. Reporter SOP

### What the Reporter sees

- **Dashboard**
- **My Work**
- **My Stories**
- **Media** (the Reporter's own image library)

The Reporter creates story packages, edits only their own/assigned work in
editable stages, responds to change requests, and submits to the desk. The
Reporter does not publish and does not use Articles, Copy Desk, Team, Analytics,
Push Alerts, or Settings.

### Create and submit a story

1. Open **My Stories** -> **New Story**.
2. Add the reporting package. The signed-in Reporter is assigned as author:
   - Story Title
   - Video Script/caption
   - Category
   - Location Tag
   - Reporter Notes and Source Info
   - Mark **Source is confidential** when the source must remain internal
3. Upload at least one JPG/PNG/WEBP image and one MP4 video for the story package.
   Current limits are up to 5 images (5 MB each) and 10 videos (1.9 GB each).
   The first image becomes the cover.
4. Preview uploaded media. Replace or remove the wrong file before handoff.
5. Choose **Save Draft** when the package should remain private. Important: the
   current Story form still requires one image and one video before Save Draft;
   it is not a text-only recovery save.
6. Choose **Submit For Review** only when the package is complete and verified.
7. Check **My Stories** or **My Work** for the status, assignee, latest desk note,
   and next action. Submitted and later stages are read-only unless the desk
   returns the story as **Changes Requested**.

Reporter Story forms do not use browser autosave or the Article recovery notice.
Leaving before **Save Draft** or **Submit For Review** can lose unsaved form data.

### Respond to changes

1. Open the item marked **Changes Requested**.
2. Read the latest return reason and desk comment before editing.
3. Correct every requested item; do not delete confidential source context that
   the desk still needs.
4. Choose **Save Changes** first, preview the media again, then add an optional
   workflow note and choose **Submit For Review**.

### Create and send a quick article

1. Open **Article Create** from the CMS menu.
2. Enter the **Short title** and full **Body**.
3. Add any available images. Wait for every upload to finish; the first image
   becomes the featured image.
4. Choose **Send to Copy Editor** once.
5. Wait for **Article sent to the copy editor**, then follow its status in
   **My Work**.

The CMS assigns the signed-in Reporter as author, creates the summary, uses the
temporary category General, and submits the article to the desk. Copy
Editor/Admin completes category, quality, media details, SEO, and publication.
The quick Article screen does not have Save Draft, so do not close or refresh it
before sending.

### Reporter handoff checklist

- [ ] Names, numbers, dates, location, and spellings are verified.
- [ ] Source and rights/credit information are recorded.
- [ ] Confidential source information is marked internal.
- [ ] Image and video are the correct files and finish uploading.
- [ ] The script/caption matches the media.
- [ ] Reporter notes explain anything the desk must know.
- [ ] The story is submitted once; duplicate records are not created.

The Reporter can send a quick direct Article, but does not create the linked
full Article from a Story package. A claimed/assigned Copy Editor can use
**Write article from this story** during desk review; the separate **Create
Article** shortcut appears after approval/scheduling/publication. Copy
Editor/Admin completes linked-Article SEO, audio, and publication handoff.

## 5. Copy Editor SOP

### What the Copy Editor sees

- **Dashboard**, **My Work**, and **Copy Desk**
- **Articles**, **Stories**, **Videos**, and **Social Posts**
- **Media**

The Copy Editor can claim unassigned submitted work, edit assigned items, return
work for changes, and mark clean work ready for Admin approval. The Copy Editor
cannot publish, manage users, send push alerts, or open admin/system settings.
Social Posts is read-only for this role; generation, approval, and dispatch are
Admin/Super-Admin actions.

### Review a submitted item

1. Open **Copy Desk**.
2. Select an unassigned submitted item and choose **Claim Story**, or open an
   item already assigned to you and choose **Start Review**.
3. Open the item. Download reporter assets when required.
4. Review the full reporting package:
   - source, location, reporter notes, and confidentiality
   - headline/title and summary
   - names, figures, dates, quotations, and links
   - image/video relevance, crop, caption, alt text, and credit
5. Complete the copy-quality fields: proofread, fact-check status, headline
   status, image optimization status, and copy-editor notes.
6. Save the content before changing its workflow state.
7. Choose one path:
   - **Move To Copy Edit** while actively polishing the item.
   - **Request Changes** with a specific reason when reporting is incomplete.
   - **Ready For Approval** when the content is clean and publication-ready.

After **Ready For Approval**, the item becomes read-only for Copy Editor by
design.

### Create a direct article

1. Open **Articles** -> **Create Article**.
2. Choose an existing category (only Admin/Super Admin creates categories), then
   complete the Compose, Quality, Media, SEO, and Publish panels.
3. Resolve every readiness blocker.
4. Choose **Submit for review**. A Copy Editor cannot publish directly.

### Publication production notes

- Send page, OCR, hotspot, caption, or linked-story quality notes to Super Admin.
- Super Admin applies those notes in the publication CMS and owns final release.
- E-Paper/E-Magazine CMS viewing, uploads, editing, OCR/hotspot work, release and
  archive are restricted to Super Admin. An editorial assignment does not grant
  publication CMS access to Copy Editor.
- Treat E-Magazine as a monthly issue workflow, not a daily E-Paper edition.

### Copy Editor handoff checklist

- [ ] Facts, quotations, headline, and language are checked.
- [ ] Source/credit and legal-sensitivity notes are present.
- [ ] Media has useful alt text, caption, and credit.
- [ ] Copy notes clearly explain material changes.
- [ ] Returned work includes one actionable reason.
- [ ] Clean work is marked **Ready For Approval**, not published.

## 6. Admin SOP

### What the Admin owns

- Daily desk: **Review Queue**, **Assignments**, **Content Queue**, **Copy Desk**
- Release tools: **Push Alerts**, Articles, Stories, Videos, Social Posts,
  Media, Polls, and Categories
- Operations: Team, Analytics, AI Ops, Newsroom Settings, Contact Messages, and
  Operations Center

E-Papers/E-Magazines, System Settings, Revenue, Business Value, Audit Log, Permission Review,
Operations Diagnostics, and leadership-report management remain
Super-Admin-only boundaries.

### Run the daily desk

1. Open **Dashboard** and check urgent counts, failed/blocked work, and due items.
2. Open **Review Queue** and **Assignments**.
3. For submitted work, choose **Assign** and set the newsroom user, priority, and
   due time.
4. Use **Content Queue** to track items across submitted, review, copy edit,
   ready, approved, scheduled, and published states.
5. Return incomplete work with **Request Changes** and a clear reason. Use
   **Reject** only when the desk is intentionally stopping the item.

### Approve and release content

1. Open an item marked **Ready For Approval**.
2. Read the reporting notes, copy notes, source information, and activity
   history.
3. Preview the public presentation on desktop and mobile.
4. Confirm the release checklist in Section 8.
5. Choose **Approve**.
6. Choose **Schedule** with a valid future date/time, or **Publish Now**.
7. Open the public URL after release and verify the headline, image, body, audio,
   links, and share preview.
8. Use **Push Alerts** only after the public page is confirmed. The CMS prepares
   and copies alert text; final delivery happens in the approved external push
   channel. Use the reader **Share** menu for WhatsApp, Facebook, X, LinkedIn,
   or Copy Link.

### Create a direct desk article

1. Open **Articles** -> **Create Article**.
2. Write the title, summary, body, author, category, and location.
3. Add source attribution, reporter/editor notes, and editorial flags.
4. Add the featured image plus alt text, caption, and image credit.
5. Use inline **Image** or **Table** controls where the story needs structure.
6. Complete SEO title, description, slug/canonical settings, focus keyword, and
   social image.
7. Check the Quality/readiness panel and resolve every blocker.
8. For breaking news, upload the required breaking audio before publication.
9. Select **Publish now**, **Schedule publication**, or **Submit for review**.

### Publication handoff to Super Admin

Admin coordinates publication requests with Super Admin. The following upload,
production, release and archive workflow is performed using a Super Admin account.

1. Open **E-Papers** or **E-Magazines** -> **New Upload**.
2. Enter edition/issue metadata and upload the PDF.
3. Wait for page conversion; do not publish while pages are still processing.
4. Review missing images, OCR, hotspots, linked stories, and readiness metrics.
5. Follow the production path:
   `Draft Upload -> Pages Ready -> OCR Review -> Hotspot Mapping -> Ready To Publish`.
6. Publish only when page, text, and hotspot blockers are clear.
7. Open the public reader, turn pages, test hotspots/search, and use Share to
   verify the public link.

### Team safety

- Admin can manage Admin, Reporter, and Copy Editor accounts.
- Admin cannot create, edit, or remove a Super Admin.
- Deactivate access promptly when a staff member leaves or changes duties.
- Assign the least-privileged role that supports the person's job.

## 7. Article release checklist

### Editorial

- [ ] Headline is accurate, specific, and free of unsupported claims.
- [ ] Summary matches the article and does not introduce new facts.
- [ ] Body, author, category, location, and source attribution are complete.
- [ ] Names, dates, figures, quotations, and links are verified.
- [ ] Corrections/major-update notes are included where required.

### Media and accessibility

- [ ] Featured image is sharp, relevant, and correctly cropped.
- [ ] Alt text describes the image; caption and credit are present.
- [ ] Inline images/tables display correctly on mobile and desktop.
- [ ] Article audio works when attached.
- [ ] Breaking-news audio is present when breaking publication requires it.

### SEO, brand, and distribution

- [ ] Public slug and canonical URL are correct.
- [ ] SEO title/description and social image are ready.
- [ ] The article is included in the news sitemap when appropriate.
- [ ] Public page loads without an error and shows the Lokswami header/branding.
- [ ] Share actions and copied link open the correct public page.
- [ ] Push alert wording matches the published headline and URL.

## 8. Common problems

| Problem | Correct response |
| --- | --- |
| Recovery copy notice appears | Restore the needed copy or discard the stale copy once. The editor stays locked until the choice is made. |
| Image/table insertion appears unresponsive | Wait for upload completion, check the editor selection, then retry once. Do not create a duplicate article. |
| Save status shows Conflict | Stop editing, compare with the saved version, and reload the latest record before workflow actions. |
| Upload is still running | Keep the tab open. Do not submit, refresh, or navigate away. |
| Menu/tool is missing | Confirm the role badge. The tool may be intentionally unavailable for that role; ask Admin if the assignment is wrong. |
| Submit/publish button is disabled | Open Quality/readiness and resolve required fields, uploads, schedule time, recovery choice, or breaking audio. |
| Work was returned | Read the exact change reason, correct it, save, and submit again. Do not create another record. |
| Public page/share looks wrong | Do not send a push alert. Correct the content/media, republish if authorized, and recheck the public URL. |

## 9. Role quick reference

| Action | Reporter | Copy Editor | Admin |
| --- | :---: | :---: | :---: |
| Create story package | Yes | No | Yes |
| Create direct article | Yes, quick desk handoff | Yes | Yes |
| Edit own draft / assigned review work | Yes | Yes | Yes |
| Claim submitted work | No | Yes | Yes/assign |
| Request changes | No | Yes | Yes |
| Mark ready for approval | No | Yes | Yes |
| Approve/schedule/publish | No | No | Yes |
| Review E-Paper/E-Magazine OCR/hotspots | No | No | No |
| Create/publish E-Paper/E-Magazine | No | No | No |
| Manage newsroom users | No | No | Yes, except Super Admin |
| Prepare/copy push alert | No | No | Yes; external channel delivers it |

Super Admin owns all publication CMS actions: view, upload/create, edit metadata
or pages, OCR/hotspots, release/publish, and archive. Reporter, Copy Editor and
Admin have no publication CMS access. Published reader pages remain public.

## 10. End-of-shift check

- Reporter: no completed package is left only in Draft; returned work has a next
  action.
- Copy Editor: every claimed item is saved and either in review/copy edit,
  returned with a reason, or ready for approval.
- Admin: urgent queues, scheduled items, failed uploads, and public releases are
  checked; no prepared or externally delivered alert points to an unverified page.
