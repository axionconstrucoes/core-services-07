import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDateTime, membershipStatusLabels } from "@/lib/labels";
import type { SharedSourceRow, UserSourceRow } from "@/lib/integrations/user-integration-matrix";
import { SourceBeacon } from "./source-beacon";

const date = (value: string | null) => (value ? formatDateTime(value) : "Sem registro");

export function UserIntegrationMatrix({ rows, shared, warnings, measuredAt, unassignedEmails }: {
  rows: UserSourceRow[]; shared: SharedSourceRow[]; warnings: string[]; measuredAt: string; unassignedEmails: number | null;
}) {
  return (
    <Card className="min-w-0">
      <CardHeader>
        <CardTitle>Quem alimenta o ACC neste projeto</CardTitle>
        <p className="text-sm text-muted-foreground">
          Verde só aparece com prova da etapa. Cadastro, vínculo ativo, aceite ou “conectado” isolados não tornam nada verde. Medido em {date(measuredAt)}.
        </p>
      </CardHeader>
      <CardContent className="min-w-0 space-y-6">
        {warnings.length ? (
          <div role="status" className="rounded border border-amber-300 bg-amber-800 p-3 text-sm text-white">
            {warnings.map((warning) => <p key={warning}>{warning}</p>)}
          </div>
        ) : null}

        <section aria-labelledby="fontes-pessoais" className="space-y-2">
          <h3 id="fontes-pessoais" className="text-base font-semibold">1. Fontes pessoais — caixa de e-mail de cada usuário</h3>
          {rows.length === 0 ? <p className="text-sm text-muted-foreground">Nenhum usuário vinculado a esta obra.</p> : (
            <div role="region" aria-label="Fontes pessoais por usuário; role horizontalmente para ver todas as etapas" tabIndex={0} className="max-w-full overflow-x-auto rounded border border-border focus-visible:outline-2 focus-visible:outline-offset-2">
              <table className="w-full min-w-[1000px] text-left text-sm">
                <caption className="sr-only">Etapas de comprovação da caixa pessoal de cada usuário vinculado ao projeto.</caption>
                <thead className="border-b border-border bg-muted">
                  <tr>
                    {["Usuário", "Aceite", "Conexão técnica", "Coleta", "Material processado"].map((label) => <th key={label} scope="col" className="p-3 align-top font-semibold">{label}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.userId} className="border-b border-border align-top last:border-0">
                      <th scope="row" className="min-w-52 p-3 font-normal">
                        <p className="font-semibold">{row.name}</p>
                        <p className="break-all text-xs text-muted-foreground">{row.email}</p>
                        <p className="mt-1 text-xs text-muted-foreground">Vínculo: {membershipStatusLabels[row.membership as keyof typeof membershipStatusLabels] ?? row.membership}{row.area ? ` · ${row.area}` : ""} (não comprova coleta)</p>
                      </th>
                      <td className="p-3"><SourceBeacon beacon={row.authorization} /></td>
                      <td className="p-3"><SourceBeacon beacon={row.technical} /></td>
                      <td className="p-3">
                        <SourceBeacon beacon={row.collection} />
                        <p className="mt-1 text-xs text-muted-foreground">{row.emails === null ? "Contagem indisponível" : `${row.emails} e-mails`} · última mensagem: {date(row.lastMessageAt)}</p>
                      </td>
                      <td className="p-3">
                        <SourceBeacon beacon={row.material} />
                        <p className="mt-1 text-xs text-muted-foreground">{row.attachments === null ? "Anexos indisponíveis" : `${row.attachmentsProcessed} de ${row.attachments} anexos processados`}</p>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="text-xs text-muted-foreground">
            Mensagens sem caixa identificada: <strong>{unassignedEmails === null ? "indisponível" : unassignedEmails}</strong> — não atribuíveis a nenhum usuário (a identidade não é inferida pelo nome). Quem recebe os e-mails do piloto não é, por isso, fonte de informações.
          </p>
        </section>

        <section aria-labelledby="contribuicoes" className="space-y-1">
          <h3 id="contribuicoes" className="text-base font-semibold">2. Contribuições identificáveis por autor</h3>
          <p className="text-sm text-muted-foreground">
            Só aparecem aqui documentos, relatórios ou registros com autor ou remetente associado de forma comprovada. Hoje as contribuições existentes (diários, planilhas semanais, Construmanager) não carregam um autor individual vinculado a usuário do ACC: <strong>não atribuível</strong>.
          </p>
        </section>

        <section aria-labelledby="fontes-compartilhadas" className="space-y-2">
          <h3 id="fontes-compartilhadas" className="text-base font-semibold">3. Fontes compartilhadas da obra</h3>
          <div role="region" aria-label="Fontes compartilhadas da obra; role horizontalmente para ver todas as etapas" tabIndex={0} className="max-w-full overflow-x-auto rounded border border-border focus-visible:outline-2 focus-visible:outline-offset-2">
            <table className="w-full min-w-[900px] text-left text-sm">
              <caption className="sr-only">Etapas de comprovação das fontes compartilhadas da obra.</caption>
              <thead className="border-b border-border bg-muted">
                <tr>{["Fonte", "Conexão", "Coleta", "Disponível para análise"].map((label) => <th key={label} scope="col" className="p-3 align-top font-semibold">{label}</th>)}</tr>
              </thead>
              <tbody>
                {shared.map((row) => (
                  <tr key={row.key} className="border-b border-border align-top last:border-0">
                    <th scope="row" className="min-w-44 p-3 font-normal">
                      <p className="font-semibold">{row.label}</p>
                      {row.facts.map((fact) => <p key={fact} className="mt-1 max-w-56 text-xs text-muted-foreground">{fact}</p>)}
                    </th>
                    <td className="p-3"><SourceBeacon beacon={row.connection} /></td>
                    <td className="p-3"><SourceBeacon beacon={row.collection} /></td>
                    <td className="p-3"><SourceBeacon beacon={row.availability} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </CardContent>
    </Card>
  );
}
