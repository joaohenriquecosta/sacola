exports.up = (pgm) => {
  pgm.createTable("companies", {
    id: {
      type: "uuid",
      primaryKey: true,
      default: pgm.func("gen_random_uuid()"),
    },

    name: {
      type: "varchar(80)",
      notNull: true,
    },

    slug: {
      type: "varchar(40)",
      notNull: true,
      unique: true,
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

  pgm.createTable("memberships", {
    id: {
      type: "uuid",
      primaryKey: true,
      default: pgm.func("gen_random_uuid()"),
    },

    user_id: {
      type: "uuid",
      notNull: true,
    },

    company_id: {
      type: "uuid",
      notNull: true,
    },

    // 'owner' | 'admin' | 'member' (ROLE_PERMISSIONS catalog in models/authorization.ts)
    role: {
      type: "varchar(32)",
      notNull: true,
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

  pgm.addConstraint("memberships", "memberships_user_company_unique", {
    unique: ["user_id", "company_id"],
  });

  pgm.createIndex("memberships", "user_id");
  pgm.createIndex("memberships", "company_id");
};

exports.down = () => false;
