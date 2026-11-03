import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getProjects } from "@/lib/data";

export const metadata: Metadata = { title: "AXIA — Assistente ACC" };

// Destino do "Fale com a AXIA" dos e-mails sem contexto específico: exige login (proxy) e leva à ajuda geral de uma
// obra a que a pessoa tem acesso. Com uma única obra, abre direto; com várias, pede para escolher. Não recebe nenhum dado.
export default async function VeraEntryPage() {
  const projects = await getProjects();

  if (projects.length === 1) redirect(`/${projects[0].id}/ajuda?vera=abrir&contexto=geral`);

  return (
    <div className="flex min-h-dvh items-center justify-center bg-muted p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="text-base">AXIA — Assistente ACC</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          {projects.length === 0 ? (
            <p>Você ainda não participa de nenhuma obra no ACC. Peça a um administrador para liberar o seu acesso.</p>
          ) : (
            <>
              <p>Escolha a obra para conversar com a AXIA:</p>
              <ul className="space-y-2">
                {projects.map((project) => (
                  <li key={project.id}>
                    <Link
                      href={`/${project.id}/ajuda?vera=abrir&contexto=geral`}
                      className="flex min-h-11 items-center rounded-md border border-gray-300 px-3 py-2 font-semibold text-brand-sidebar hover:bg-gray-50"
                    >
                      {project.name}
                    </Link>
                  </li>
                ))}
              </ul>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
