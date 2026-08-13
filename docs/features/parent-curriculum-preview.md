# Parent Curriculum Preview

## Summary

Give parents a clear view of the food their child will make and the practical skills they will build before they commit to a term programme. The preview belongs on each public term programme card, before the price and booking action, with the complete date-by-date plan available on demand.

## User stories

- As a parent, I can see a small sample of planned recipes and skills while comparing term programmes.
- As a parent, I can open the whole menu and learning plan before I book.
- As a parent, I am not misled by cancelled dates or recipes that have not yet been confirmed.
- As an administrator, I assign a recipe once in the existing term schedule editor and that information is used publicly.

## MVP requirements

1. Show a curriculum preview only for term sessions with at least one active schedule entry that has an assigned recipe.
2. Show up to three active, assigned recipes in chronological order. Each item includes the recipe image or an accessible chef-hat fallback, name, and short description when supplied.
3. Show a `+ N more planned session(s)` message when active entries remain beyond the preview.
4. Combine distinct skills from the preview recipes into up to six parent-friendly skill tags.
5. Keep the full active schedule behind the descriptive action `See what they'll cook & learn`.
6. Keep skipped entries out of all preview and schedule counts. Unassigned dates remain visible only in the complete schedule as `Recipe to be announced`.
7. Include the existing menu-substitution reassurance in the full schedule view: recipes can change for seasonal availability, allergen management, or operational reasons.
8. Do not change booking, payment, filtering, guest checkout, or admin data entry workflows.

## Acceptance criteria

- Given a term has four active dates with three assigned recipes, when a parent views its card, then they see three recipe previews and `+ 1 more planned session`.
- Given a date is skipped, when a parent views the card or full plan, then it is not counted or displayed.
- Given all active dates are unassigned, when a parent views the card, then no empty curriculum-preview panel is shown and the full-plan action remains available.
- Given a recipe has no photo, when it appears in a preview, then an accessible visual fallback is shown.
- Given a parent opens the full plan, when they read the schedule, then every active date shows its recipe or `Recipe to be announced`, with available descriptions and skills.
- Given a parent is using a narrow screen, when recipe previews render, then they remain readable without horizontal scrolling.

## Delivery approach

The MVP introduces a reusable `TermCurriculumPreview` component and reuses the existing `Session.schedule` / `ScheduleEntry` data. A later enhancement may add a dedicated, shareable programme-detail route for social campaigns and search discovery.
