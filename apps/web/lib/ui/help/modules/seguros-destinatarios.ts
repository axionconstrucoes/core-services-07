// Catálogo de ajuda do módulo "seguros" — FASE 4 / D: destinatário externo de e-mail (canal oficial do tipo e-mail).
// Arquivo NOVO; conectado por UMA linha em ./seguros.ts e por ../manifests/seguros-destinatarios.ts (spread em ../manifests/seguros.ts).
import type { FeatureHelpDefinition } from "../types";
import { P_MANAGE, seg } from "./seguros-base";

const EXT =
  "Destinatário externo = e-mail cujo domínio não está na lista da Axion (axion.com.br) nem na lista de domínios permitidos. A validação do endereço (sintaxe, normalização, domínio plausível, sem quebra de linha ou lista de destinatários) é feita no servidor e repetida pelo banco.";

export const SEGUROS_DESTINATARIOS: FeatureHelpDefinition[] = [
  seg("canais.campo-confirmar-externo", "field", "Confirmo o destinatário externo", "Marque para autorizar um e-mail de domínio fora da Axion como canal oficial; fica registrado na auditoria.",
    `${EXT} Quando o canal é do tipo e-mail e o domínio é externo, o cadastro só prossegue com esta confirmação e o motivo. A confirmação grava quem confirmou, quando, o destinatário e o motivo em trilha que não pode ser alterada nem apagada. O sistema continua sem enviar nenhum e-mail.`,
    {
      criteria: ["E-mail de domínio da Axion ou permitido: não exige confirmação", "E-mail de domínio externo: exige esta marcação e o motivo", "Endereço inválido: recusado antes de qualquer gravação"],
      consequences: ["Sem a confirmação, nada é cadastrado.", "Com a confirmação, o canal é cadastrado NÃO verificado; a verificação continua sendo ato humano separado."],
      permissions: P_MANAGE,
      missingData: "Desmarcada com domínio externo = cadastro recusado.",
      humanReview: "Confirme que o endereço consta do documento-fonte da seguradora ou do banco antes de marcar.",
    }),
  seg("canais.campo-motivo-externo", "field", "Motivo do canal externo", "Por que este e-mail externo é o canal oficial; mínimo de 10 caracteres, gravado na auditoria.",
    `${EXT} O motivo é gravado junto com a confirmação (quem, quando, destinatário) e não pode ser alterado depois.`,
    {
      howToUse: ["Cite a fonte do endereço (por exemplo, a cláusula ou o documento da apólice) e a razão de usar este canal."],
      criteria: ["Obrigatório (10 a 1000 caracteres) somente quando o domínio é externo"],
      permissions: P_MANAGE,
      missingData: "Em branco com domínio externo = cadastro recusado.",
    }),
];
