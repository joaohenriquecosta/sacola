import {
  NAV_ITEMS,
  bottomNavForFeatures,
  isNavItemActive,
  navForFeatures,
  navItemHref,
  type NavItem,
} from "@/lib/navigation";
import { ROLE_PERMISSIONS, SCOPED_FEATURES } from "@/lib/roles";

// Flatten the grouped sections into the list of visible item keys.
function visibleKeys(features: readonly string[]): string[] {
  return navForFeatures(features).flatMap((section) => section.items.map((i) => i.key));
}

const byKey = (key: string): NavItem => {
  const item = NAV_ITEMS.find((i) => i.key === key);
  if (!item) throw new Error(`unknown nav key: ${key}`);
  return item;
};

describe("catalog integrity", () => {
  test("every declared feature exists in the authorization catalog", () => {
    for (const item of NAV_ITEMS) {
      if (item.feature) expect(SCOPED_FEATURES.has(item.feature)).toBe(true);
    }
  });

  test("keys are unique", () => {
    const keys = NAV_ITEMS.map((i) => i.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  test("only the overview has an empty path", () => {
    const empties = NAV_ITEMS.filter((i) => i.path === "").map((i) => i.key);
    expect(empties).toEqual(["overview"]);
  });
});

describe("navForFeatures gating", () => {
  test("gerente sees every item", () => {
    expect(visibleKeys(ROLE_PERMISSIONS.gerente).sort()).toEqual(
      NAV_ITEMS.map((i) => i.key).sort(),
    );
  });

  test("featureless items (overview, settings) show even with no features", () => {
    expect(visibleKeys([])).toEqual(["overview", "settings"]);
  });

  test("member sees reads but not transitions or audit", () => {
    const keys = visibleKeys(ROLE_PERMISSIONS.member);
    expect(keys).toContain("orders");
    expect(keys).toContain("products");
    expect(keys).toContain("team");
    expect(keys).not.toContain("separation");
    expect(keys).not.toContain("deliveries");
    expect(keys).not.toContain("audit");
  });

  test("separador sees the separation queue, not deliveries", () => {
    const keys = visibleKeys(ROLE_PERMISSIONS.separador);
    expect(keys).toContain("separation");
    expect(keys).not.toContain("deliveries");
    expect(keys).not.toContain("audit");
  });

  test("entregador sees deliveries, not the separation queue", () => {
    const keys = visibleKeys(ROLE_PERMISSIONS.entregador);
    expect(keys).toContain("deliveries");
    expect(keys).not.toContain("separation");
  });

  test("empty groups are dropped (no header without items)", () => {
    // An entregador has no audit; gestao still appears for settings, but
    // catalogo/operacao headers must only show when they have items.
    const sections = navForFeatures(ROLE_PERMISSIONS.entregador);
    for (const section of sections) expect(section.items.length).toBeGreaterThan(0);
  });
});

describe("bottomNavForFeatures", () => {
  test("always leads with the overview", () => {
    expect(bottomNavForFeatures(ROLE_PERMISSIONS.vendedor)[0]?.key).toBe("overview");
  });

  test("separador bar: overview, orders, separation", () => {
    expect(bottomNavForFeatures(ROLE_PERMISSIONS.separador).map((i) => i.key)).toEqual([
      "overview",
      "orders",
      "separation",
    ]);
  });

  test("entregador bar: overview, orders, deliveries", () => {
    expect(bottomNavForFeatures(ROLE_PERMISSIONS.entregador).map((i) => i.key)).toEqual([
      "overview",
      "orders",
      "deliveries",
    ]);
  });

  test("caps to the limit", () => {
    expect(bottomNavForFeatures(ROLE_PERMISSIONS.gerente, 4).length).toBeLessThanOrEqual(4);
  });
});

describe("isNavItemActive", () => {
  const slug = "acme";

  test("overview matches only its own page", () => {
    expect(isNavItemActive(byKey("overview"), slug, "/app/acme")).toBe(true);
    expect(isNavItemActive(byKey("overview"), slug, "/app/acme/pedidos")).toBe(false);
  });

  test("deeper item matches its subtree", () => {
    const orders = byKey("orders");
    expect(isNavItemActive(orders, slug, "/app/acme/pedidos")).toBe(true);
    expect(isNavItemActive(orders, slug, "/app/acme/pedidos/123")).toBe(true);
    expect(isNavItemActive(orders, slug, "/app/acme")).toBe(false);
  });

  test("navItemHref builds the scoped path", () => {
    expect(navItemHref(byKey("orders"), slug)).toBe("/app/acme/pedidos");
    expect(navItemHref(byKey("overview"), slug)).toBe("/app/acme");
  });
});
