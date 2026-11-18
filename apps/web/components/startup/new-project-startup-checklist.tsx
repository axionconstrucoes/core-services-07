"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { CheckSquare2, ExternalLink } from "lucide-react";

type StartupStep = {
  id: string;
  group: string;
  title: string;
  detail: string;
  path: string;
  destination: string;
};

const STEPS: readonly StartupStep[] = [
  { id:"project", group:"1. Identificação e responsabilidades", title:"Revisar os dados básicos da obra", detail:"Confira nome da obra, cliente, identificação contratual, situação do projeto e demais informações cadastradas. Corrija os dados do projeto antes de prosseguir.", path:"dashboard", destination:"Dashboard / Editar projeto" },
  { id:"dates", group:"1. Identificação e responsabilidades", title:"Definir as datas do Start-up", detail:"Registre a data inicial da obra, a data final prevista da linha de base e a data de início operacional do ACC. Verifique se os períodos históricos estão corretos.", path:"startup", destination:"Start-up ACC — Configuração" },
  { id:"members", group:"1. Identificação e responsabilidades", title:"Cadastrar participantes e permissões", detail:"Inclua administradores, gestores, responsáveis e colaboradores; confirme contas, status ativo, papéis e acesso exclusivamente às obras autorizadas.", path:"usuarios", destination:"Usuários" },
  { id:"sla", group:"1. Identificação e responsabilidades", title:"Conferir a matriz de responsabilidades e SLA", detail:"Defina responsáveis, gerência, diretoria, áreas e prazos de cada gravidade. Confirme regras de escalonamento antes de habilitar alertas.", path:"usuarios", destination:"Usuários / Matriz de SLA" },
  { id:"document-base", group:"2. Base contratual", title:"Enviar o contrato-base e a versão assinada", detail:"Faça upload do documento original, confira seu tipo, versão, data, autoria e anexos. Valide se o processamento e a leitura do arquivo estão completos.", path:"documentos", destination:"Documentos" },
  { id:"amendments", group:"2. Base contratual", title:"Cadastrar aditivos, cartas e documentos complementares", detail:"Inclua aditivos, correspondências oficiais, atas, propostas incorporadas e respectivos anexos. Confira versões e vínculos contratuais quando disponíveis.", path:"documentos", destination:"Documentos" },
  { id:"precedence", group:"2. Base contratual", title:"Validar as condições contratuais vigentes", detail:"No Jurídico, confira alterações de prazo, preço, escopo, pagamento e garantias. Use a ordem de precedência por item apenas quando o módulo estiver habilitado e as fontes forem validadas.", path:"juridico", destination:"Jurídico" },
  { id:"clauses", group:"2. Base contratual", title:"Revisar cláusulas identificadas", detail:"Confronte cada cláusula extraída com a página original. Aprove, corrija ou rejeite candidatos com justificativa; não trate extração automática como revisão concluída.", path:"documentos?tab=clausulas", destination:"Documentos / Cláusulas" },
  { id:"sources", group:"3. Fontes e integração", title:"Conferir integrações habilitadas", detail:"Verifique a situação real das fontes da obra, responsáveis, permissões e dependências. Não marque uma fonte como operacional apenas porque está cadastrada.", path:"integracoes", destination:"Integrações" },
  { id:"gmail", group:"3. Fontes e integração", title:"Configurar e validar a ingestão de e-mails", detail:"Escolha a conta autorizada, os domínios do cliente e fornecedores, os participantes e a janela temporal. Faça prévia da coleta e verifique o resultado antes de sincronizar.", path:"integracoes", destination:"Integrações / Gmail" },
  { id:"email-auth", group:"3. Fontes e integração", title:"Conferir autorizações e acesso às mensagens", detail:"Revise permissões, escopos OAuth, autorizações e restrições de uso. Não utilize credenciais compartilhadas ou habilite envio real sem aprovação.", path:"autorizacoes", destination:"Autorizações" },
  { id:"schedule", group:"4. Planejamento, financeiro e SSMA", title:"Cadastrar cronograma e linha de base", detail:"Envie o MPP oficial e versões pertinentes, confira datas, caminho crítico, atualização e identificação da linha de base. Verifique a importação antes de utilizar indicadores.", path:"documentos?tab=cronograma", destination:"Documentos / Cronograma" },
  { id:"weekly", group:"4. Planejamento, financeiro e SSMA", title:"Validar relatórios semanais e indicadores", detail:"Confira os relatórios e planilhas de planejamento, Curva S, linha de base, financeiro e suas datas de referência. Identifique fontes ausentes ou pendentes.", path:"documentos", destination:"Documentos / Relatórios" },
  { id:"ssma", group:"4. Planejamento, financeiro e SSMA", title:"Preparar o módulo ESG/SSMA", detail:"Confira obrigações, relatórios diários e avulsos, registros de ocorrências, responsáveis, evidências e fotos. Verifique o acesso dos usuários de campo.", path:"esg", destination:"ESG/SSMA" },
  { id:"finance", group:"4. Planejamento, financeiro e SSMA", title:"Verificar informações financeiras da obra", detail:"Confira disponibilidade das informações financeiras autorizadas, dados de faturamento e indicadores. O acesso depende da permissão do usuário.", path:"financeiro", destination:"Financeiro (se autorizado)" },
  { id:"experts", group:"5. Validação e entrada em operação", title:"Verificar especialistas e competências", detail:"Confira o provedor configurado, disponibilidade de IA, skills integradas e limitações reais. Não confunda skills instaladas no Claude Code com skills operacionais do ACC.", path:"experts-ia", destination:"Experts IA" },
  { id:"historical", group:"5. Validação e entrada em operação", title:"Revisar riscos e ocorrências históricas", detail:"Na própria aba Start-up, revise todos os findings históricos ALTO/CRÍTICO e registre a decisão humana. Não reabra ocorrências antigas apenas por importação retroativa.", path:"startup", destination:"Start-up ACC / Findings históricos" },
  { id:"alerts", group:"5. Validação e entrada em operação", title:"Verificar ações, responsáveis e escalonamentos", detail:"Confira as ações abertas, matrizes de SLA, alertas e destinatários. Valide a configuração de piloto antes de habilitar comunicações operacionais.", path:"acoes", destination:"Ações e Escalonamentos" },
  { id:"audit", group:"5. Validação e entrada em operação", title:"Revisar auditoria e dados antes do início operacional", detail:"Confirme evidências de cadastro, histórico, configurações, permissões, pendências e riscos. A revisão final deve ser feita por administrador autorizado.", path:"auditoria", destination:"Auditoria" },
  { id:"go-live", group:"5. Validação e entrada em operação", title:"Concluir formalmente o Start-up ACC", detail:"Retorne a esta página e utilize o procedimento oficial de conclusão abaixo do checklist. O checkbox não substitui a validação do servidor nem autoriza o go-live.", path:"startup", destination:"Start-up ACC / Conclusão" },
];

