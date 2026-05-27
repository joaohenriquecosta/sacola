// Authenticated home. Placeholder until PR 3 lands the companies API; for
// now we tell the user we know they're in and that the next step doesn't
// exist yet.

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function AppPage() {
  return (
    <div className="mx-auto w-full max-w-2xl">
      <Card>
        <CardHeader>
          <CardTitle>Suas empresas</CardTitle>
          <CardDescription>
            Você ainda não pertence a nenhuma empresa. Crie uma para começar.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button disabled>Criar empresa (em breve)</Button>
        </CardContent>
      </Card>
    </div>
  );
}
