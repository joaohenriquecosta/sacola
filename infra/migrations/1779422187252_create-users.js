exports.up = (pgm) => {
  pgm.createTable("users", {
    id: {
      type: "uuid",
      primaryKey: true,
      default: pgm.func("gen_random_uuid()"),
    },

    username: {
      type: "varchar(32)",
      notNull: true,
      unique: true,
    },

    email: {
      type: "varchar(254)",
      notNull: true,
      unique: true,
    },

    password: {
      type: "varchar(60)",
      notNull: true,
    },

    features: {
      type: "varchar[]",
      notNull: true,
      default: "{}",
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
};

exports.down = () => false;
