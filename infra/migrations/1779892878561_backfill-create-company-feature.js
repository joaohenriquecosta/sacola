// Data migration: add `create:company` to every user activated before that
// feature existed (PR #41). Criterion: anyone with `create:session` is
// activated (only the activatedUser set ever gets create:session); we add
// the missing feature without disturbing anything else they might have.
//
// Idempotent — the WHERE clause guards against a second run, and any user
// already holding `create:company` is left alone.

exports.up = (pgm) => {
  pgm.sql(`
    UPDATE users
    SET features = features || ARRAY['create:company']::varchar[],
        updated_at = timezone('utc', now())
    WHERE 'create:session' = ANY(features)
      AND NOT ('create:company' = ANY(features));
  `);
};

exports.down = () => false;
