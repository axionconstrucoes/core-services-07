# Fase 6 / H2c — Qualidade nos alertas, EXPERTS x sinais de e-mail e provedor de IA

Escopo: sem chamada real de IA (guarda `block-live-ai`), sem alteração no Supabase operacional. Tudo abaixo é código, testes com provider FAKE e migration não aplicada.

## 1. Qualidade como área própria de alertas/SLA

- Pilar QUALIDADE continua pilar. Antes, o coletor de e-mail (`collect-email-risk-cases.ts`) mapeava QUALIDADE para a área ENGENHARIA da Matriz. Agora `SlaArea` tem `"QUALIDADE"` e `EMAIL_PILLAR_AREA.QUALIDADE = "QUALIDADE"`. O Expert da área já existia (`quality-analyst`; `expertForArea("QUALIDADE")`).
- Seguros, garantias e sinistros continuam respondendo pelo JURÍDICO (regra `LEGAL_KIND`, inalterada).
- Compatibilidade com H2b: o coletor continua lendo `pillar`/`signal_kind`. H2c não mexeu em `lib/email-classification/*`. Se H2b tornar o pilar nulo para sinais Jurídico/Comercial, `emailSignalArea` já devolve `null` para pilar desconhecido (caso não elegível) — H2b deve entregar `functional_area` e a ligação no coletor deve ser combinada na integração.
- Migration `20261210100000_quality_alert_area_sla.sql` (rollback em `supabase/rollbacks/`):
  1. amplia os CHECK de área de `sla_area_responsibles`, `sla_matrix_rules`, `sla_actions` e `risk_alert_cases` com QUALIDADE (localiza a constraint pela definição; só amplia);
  2. semeia regras QUALIDADE por obra e criticidade onde já existe regra geral ativa: CRÍTICO 1h corrida, ALTO 4h úteis, MÉDIO 2 d.u., BAIXO 5 d.u.; escalonamento/respond/complete/notificação copiados da regra geral; CRÍTICO/ALTO nunca ficam mais frouxos que a regra geral da obra (se a geral é mais rígida na mesma unidade, mantém a geral); CRÍTICO/ALTO exigem confirmação de ciência;
  3. prospectiva: não toca `sla_actions` nem `sla_action_escalations` (as 9 ações abertas mantêm prazos); não redefine nenhuma função (P0 `record_risk_alert_action` md5 930f6d75898793479b418950b0053bd9 intacto).
- Não criada: `sla_area_responsibles` de QUALIDADE (depende de pessoas; cada obra configura na Matriz). Sem responsável configurado, o motor sinaliza revisão de configuração em vez de inventar um.
- Limitação conhecida: as RPCs de escalonamento de rejeição de recomendação (`reject_relevant_finding`, migrations 20260904*) validam a área contra a lista antiga de 9 áreas; a rejeição de recomendação relevante não oferece QUALIDADE. Não redefinido para não reescrever 3 gerações de função fora do escopo.
- Matriz de SLA (`DEFAULT_SLA_MATRIX`) não mudou: já era CRÍTICO 1h/ALTO 4h úteis/MÉDIO 2 d.u./BAIXO 5 d.u.
- Rótulos/UI: `slaAreaLabels.QUALIDADE = "Qualidade"`, especialidade "qualidade" na consulta do alerta, "Analista de Qualidade" no botão ESPECIALISTA do e-mail.

## 2. EXPERTS conectados ao pipeline de sinais

Arquivo: `lib/risk-alerts/experts/email-signal-context.ts`.

- Quando o caso nasceu de e-mail (`risk_alert_cases.source_type = 'EMAIL'`, `source_id` = `email_risk_signals.id`), o Expert recebe, junto da pergunta, o sinal e a classificação (`email_message_classifications`) como DADO NÃO CONFIÁVEL: conteúdo do e-mail dentro do envelope `wrapExternalContent` (`lib/ai/security/external-content.ts`), com proveniência (id do e-mail, id do sinal, `evidence_ref`, `rule_version`), separação FATO x INFERÊNCIA, status INDÍCIO NÃO CONFIRMADO x CONFIRMADO, aviso/incerteza se houver texto com cara de instrução, e regra explícita de que o e-mail nunca autoriza escopo, aditivo, prazo, reajuste ou preço.
- Pontos de ligação: ciclo do worker / ESPECIALISTA por e-mail (`cycle-expert-consultant.ts`, Expert único e curadoria CEO) e a consulta na tela do alerta (`load-alert-consult-subject.ts`). Somente leitura, sempre filtrando por obra; outra origem, outra obra ou falha => sem contexto (nunca inventa).

