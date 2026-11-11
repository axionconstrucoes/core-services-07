import type { IntegrationConfig, SourceDefinition } from "@axion/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDateTime, integrationStatusLabels, membershipStatusLabels } from "@/lib/labels";
import type { MatrixFact, UserIntegrationRow } from "@/lib/integrations/user-integration-matrix";

const tones = {
  ok: "border-emerald-500/60 bg-emerald-950 text-emerald-100",
  warning: "border-amber-500/60 bg-amber-950 text-amber-100",
  error: "border-red-400/60 bg-red-950 text-red-100",
  neutral: "border-border bg-muted text-foreground",
};
function Fact({ value }: { value: MatrixFact }) {
  return <span className={`inline-flex w-fit rounded border px-2 py-1 text-xs font-semibold ${tones[value.tone]}`}>{value.label}</span>;
}
const date = (value: string | null) => value ? formatDateTime(value) : "Sem registro";

export function UserIntegrationMatrix({ projectId, rows, warnings, sources, configs }: {
  projectId: string; rows: UserIntegrationRow[]; warnings: string[]; sources: SourceDefinition[]; configs: IntegrationConfig[];
}) {
  const sharedSources = sources.filter((source) => source.type !== "EMAIL");
  return (
    <Card className="min-w-0">
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <CardTitle>Matriz de integração por usuário</CardTitle>
          <a href={`/${projectId}/integracoes`} className="rounded border border-border px-3 py-2 text-sm font-semibold text-foreground hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-300">Atualizar painel</a>
        </div>
        <p className="text-sm text-muted-foreground">Confira cada etapa da caixa pessoal. As demais fontes são compartilhadas pela obra e aparecem identificadas nas colunas.</p>
      </CardHeader>
      <CardContent className="min-w-0 space-y-3">
        {warnings.length ? <div role="status" className="rounded border border-amber-500/60 bg-amber-950 p-3 text-sm text-amber-100">{warnings.map((warning) => <p key={warning}>{warning}</p>)}</div> : null}
        {rows.length === 0 ? <p className="text-sm text-muted-foreground">Nenhum usuário vinculado a esta obra.</p> : (
          <div role="region" aria-label="Matriz de integração dos usuários; role horizontalmente para ver todas as fontes" tabIndex={0} className="max-w-full overflow-x-auto rounded border border-border focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-300">
            <table className="w-full min-w-[1100px] text-left text-sm">
              <caption className="sr-only">Situação individual do e-mail e estado das fontes compartilhadas da obra.</caption>
              <thead className="border-b border-border bg-muted">
                <tr>
                  {["Usuário", "Conta / técnica", "Aceite da obra", "Coleta pessoal", "Evidências do e-mail"].map((label) => <th key={label} scope="col" className="p-3 align-top font-semibold">{label}</th>)}
                  {sharedSources.map((source) => <th key={source.type} scope="col" className="p-3 align-top font-semibold">{source.label}<span className="block text-xs font-normal text-muted-foreground">Compartilhada na obra</span></th>)}
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.userId} className="border-b border-border align-top last:border-0 hover:bg-muted/40">
                    <th scope="row" className="min-w-52 p-3 font-normal">
                      <p className="font-semibold">{row.name}</p><p className="break-all text-xs text-muted-foreground">{row.email}</p>
                      <p className="mt-1 text-xs text-muted-foreground">{membershipStatusLabels[row.membership as keyof typeof membershipStatusLabels] ?? row.membership}{row.area ? ` · ${row.area}` : ""}</p>
                    </th>
                    <td className="p-3"><div className="flex flex-col gap-2"><Fact value={row.registration} /><span className="text-xs text-muted-foreground">Credencial: <Fact value={row.technical} /></span></div></td>
                    <td className="p-3"><Fact value={row.consent} /></td>
                    <td className="p-3"><Fact value={row.collection} /></td>
                    <td className="min-w-48 p-3">
                      <p className="font-semibold">{row.imported === null ? "Contagem indisponível" : `${row.imported} e-mails importados`}</p>
                      <p className="mt-1 text-xs text-muted-foreground">Sincronização registrada: {date(row.lastSyncAt)}</p>
                      <p className="mt-1 text-xs text-muted-foreground">Última mensagem importada: {date(row.lastMessageAt)}</p>
                    </td>
                    {sharedSources.map((source) => {
                      const config = configs.find((item) => item.sourceType === source.type);
                      const label = config ? integrationStatusLabels[config.status] ?? config.status : "Não configurada";
                      return <td key={source.type} className="min-w-40 p-3"><Fact value={{ label, tone: config?.status === "ERRO" ? "error" : "neutral" }} /><p className="mt-1 text-xs text-muted-foreground">Estado da fonte da obra</p><p className="mt-1 text-xs text-muted-foreground">Sincronização: {date(config?.lastSyncAt ?? null)}</p></td>;
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="text-xs text-muted-foreground">Conta registrada, aceite e credencial técnica são etapas distintas. E-mails importados comprovam histórico; a confirmação da coleta atual depende dos controles e do período autorizado. O estado das fontes compartilhadas não comprova conexão individual nem leitura integral do acervo.</p>
      </CardContent>
    </Card>
  );
}
