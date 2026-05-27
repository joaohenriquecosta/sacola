// Pure slugify. Lives in `lib/` (not `models/`) so client components can
// import it without dragging the DB layer into the bundle. The server slug
// validator in models/company.ts and the live preview on the create form
// both call this — same input, same output, by design.

export const SLUG_MAX_LENGTH = 40;

export function slugify(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // strip combining diacritics
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, SLUG_MAX_LENGTH);
}
