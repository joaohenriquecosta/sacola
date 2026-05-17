import { cn } from "@/lib/utils";

describe("cn (Tailwind class merger)", () => {
  test("concatena classes simples separadas por espaço", () => {
    expect(cn("p-2", "text-sm")).toBe("p-2 text-sm");
  });

  test("a última classe Tailwind ganha quando há conflito", () => {
    expect(cn("p-2", "p-4")).toBe("p-4");
  });

  test("ignora valores falsy (false, null, undefined)", () => {
    expect(cn("foo", false && "bar", null, undefined, "baz")).toBe("foo baz");
  });

  test("aceita arrays e objetos no estilo clsx", () => {
    expect(cn(["foo", "bar"], { baz: true, qux: false })).toBe("foo bar baz");
  });
});