export function NewProjectStartupChecklist({ projectId }: { projectId: string }) {
  const storageKey = `acc:startup-checklist:v1:${projectId}`;
  const [completed, setCompleted] = useState<Record<string, boolean>>({});
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(storageKey);
      if (raw) {
        const parsed: unknown = JSON.parse(raw);
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
          const safe: Record<string, boolean> = {};
          for (const step of STEPS) safe[step.id] = (parsed as Record<string, unknown>)[step.id] === true;
          setCompleted(safe);
        }
      }
    } catch {
      // Navegador sem armazenamento: checklist permanece utilizável na sessão.
    }
    setLoaded(true);
  }, [storageKey]);

  function toggle(id: string, checked: boolean) {
    const next = { ...completed, [id]: checked };
    setCompleted(next);
    try { window.localStorage.setItem(storageKey, JSON.stringify(next)); } catch { /* armazenamento bloqueado */ }
  }

  const checkedCount = STEPS.filter((step) => completed[step.id]).length;
  const groups = [...new Set(STEPS.map((step) => step.group))];
  return (
    <section aria-label="Checklist de implantação de novo projeto" className="space-y-4">
      <div className="rounded-md border p-4">
        <h2 className="flex items-center gap-2 text-base font-semibold"><CheckSquare2 className="size-5" /> Checklist para configurar um novo projeto</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Marque cada etapa depois de concluí-la. Clique no título da etapa para abrir diretamente a página correspondente.
          O preenchimento é manual e não substitui a verificação dos dados pelo ACC.
        </p>
        <p className="mt-3 text-sm font-semibold" aria-live="polite">
          {loaded ? `${checkedCount} de ${STEPS.length} etapas marcadas (${Math.round(100 * checkedCount / STEPS.length)}%)` : "Carregando marcações..."}
        </p>
        <div role="progressbar" aria-valuemin={0} aria-valuemax={STEPS.length} aria-valuenow={checkedCount} aria-label="Progresso do checklist" className="mt-2 h-2 overflow-hidden rounded-full bg-muted">
          <div className="h-full bg-green-600 transition-all" style={{ width: `${100 * checkedCount / STEPS.length}%` }} />
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          As marcações deste checklist são salvas apenas neste navegador e dispositivo, por projeto; não são sincronizadas com outros usuários.
          A aprovação formal do Start-up continua independente.
        </p>
      </div>
      {groups.map((group) => (
        <div key={group} className="rounded-md border p-3 sm:p-4">
          <h3 className="mb-3 text-sm font-semibold">{group}</h3>
          <div className="space-y-2">
            {STEPS.filter((step) => step.group === group).map((step, index) => (
              <div key={step.id} className="flex gap-3 rounded-md border p-3">
                <input type="checkbox" id={`startup-check-${step.id}`} checked={Boolean(completed[step.id])}
                  onChange={(event) => toggle(step.id, event.target.checked)}
                  aria-label={`Marcar como concluído: ${step.title}`}
                  className="mt-1 size-5 shrink-0 cursor-pointer accent-green-600" />
                <div className="min-w-0 flex-1 space-y-1">
                  <Link href={`/${projectId}/${step.path}`}
                    className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary underline-offset-2 hover:underline focus-visible:underline">
                    {step.title} <ExternalLink className="size-3.5 shrink-0" aria-hidden="true" />
                  </Link>
                  <p className="text-sm leading-relaxed text-muted-foreground">{step.detail}</p>
                  <p className="text-xs text-muted-foreground">Abrir: {step.destination}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </section>
  );
}
