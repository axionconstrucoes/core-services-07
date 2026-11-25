import Link from "next/link";

import { FeatureInfo } from "@/components/shared/feature-info";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { AlertLinkedQualityView } from "@/lib/pilares/alert-links-data";
import { ENTITY_TYPE_LABELS, RESOLVED_NOTICE_TITLE, blockerLabel } from "@/lib/pilares/alert-links";

function fmtDate(iso: string | null): string {
  if (!iso) return "SEM DADOS";
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
}

// Aviso da camada de aplicação: RESOLVIDO do alerta NUNCA encerra a RNC/garantia/sinistro vinculada. Somente leitura:
// não grava, não altera o fluxo do alerta nem os SLAs. Prazo de ASSUNÇÃO (SLA do alerta) e prazo de CONCLUSÃO de reparos
// (due_date da RNC/garantia) são grandezas distintas e aparecem com rótulos distintos.
export function LinkedQualityNotice({ projectId, view }: { projectId: string; view: AlertLinkedQualityView }) {
  if (view.available && view.entities.length === 0) return null;

  if (!view.available) {
    return (
      <Card data-testid="linked-quality-unavailable">
        <CardContent className="pt-4 text-sm text-muted-foreground" role="status">
          Vínculo com RNC, garantia ou sinistro indisponível agora (leitura falhou). Confirme na Qualidade, em Garantias ou em Seguros antes de considerar qualquer encerramento.
          <FeatureInfo helpId="pilares.alerta.aviso-vinculo" className="ml-1 align-middle" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card data-testid="linked-quality-notice" role="status" aria-live="polite">
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-2 text-base">
          <span>{RESOLVED_NOTICE_TITLE}</span>
          <FeatureInfo helpId="pilares.alerta.aviso-vinculo" />
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3 text-sm">
        <p className="text-muted-foreground">
          Marcar o alerta como RESOLVIDO é decisão de comunicação e SLA. O estado da RNC, da garantia ou do sinistro só muda pela transição própria, com evidência e justificativa.
        </p>
        <ul className="flex flex-col gap-2">
          {view.entities.map((e) => (
            <li key={`${e.type}-${e.id}`} className="rounded-md border border-border bg-secondary p-3 text-secondary-foreground" data-testid={`linked-${e.type}`}>
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline">{ENTITY_TYPE_LABELS[e.type]}</Badge>
                <span className="font-medium">{e.code ?? e.title}</span>
                <span className="text-muted-foreground">estado: {e.state}</span>
                <span className="text-muted-foreground" data-testid={`origem-${e.origin}`}>
                  {e.origin === "ESTRUTURADO" ? "vínculo registrado" : "vínculo pelo texto da origem (dado antigo)"}
                  <FeatureInfo helpId="pilares.alerta.origem-vinculo" className="ml-1 align-middle" />
                </span>
                <Link href={`/${projectId}/${e.route}`} className="inline-flex min-h-11 items-center underline underline-offset-2 hover:text-muted-foreground">
                  Abrir {ENTITY_TYPE_LABELS[e.type].toLowerCase()}
                </Link>
              </div>
              <p className="text-muted-foreground">{e.title}</p>
              {e.type !== "CLAIM" ? (
                <p className="mt-1">
                  <span className="text-muted-foreground">Prazo de conclusão do tratamento/reparo ({ENTITY_TYPE_LABELS[e.type].toLowerCase()}):</span> {fmtDate(e.dueDate)}
                  <FeatureInfo helpId="pilares.alerta.prazos-distintos" className="ml-1 align-middle" />
                </p>
              ) : null}
              {e.guard ? (
                <div className="mt-1" data-testid={`guard-${e.type}`}>
                  <p>
                    <span className="text-muted-foreground">Pronto para encerrar:</span> {e.guard.closureReady ? "SIM (ainda depende da transição humana própria)" : "NÃO"}
                  </p>
                  {e.guard.blockers.length > 0 ? (
                    <ul className="list-disc pl-5">
                      {e.guard.blockers.map((b) => (
                        <li key={b}>Falta: {blockerLabel(b)}</li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              ) : e.type === "CLAIM" ? (
                <p className="mt-1 text-muted-foreground">O sinistro só avança de estágio pelo fluxo de Seguros; o alerta RESOLVIDO não o encerra.</p>
              ) : (
                <p className="mt-1 text-muted-foreground">O que falta para encerrar: SEM DADOS (guarda de encerramento indisponível).</p>
              )}
            </li>
          ))}
        </ul>
        <p className="text-xs text-muted-foreground">
          Prazo de assunção do alerta (SLA, na seção Situação) e prazo de conclusão do reparo (acima) são prazos diferentes; um não substitui o outro.
        </p>
      </CardContent>
    </Card>
  );
}