## 3. Provedor real de IA — o que existe (verificado só por NOMES)

Código (`resolve-provider-for-expert.ts`, `anthropic-config.ts`): cada Expert resolve variável específica > `AXION_AI_PROVIDER` > `fake`. "Real" = `anthropic` com `ANTHROPIC_API_KEY` e `ANTHROPIC_MODEL`; sem eles falha fechada (nunca cai em fake).

Variáveis por Expert: commercial-director `AXION_AI_PROVIDER_COMMERCIAL_DIRECTOR`; esg-director `..._ESG_DIRECTOR`; ceo `..._CEO`; legal-consultant `..._LEGAL_CONSULTANT`; planning-director `..._PLANNING_DIRECTOR`; engineering-director `..._ENGINEERING_DIRECTOR`; quality-analyst `..._QUALITY_ANALYST`.

Evidências coletadas:

| Fonte | Resultado |
| --- | --- |
| `.env.local` do repo principal (apps/web) | NENHUMA variável `AXION_AI_PROVIDER*` nem `ANTHROPIC_*` definida (só nomes GOOGLE_GMAIL_*, AXION_EMAIL_PROVIDER). |
| `.env.example` | Lista apenas `AXIA_CHAT_*` (assistente de uso AXIA, outro produto); não documenta `AXION_AI_PROVIDER*`/`ANTHROPIC_*`. |
| Vercel (MCP, equipe axionconstrucoes-projects) | Projeto `axion-contract-intelligence` (prj_BZjt...): lista de variáveis VAZIA (0). Projeto `axion-contract-intelligence-5d3g` (prj_n9RS...): a consulta foi NEGADA pelo classificador de permissão do ambiente; NÃO contornada. Não é possível afirmar a configuração de IA em produção. |

Conclusão por Expert (com a evidência acima): para TODOS os 7 Experts (commercial-director, esg-director, ceo, legal-consultant, planning-director, engineering-director, quality-analyst) o estado comprovado é "somente fake" no ambiente local e no projeto Vercel consultado; produção real NÃO comprovada (segundo projeto Vercel não consultado e, nos workers, segredos ficam em GitHub Secrets, também não lidos). A tela de Experts passa a mostrar a situação calculada com o ambiente do servidor.

### Rótulo SIMULADA

- `lib/ai/routing/provider-status.ts`: `describeExpertProvider` / `listExpertProviderStatus` (estados SIMULADO_FAKE, REAL_CONFIGURADO, REAL_INCOMPLETO, NAO_IMPLEMENTADO; só nomes, nunca valores), `labelAnswerForProvider` (prefixo "RESPOSTA SIMULADA — provedor de teste (fake); NÃO é análise real de IA." idempotente; misto rotula com ressalva), `isSimulatedAnswerText`.
- Fluxo de ESPECIALISTA (ciclo e e-mail): `CycleExpertAnswer` ganhou `simulated`, `providerIds`, `emailSignalContextUsed`; o rótulo fica no próprio texto persistido (histórico do caso, `email_specialist_consultations.answer_text`). O e-mail de resposta sai com assunto `[SIMULADA] Re: ...` e corpo que diz que não deve ser usado como parecer.
- Telas: hub Experts IA mostra "Provider: SIMULADA (provedor fake/teste)" por Expert (ou "IA real ... configurada"/"incompleta"); painel de consulta e consulta do alerta dizem "Resposta SIMULADA".
- Não tocado: `components/ssma/field-records/record-consult.tsx` ainda diz "Resposta de TESTE" (fora do dono; recomenda-se alinhar).

## 4. Testes

- `scripts/test-quality-alert-area-sla-sql.mjs` (PGlite, 12 verificações): CHECKs, sementes, valores aprovados, não enfraquecer graves, prospectivo (hash de sla_actions), idempotência, P0, rollback.
- `scripts/test-f6-h2c-experts-qualidade.mjs` (12 verificações, provider fake): estado do provedor, rótulo, contexto do sinal, injeção, loader por obra, ESPECIALISTA com caso EMAIL, curadoria CEO, e-mail SIMULADA, UX, QUALIDADE.
- Ajuste em `scripts/test-f5-d-email-alerts.mjs`: expectativa QUALIDADE (antes ENGENHARIA) e 10 áreas.
