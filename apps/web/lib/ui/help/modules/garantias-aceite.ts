// Catálogo de ajuda (Hover Text) do ACEITE COMPROVADO do cliente (Fase 4 / B). Arquivo NOVO; espalhado em UMA linha em modules/garantias.ts
// (o manifesto de garantias é derivado do catálogo). Conteúdo lido do código: migration 20261125100000, lib/garantias/acceptance.ts,
// app/[projectId]/garantias/actions.ts (proveAcceptanceAction) e components/garantias/records-panels.tsx (VerificationPanel).
import type { FeatureHelpDefinition, HelpElementKind } from "../types";

const VERSION = "2026-11-25";
const PERM_MANAGE =
  "GESTOR, GERENTE ou ADMINISTRADOR (acc_project_tier >= MANAGE, via quality_can_manage). COLABORADOR registra evidências, mas não registra aceite; LEITURA só consulta. A autoridade é o banco: a tela apenas reflete.";
const CICLO = "O aceite vale para UM ciclo: novo reparo ou reabertura volta o caso a 'sem aceite' (o histórico permanece em quality_warranty_acceptances).";

function entry(id: string, kind: HelpElementKind, title: string, shortDescription: string, description: string, extra: Partial<FeatureHelpDefinition> = {}): FeatureHelpDefinition {
  if (shortDescription.length > 160) throw new Error(`shortDescription > 160 em ${id}`);
  return { id, kind, module: "garantias", version: VERSION, title, shortDescription, description, ...extra };
}

