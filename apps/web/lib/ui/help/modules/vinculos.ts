// Catálogo de ajuda (Hover Text) do VÍNCULO ESTRUTURADO alerta -> RNC/garantia/sinistro (fase 3/D).
// Arquivo NOVO, conectado por UMA linha de spread em modules/pilares.ts e UMA entrada no manifesto de pilares.
// Conteúdo lido do código: migration 20261123303000 (acc_alert_links), lib/pilares/alert-links.ts e alert-links-data.ts.
import type { FeatureHelpDefinition } from "../types";

export const PILARES_VINCULOS_HELP: FeatureHelpDefinition[] = [
  {
    id: "pilares.alerta.origem-vinculo",
    kind: "status",
    module: "pilares",
    title: "Origem do vínculo do alerta",
    shortDescription: "Mostra se a RNC/garantia/sinistro foi vinculado de forma registrada ou só pelo texto da origem (dado antigo).",
    description:
      "Indica como o alerta se liga ao item. 'Vínculo registrado' vem da tabela estruturada acc_alert_links (criada por uma pessoa pela RPC acc_alert_link_create, ou convertida de forma conservadora do texto 'ALERTA:<id>'). 'Vínculo pelo texto da origem (dado antigo)' é o recurso de reserva: a referência de origem do item cita o id ou o código visível do alerta, mas ainda não há registro estruturado.",
    purpose: "Dar transparência sobre a força do vínculo e permitir que a gestão confirme ou desfaça ligações antigas baseadas só em texto.",
    howItWorks:
      "Leitura somente. O vínculo registrado ativo sempre aparece; um vínculo registrado e depois DESFEITO por uma pessoa (com motivo) impede que o texto antigo o traga de volta. Sem registro estruturado, vale a referência de texto. Vincular ou desvincular nunca altera o estado da RNC, da garantia ou do sinistro, e RESOLVIDO do alerta continua sem encerrá-los.",
    data: ["acc_alert_links (alerta, tipo da entidade, id da entidade, origem do vínculo, desvínculo e motivo)", "origin_ref/source_ref como reserva para dados antigos"],
    criteria: [
      "Alerta e entidade precisam ser do mesmo projeto; o banco recusa vínculo entre projetos.",
      "Registrar o vínculo exige perfil de registro (COLABORADOR ou superior); desvincular exige gestão e motivo de pelo menos 10 caracteres; nada é apagado (o histórico é preservado).",
    ],
    source: "Tabela acc_alert_links lida sob RLS do projeto; RPCs acc_alert_link_create e acc_alert_link_unlink.",
    refresh: "A cada abertura da tela do alerta.",
    missingData: "Se a tabela de vínculos ainda não existir no ambiente, a tela usa somente o texto da origem; se a leitura falhar, informa que o vínculo está indisponível.",
    permissions: "Leitura: membros do projeto (RLS). Vincular: COLABORADOR, GESTOR, GERENTE ou ADMINISTRADOR. Desvincular: GESTOR, GERENTE ou ADMINISTRADOR. Regra única: acc_project_tier.",
    limitations: ["Esta tela não cria nem desfaz vínculos: usa a leitura.", "O vínculo retroativo só foi criado quando o texto continha exatamente um UUID 'ALERTA:<id>' de alerta do mesmo projeto; casos ambíguos ficaram de fora."],
    humanReview: "Confirmar ou desfazer um vínculo é decisão humana registrada com autor, data e motivo.",
    version: "2026-11-21",
  },
];
