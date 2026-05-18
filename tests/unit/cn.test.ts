import { cn } from "@/lib/utils";

describe("cn (Tailwind class merger)", () => {
  test("concatenates simple classes separated by space", () => {
    expect(cn("p-2", "text-sm")).toBe("p-2 text-sm");
  });

  test("the last conflicting Tailwind class wins", () => {
    expect(cn("p-2", "p-4")).toBe("p-4");
  });

  test("ignores falsy values (false, null, undefined)", () => {
    expect(cn("foo", false && "bar", null, undefined, "baz")).toBe("foo baz");
  });

  test("accepts arrays and objects in clsx style", () => {
    expect(cn(["foo", "bar"], { baz: true, qux: false })).toBe("foo bar baz");
  });
});