export const GARANTIAS_ACEITE_HELP: FeatureHelpDefinition[] = [
  entry(
    "garantias.detalhe.aceite-situacao-prova",
    "status",
    "Situação do aceite (informado x comprovado)",
    "Sem aceite, informado por usuário interno, comprovado ou legado.",
    "INFORMADO = alguém da AXION registrou que o cliente aceitou; NÃO libera o encerramento. COMPROVADO = manifestação do cliente com evidência (e-mail ou documento/ata ingerido), hash SHA-256, data e manifestante externo identificado; é o único que libera o encerramento. LEGADO = aceite anterior à regra: vale para o caso que já estava encerrado, mas não libera caso aberto.",
    {
      purpose: "Separar o que a AXION afirma do que o cliente efetivamente manifestou, com prova rastreável.",
      source: "quality_warranty_cases.acceptance_status e histórico em quality_warranty_acceptances.",
      missingData: "Sem aceite: SEM DADOS (encerramento bloqueado: CUSTOMER_ACCEPTANCE_REQUIRED). Só informado: bloqueio CUSTOMER_ACCEPTANCE_NOT_PROVEN.",
      consequences: [CICLO],
    },
  ),
  entry(
    "garantias.detalhe.aceite-comprovado-secao",
    "message",
    "Aceite comprovado do cliente",
    "Registra a manifestação do cliente com evidência, hash e manifestante externo.",
    "Formulário que grava o aceite COMPROVADO. Exige evidência do caso (FATO) do tipo e-mail ou documento/ata, hash SHA-256 da fonte, data da manifestação (não anterior ao último reparo) e manifestante EXTERNO com nome e e-mail (o e-mail não pode ser de membro do projeto nem de quem registra).",
    {
      permissions: PERM_MANAGE,
      source: "RPC quality_warranty_acceptance_prove -> quality_warranty_acceptances (append-only).",
      limitations: ["O sistema não valida o conteúdo do documento nem o hash contra o arquivo: o hash é registrado para conferência humana e auditoria."],
      humanReview: "A conferência da evidência continua sendo humana.",
    },
  ),
  entry(
    "garantias.detalhe.aceite-comprovado-registrar",
    "button",
    "Registrar aceite comprovado",
    "Grava o aceite comprovado com versão otimista e auditoria.",
    "Chama quality_warranty_acceptance_prove com a versão lida do caso. Se outra pessoa alterou o caso antes, o banco recusa (VERSION_CONFLICT) e nada é gravado. Exige o caso Reparado ou Verificado e perfil de gestão; a ação fica na auditoria com evidência, hash e manifestante.",
    { permissions: PERM_MANAGE, consequences: [CICLO, "Libera o encerramento quando as demais guardas (verificação de eficácia EFICAZ etc.) estão atendidas."] },
  ),
  entry(
    "garantias.detalhe.aceite-comprovado-data",
    "field",
    "Data da manifestação do cliente",
    "Dia em que o cliente se manifestou (não futuro, não anterior ao último reparo).",
    "Data da manifestação do cliente conforme a fonte (e-mail, termo, ata). O banco recusa data futura e data anterior ao último reparo executado (ACCEPTANCE_BEFORE_REPAIR).",
    { source: "quality_warranty_acceptances.accepted_at", permissions: PERM_MANAGE },
  ),
  entry(
    "garantias.detalhe.aceite-comprovado-manifestante",
    "field",
    "Manifestante do cliente (nome)",
    "Pessoa EXTERNA que manifestou o aceite em nome do cliente.",
    "Nome de quem do cliente aceitou (2 a 200 caracteres). Não pode ser o nome de quem está registrando: lançamento interno não substitui a manifestação do cliente (MANIFESTANT_IS_INTERNAL).",
    { source: "quality_warranty_acceptances.accepted_by_name", permissions: PERM_MANAGE },
  ),
  entry(
    "garantias.detalhe.aceite-comprovado-contato",
    "field",
    "E-mail do manifestante (externo)",
    "E-mail de contato do cliente que manifestou o aceite.",
    "Identificação do manifestante externo. Formato de e-mail válido; o banco recusa e-mail de membro ativo do projeto ou de quem registra. Nenhuma mensagem é enviada a este endereço.",
    { source: "quality_warranty_acceptances.manifestant_contact", permissions: PERM_MANAGE, limitations: ["O sistema não confirma que o endereço pertence ao cliente; a conferência é humana."] },
  ),
  entry(
    "garantias.detalhe.aceite-comprovado-organizacao",
    "field",
    "Organização do manifestante",
    "Empresa ou órgão do cliente (opcional).",
    "Identifica a organização do manifestante externo (até 200 caracteres). Opcional.",
    { source: "quality_warranty_acceptances.manifestant_organization", permissions: PERM_MANAGE, missingData: "Em branco: SEM DADOS." },
  ),
  entry(
    "garantias.detalhe.aceite-comprovado-evidencia",
    "field",
    "Evidência do aceite comprovado",
    "E-mail, documento ou ata ingerida do próprio caso (fato).",
    "Seleciona a evidência do PRÓPRIO caso que sustenta a manifestação. Só são oferecidas evidências FATO dos tipos e-mail ou documento/ata; o banco recusa outro tipo, inferência, evidência de outro caso ou de outro projeto. A evidência usada fica travada contra reclassificação.",
    { source: "quality_warranty_acceptances.evidence_id", permissions: PERM_MANAGE },
  ),
  entry(
    "garantias.detalhe.aceite-comprovado-hash",
    "field",
    "Hash SHA-256 da fonte",
    "Impressão digital (64 caracteres hexadecimais) do documento ou e-mail ingerido.",
    "SHA-256 do arquivo/mensagem original, em hexadecimal minúsculo ou maiúsculo (64 caracteres). Registrado para conferir depois que a fonte não foi trocada. O banco recusa valor fora do formato (SOURCE_HASH_REQUIRED).",
    { source: "quality_warranty_acceptances.source_hash", permissions: PERM_MANAGE, limitations: ["O sistema não recalcula o hash a partir do arquivo."] },
  ),
  entry(
    "garantias.detalhe.aceite-comprovado-observacao",
    "field",
    "Observação do aceite comprovado",
    "Nota opcional sobre a manifestação.",
    "Texto livre (até 2000 caracteres) gravado com o registro. Não entra em nenhuma regra.",
    { source: "quality_warranty_acceptances.note", permissions: PERM_MANAGE, missingData: "Em branco: SEM DADOS." },
  ),
];
