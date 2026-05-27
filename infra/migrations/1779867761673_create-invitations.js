exports.up = (pgm) => {
  pgm.createTable("invitations", {
    id: {
      type: "uuid",
      primaryKey: true,
      default: pgm.func("gen_random_uuid()"),
    },

    company_id: {
      type: "uuid",
      notNull: true,
    },

    email: {
      type: "varchar(254)",
      notNull: true,
    },

    // 'owner' | 'admin' | 'member' (matches memberships.role)
    role: {
      type: "varchar(32)",
      notNull: true,
    },

    // 64-hex single-use token sent to the invitee.
    token: {
      type: "varchar(64)",
      notNull: true,
      unique: true,
    },

    // user_id of whoever issued the invite.
    invited_by: {
      type: "uuid",
      notNull: true,
    },

    expires_at: {
      type: "timestamp with time zone",
      notNull: true,
    },

    // NULL until the invitee accepts; once set, the invite is consumed.
    accepted_at: {
      type: "timestamp with time zone",
      default: null,
    },

    created_at: {
      type: "timestamp with time zone",
      notNull: true,
      default: pgm.func("timezone('utc', now())"),
    },

    updated_at: {
      type: "timestamp with time zone",
      notNull: true,
      default: pgm.func("timezone('utc', now())"),
    },
  });

  pgm.createIndex("invitations", "company_id");
  pgm.createIndex("invitations", "email");
};

exports.down = () => false;
