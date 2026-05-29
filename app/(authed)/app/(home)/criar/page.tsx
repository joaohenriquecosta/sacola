import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CreateCompanyForm } from "./create-company-form";

export default function CriarEmpresaPage() {
  return (
    <div className="mx-auto w-full max-w-xl">
      <Card>
        <CardHeader>
          <CardTitle>Nova empresa</CardTitle>
          <CardDescription>
            Você será o dono e poderá convidar pessoas depois de criar.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <CreateCompanyForm />
        </CardContent>
      </Card>
    </div>
  );
}
