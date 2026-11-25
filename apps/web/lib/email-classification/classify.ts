// Motor determinístico de classificação de e-mail (Fase 5 / B). Puro: mesma entrada => mesma saída (idempotente por mensagem
// + RULE_VERSION). NÃO usa IA, NÃO altera a mensagem original, NÃO obedece instruções do conteúdo (DADO NÃO CONFIÁVEL).
//
// Princípios: (1) oficialidade NÃO é poder de alterar contrato: mensagem oficial nunca autoriza escopo/aditivo/prazo/reajuste/preço;
// (2) fail-closed: sem vínculo ativo e vigente, nenhuma autoridade é presumida; domínio compartilhado/ambíguo não vincula projeto;
// (3) INDÍCIO não é fato: sinais nascem is_indication=true, confirmed=false; (4) SEM DADOS quando faltar correlação — nunca inventar.
import { detectEmbeddedInstructions } from "../ai/security/external-content";
import { judgeParty, type PartyVerdict } from "./party";
import {
  DATE_RE,
  DIRECTIVE_TOPICS,
  DIRECTIVE_VERB,
  IMPACT_RE,
  MONEY_RE,
  NOTIFICATION_RE,
  PERCENT_RE,
  SIGNAL_RULES,
} from "./rules";
import { domainOf, excerpt, forwardedOriginalSender, isForwarded, norm, normAddress, sentences, splitQuoted } from "./text";
import {
  RULE_VERSION,
  UNKNOWN_PARTY,
  type AuthorityCheck,
  type ClassificationResult,
  type ClassifyContext,
  type EmailInput,
  type Officiality,
  type Pillar,
  type PartyResolution,
  type ProjectLinkStatus,
  type RiskSignalDraft,
} from "./types";
import { signalAxes } from "./pillars";

interface Source {
  ref: string;
  text: string;
}

const SCOPE_ALIASES: Record<string, string> = { ORDEM_SERVICO: "OS", ORDENS_DE_SERVICO: "OS", ORDEM_DE_SERVICO: "OS", NAO_CONFORMIDADE: "RNC" };
function scopeSet(scope: string[] | null | undefined): Set<string> {
  const out = new Set<string>();
  for (const raw of scope ?? []) {
    const key = norm(raw).toUpperCase().replace(/[\s-]+/g, "_");
    out.add(SCOPE_ALIASES[key] ?? key);
  }
  return out;
}

const AUTH_RANK: Record<AuthorityCheck, number> = {
  POSSIBLY_OUT_OF_SCOPE: 4,
  FORMAL_CHANGE: 3,
  NEEDS_CLIENT_APPROVAL: 2,
  WITHIN_DELEGATION: 1,
  NOT_APPLICABLE: 0,
};

function declaredValues(sentence: string): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const pct = [...sentence.matchAll(PERCENT_RE)].map((m) => `${m[1]}%`);
  const money = [...sentence.matchAll(MONEY_RE)].map((m) => `R$ ${m[1]}`);
  const dates = [...sentence.matchAll(DATE_RE)].map((m) => m[0]);
  if (pct.length) out.percentuais = pct;
  if (money.length) out.valores = money;
  if (dates.length) out.datas = dates;
  return out;
}

function quantify(pillar: string, sentenceNorm: string, ctx: ClassifyContext): Record<string, unknown> | null {
  if (pillar !== "CUSTO" && pillar !== "PRAZO") return null;
  const order = (ctx.facts.orders ?? []).find((o) => o.ref && sentenceNorm.includes(norm(o.ref)));
  const declared = declaredValues(sentenceNorm);
  if (order) {
    return {
      status: "CORRELACIONADO",
      fonte: "fatos do projeto (OC/pedido)",
      oc_ref: order.ref,
      fornecedor: order.supplier ?? "SEM DADOS",
      item: order.item ?? "SEM DADOS",
      data_prevista: order.dueDate ?? "SEM DADOS",
      cronograma_ref: order.scheduleRef ?? "SEM DADOS",
      custo_brl: order.costBRL ?? "SEM DADOS",
      declarado_na_mensagem: declared,
    };
  }
  if (Object.keys(declared).length > 0) {
    return { status: "DECLARADO_NA_MENSAGEM", aviso: "valores declarados pelo remetente; não verificados nem correlacionados", declarado_na_mensagem: declared, faltando: ["contrato/OC", "item", "cronograma", "custo"] };
  }
  return { status: "SEM_DADOS", faltando: ["contrato/OC", "item", "data", "cronograma", "custo"] };
}

