exports.up = (pgm) => {
  pgm.createTable("audit_log", {
    id: {
      type: "uuid",
      primaryKey: true,
      default: pgm.func("gen_random_uuid()"),
    },

    // Append-only; everything scoped to a company.
    company_id: {
      type: "uuid",
      notNull: true,
    },

    // Who did the action. user_id of the session that performed the call.
    actor_id: {
      type: "uuid",
      notNull: true,
    },

    // Event identifier. Convention: '<entity>.<verb>' (e.g. member.role_changed,
    // invitation.created). Caller chooses; we don't enforce a closed list at
    // the DB level so new event types ship without migration.
    action: {
      type: "varchar(64)",
      notNull: true,
    },

    // Optional pointer to the affected row. For events that don't have a
    // single target (e.g. bulk operations) leave NULL.
    target_type: {
      type: "varchar(32)",
    },

    target_id: {
      type: "uuid",
    },

    // Free-form per-event payload. Keep it small — store IDs/labels, not
    // arbitrary blobs.
    metadata: {
      type: "jsonb",
      notNull: true,
      default: "{}",
    },

    created_at: {
      type: "timestamp with time zone",
      notNull: true,
      default: pgm.func("timezone('utc', now())"),
    },
  });

  pgm.createIndex("audit_log", ["company_id", "created_at"], {
    name: "audit_log_company_recent_idx",
  });
};

exports.down = () => false;
