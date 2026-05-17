import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-toggle";

export default function Home() {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-border flex items-center justify-between border-b px-6 py-3">
        <div className="flex items-center gap-2 font-semibold">
          <span aria-hidden="true">🛒</span>
          <span>Sacola</span>
        </div>
        <ThemeToggle />
      </header>

      <main className="flex flex-1 items-center justify-center px-6 py-12">
        <div className="max-w-md text-center">
          <h1 className="text-3xl font-semibold tracking-tight">Sacola está em construção</h1>
          <p className="text-muted-foreground mt-3 text-sm">
            Gestão operacional para hortifruti — pedidos, separação e entrega.
          </p>
          <div className="mt-6 flex justify-center gap-2">
            <Button variant="default">Em breve</Button>
            <Button variant="outline" asChild>
              <a
                href="https://github.com/joaohenriquecosta/sacola"
                target="_blank"
                rel="noopener noreferrer"
              >
                Repo no GitHub
              </a>
            </Button>
          </div>
        </div>
      </main>
    </div>
  );
}