function clauseFor(topic: string, ctx: ClassifyContext, verdict: PartyVerdict): string | null {
  const c = (ctx.facts.clauses ?? []).find((x) => x.topics.some((t) => t.toUpperCase() === topic));
  if (c) return c.ref;
  return verdict.match?.delegation_clause_ref ?? null;
}

export function classifyEmail(email: EmailInput, ctx: ClassifyContext): ClassificationResult {
  const notes: string[] = [];
  const sender = normAddress(email.from);
  const internalDomains = new Set(ctx.internalDomains.map((d) => d.toLowerCase()));
  const senderInternal = internalDomains.has(domainOf(sender));
  const forwarded = isForwarded(email.subject, email.bodyText);

  // ---- Fontes de texto (preservadas; a mensagem original nunca é alterada) ----
  const body = forwarded ? email.bodyText : splitQuoted(email.bodyText).fresh;
  const sources: Source[] = [
    { ref: `email:${email.id}#subject`, text: email.subject },
    { ref: `email:${email.id}#body`, text: body },
  ];
  for (const a of email.attachments ?? []) {
    if (a.available === false) {
      notes.push(`anexo indisponível: ${a.filename} (não analisado; nada foi presumido)`);
      continue;
    }
    sources.push({ ref: `email:${email.id}#attachment:${a.filename}`, text: `${a.filename.replace(/[_.-]+/g, " ")}. ${a.text ?? ""}` });
    if (!a.text) notes.push(`anexo sem texto extraído: ${a.filename} (análise limitada ao nome do arquivo; imagem não foi interpretada)`);
  }

  // ---- Prompt injection: sinal de risco da fonte; sentenças afetadas NÃO alimentam regras ----
  const allRaw = sources.map((s) => s.text).join("\n");
  const injection = detectEmbeddedInstructions(allRaw);
  const injection_flag = injection.length > 0;
  if (injection_flag) notes.push(`conteúdo com instrução embutida (${injection.map((i) => i.id).join(", ")}): tratado como DADO suspeito, não obedecido`);

  // ---- Parte / oficialidade ----
  const resolution = (addr: string): PartyResolution => ctx.partyByEmail[addr.toLowerCase()] ?? UNKNOWN_PARTY;
  let verdict: PartyVerdict;
  if (senderInternal) {
    verdict = { officiality: "INTERNA", party_kind: forwarded ? "INTERNA_ENCAMINHAMENTO" : "INTERNA", organization_id: null, match: null, link: "NONE", basis: "remetente de domínio interno" };
    if (forwarded) {
      const orig = forwardedOriginalSender(email.bodyText);
      if (orig) {
        const ov = judgeParty(resolution(orig));
        notes.push(`encaminhamento interno; remetente original ${orig}: ${ov.officiality} (${ov.basis}); oficialidade da mensagem permanece INTERNA`);
      } else notes.push("encaminhamento interno; remetente original não identificado");
    }
  } else {
    verdict = judgeParty(resolution(sender));
  }

  // Para mensagens internas/enviadas, o vínculo pode vir de destinatário externo com vínculo ativo.
  let linkedByRecipient: PartyVerdict | null = null;
  if (senderInternal) {
    for (const r of [...(email.to ?? []), ...(email.cc ?? [])].map(normAddress)) {
      if (internalDomains.has(domainOf(r))) continue;
      const v = judgeParty(resolution(r));
      if (v.link === "LINKED") {
        linkedByRecipient = v;
        break;
      }
    }
  }

  // ---- Vínculo de projeto ----
  const textNorm = norm(allRaw);
  const own = (ctx.facts.contractRefs ?? []).filter((r) => r && textNorm.includes(norm(r)));
  const foreign = (ctx.otherProjectRefs ?? []).filter((r) => r.ref && r.projectId !== ctx.facts.projectId && textNorm.includes(norm(r.ref)));
  let link: ProjectLinkStatus;
  let basis: string;
  if (foreign.length > 0 && own.length === 0) {
    link = "UNLINKED";
    basis = `a mensagem referencia contrato de OUTRO projeto (${foreign.map((f) => f.ref).join(", ")}); vínculo recusado`;
  } else if (foreign.length > 0 && own.length > 0) {
    link = "AMBIGUOUS";
    basis = "a mensagem referencia contratos de mais de um projeto";
  } else if (verdict.link === "AMBIGUOUS") {
    link = "AMBIGUOUS";
    basis = verdict.basis;
  } else if (verdict.link === "LINKED") {
    link = "LINKED";
    basis = `parte com ${verdict.basis}${own.length ? `; referência contratual ${own[0]}` : ""}`;
  } else if (linkedByRecipient) {
    link = "LINKED";
    basis = `destinatário externo com ${linkedByRecipient.basis}`;
  } else if (own.length > 0) {
    link = "LINKED";
    basis = `referência contratual do projeto no texto (${own[0]})`;
  } else {
    link = "CANDIDATE";
    basis = senderInternal
      ? "mensagem interna na caixa do projeto, sem referência contratual: candidato (revisão humana)"
      : `${verdict.basis}: candidato (sem prova de vínculo)`;
  }
  const project_id = link === "UNLINKED" || link === "AMBIGUOUS" ? null : ctx.facts.projectId;

  const base: ClassificationResult = {
    email_id: email.id,
    project_id,
    project_link_status: link,
    project_link_basis: basis,
    officiality: verdict.officiality,
    party_kind: verdict.party_kind,
    organization_id: verdict.organization_id,
    authority_check: "NOT_APPLICABLE",
    clause_ref: null,
    pillars: [],
    rule_version: RULE_VERSION,
    status: "NO_INDICATION",
    cannot_reason: null,
    injection_flag,
    signals: [],
    notes,
  };

  if (project_id === null) {
    return { ...base, status: "CANNOT_ANALYZE", cannot_reason: link === "UNLINKED" ? "PROJETO_INCORRETO_OUTRO_PROJETO" : "VINCULO_AMBIGUO_REVISAO_HUMANA" };
  }
  if (sources.every((s) => norm(s.text).length < 4)) {
    return { ...base, status: "CANNOT_ANALYZE", cannot_reason: "SEM_TEXTO_ANALISAVEL" };
  }

  // ---- Sinais por pilar + diretivas ----
  const signals: RiskSignalDraft[] = [];
  const seen = new Set<string>();
  const prefix = link === "CANDIDATE" && !senderInternal ? "[parte não confirmada no projeto] " : "";
  const fwdPrefix = forwarded ? "[encaminhado por usuário interno; autoria original não verificada] " : "";
  let authority: AuthorityCheck = "NOT_APPLICABLE";
  let clause_ref: string | null = null;
  let excludedByInjection = 0;
  const scope = scopeSet(verdict.match?.delegation_scope);
  const o: Officiality = verdict.officiality;

  for (const src of sources) {
    for (const s of sentences(src.text)) {
      if (detectEmbeddedInstructions(s.text).length > 0) {
        excludedByInjection += 1;
        continue;
      }
      const n = norm(s.text);
      const ev = excerpt(s.text);
      const ref = `${src.ref}@${s.offset}`;

      for (const rule of SIGNAL_RULES) {
        if (rule.id === "j-reclamacao" && o === "FORNECEDOR_SUBCONTRATADA") continue;
        if (!rule.all.every((re) => re.test(n))) continue;
        const key = `${rule.pillar}|${rule.kind}`;
        const quant = quantify(rule.pillar, n, ctx);
        if (seen.has(key)) {
          // Mesmo tipo já visto (ex.: assunto sem valores): troca por evidência mais rica (valores declarados/correlação).
          const idx = signals.findIndex((x) => x.signal_kind === rule.kind);
          const cur = signals[idx]?.quantified_impact as { status?: string } | null;
          if (idx >= 0 && cur?.status === "SEM_DADOS" && quant && (quant as { status?: string }).status !== "SEM_DADOS") {
            signals[idx] = { ...signals[idx], evidence_excerpt: ev, evidence_ref: ref, quantified_impact: quant };
          }
          continue;
        }
        seen.add(key);
        signals.push({
          ...signalAxes(rule.kind, rule.pillar),
          signal_kind: rule.kind,
          summary: `${prefix}${fwdPrefix}${rule.summary} Indício extraído da mensagem; não é fato comprovado.`,
          evidence_excerpt: ev,
          evidence_ref: ref,
          is_indication: true,
          confirmed: false,
          quantified_impact: quant,
        });
      }

      // Notificação oficial de parte reconhecida: prazo de resposta/regularização => pilar jurídico.
      if ((o === "OFICIAL_GERENCIADORA" || o === "OFICIAL_CLIENTE" || o === "REPRESENTANTE_DELEGADO") && NOTIFICATION_RE.test(n) && !seen.has("JURIDICO|NOTIFICACAO_OFICIAL")) {
        seen.add("JURIDICO|NOTIFICACAO_OFICIAL");
        signals.push({
          ...signalAxes("NOTIFICACAO_OFICIAL", "JURIDICO"),
          signal_kind: "NOTIFICACAO_OFICIAL",
          summary: `${fwdPrefix}Notificação oficial de parte reconhecida (${verdict.party_kind}); verificar prazo de resposta contratual. Não implica reconhecimento de procedência.`,
          evidence_excerpt: ev,
          evidence_ref: ref,
          is_indication: true,
          confirmed: false,
          quantified_impact: null,
        });
      }

      // Diretiva: checagem de autoridade (oficialidade ≠ poder de alterar contrato).
      if (senderInternal || o === "FORNECEDOR_SUBCONTRATADA") continue;
      let topics = DIRECTIVE_TOPICS.filter((t) => t.re.test(n));
      // EXECUCAO é tópico genérico: só vale sozinho (numa ordem de serviço/RNC o tópico é o da própria ordem).
      if (topics.length > 1) topics = topics.filter((t) => t.topic !== "EXECUCAO");
      if (topics.length === 0) continue;
      const emitted = /\b(emitimos|emitida|emitido|abrimos|segue (a |o )?(os|rnc|ordem)|encaminhamos (a |o )?(os|rnc|ordem))\b/.test(n);
      if (!DIRECTIVE_VERB.test(n) && !emitted) continue;
      for (const t of topics) {
        let check: AuthorityCheck;
        if (o === "OFICIAL_CLIENTE") check = t.contractual ? "FORMAL_CHANGE" : "NOT_APPLICABLE";
        else if (o === "OFICIAL_GERENCIADORA" || o === "REPRESENTANTE_DELEGADO") {
          if (!scope.has(t.topic)) check = "POSSIBLY_OUT_OF_SCOPE";
          else if (t.contractual) check = "FORMAL_CHANGE";
          else if (IMPACT_RE.test(n) && !scope.has("CUSTO") && !scope.has("PRAZO")) check = "NEEDS_CLIENT_APPROVAL";
          else check = "WITHIN_DELEGATION";
        } else check = t.contractual ? "FORMAL_CHANGE" : "POSSIBLY_OUT_OF_SCOPE";
        if (check === "NOT_APPLICABLE") continue;
        if (AUTH_RANK[check] > AUTH_RANK[authority]) {
          authority = check;
          clause_ref = clauseFor(t.topic, ctx, verdict);
        }
        if (check === "WITHIN_DELEGATION") continue;
        const kind =
          check === "POSSIBLY_OUT_OF_SCOPE" ? "ORDEM_FORA_DE_DELEGACAO" : check === "FORMAL_CHANGE" ? "ALTERACAO_CONTRATUAL_SEM_FORMALIZACAO" : "DEPENDE_APROVACAO_CLIENTE";
        const sk = `JURIDICO|${kind}|${t.topic}`;
        if (seen.has(sk)) continue;
        seen.add(sk);
        const why =
          check === "POSSIBLY_OUT_OF_SCOPE"
            ? `Instrução sobre ${t.topic} possivelmente fora da competência delegada${verdict.party_kind === "DESCONHECIDA" ? " (parte sem vínculo reconhecido)" : ""}`
            : check === "FORMAL_CHANGE"
              ? `Instrução sobre ${t.topic} altera termos contratuais: mensagem, ainda que oficial, não substitui aditivo/formalização`
              : `Instrução sobre ${t.topic} com impacto de custo/prazo: depende de aprovação do cliente`;
        signals.push({
          ...signalAxes(kind, "JURIDICO"),
          signal_kind: kind,
          summary: `${prefix}${fwdPrefix}${why}. Questão jurídica/comercial para revisão humana; nada foi executado ou aceito.`,
          evidence_excerpt: ev,
          evidence_ref: ref,
          is_indication: true,
          confirmed: false,
          quantified_impact: null,
        });
      }
    }
  }
  if (excludedByInjection > 0) notes.push(`${excludedByInjection} sentença(s) com instrução embutida excluída(s) da análise (permanecem no e-mail original)`);

  const pillars = [...new Set(signals.map((s) => s.pillar).filter((p): p is Pillar => p !== null))];
  const status = signals.length > 0 || authority !== "NOT_APPLICABLE" ? "ANALYZED" : "NO_INDICATION";
  return { ...base, authority_check: authority, clause_ref, pillars, status, signals };
}

/** Thread com vários remetentes: cada mensagem é classificada pelo SEU remetente e pelo texto NOVO (histórico citado é ignorado). */
export function classifyThread(messages: EmailInput[], ctx: ClassifyContext) {
  const ordered = [...messages].sort((a, b) => (a.sentAt ?? "").localeCompare(b.sentAt ?? ""));
  const results = ordered.map((m) => classifyEmail(m, ctx));
  return {
    results,
    senders: [...new Set(ordered.map((m) => normAddress(m.from)))],
    officialities: [...new Set(results.map((r) => r.officiality))],
    pillars: [...new Set(results.flatMap((r) => r.pillars))] as Pillar[],
  };
}
