# Pipeline de classificação de e-mail (Fase 5 / G)

O "chamador" que liga as peças das frentes A–D da Fase 5. **Desligado por padrão. DRY_RUN por padrão.**

```
emails (A: ingeridos)  ->  acc_resolve_external_party (C)  ->  classifyEmail (B)  ->  email_message_classifications
                                                                                   +  email_risk_signals
                       ->  acc_external_candidate_register (C) para participante externo desconhecido
email_risk_signals     ->  collect-email-risk-cases (D, fonte EMAIL; NÃO alterada aqui)  ->  casos de risco
```

## Onde está

| Peça | Arquivo |
| --- | --- |
| Pipeline (puro, store/resolvedor injetáveis) | `apps/web/lib/email-pipeline/pipeline.ts` |
| Flags | `apps/web/lib/email-pipeline/config.ts` |
| Store SQL (conexão de serviço) + adaptador RPC | `apps/web/lib/email-pipeline/sql-store.ts` |
| Store em memória (testes/dry-run local) | `apps/web/lib/email-pipeline/memory-store.ts` |
| Runner | `scripts/email-classify-run.mjs` |
| Testes | `scripts/test-f5-g-pipeline.mjs` (puro, CI) e `scripts/test-f5-g-pipeline-realpg.mjs` (Postgres 17 real, local) |

Não há migration nova: o pipeline só usa tabelas/RPCs das migrations 20261201..20261205 já existentes.

## Como ligar

| Variável / argumento | Efeito |
| --- | --- |
| (nada) | `DESLIGADO`: o runner imprime a razão e sai com 0, sem conectar a nada |
| `ACC_EMAIL_CLASSIFY_ENABLED=1` | liga o pipeline em **DRY_RUN** (lê, resolve, classifica em memória e reporta; não grava nem registra candidatos) |
| `--apply` **e** `ACC_EMAIL_CLASSIFY_APPLY=1` | grava classificações/sinais e registra candidatos. Só um dos dois => continua DRY_RUN |
| `--dry-run` junto com `--apply` | prevalece o modo seguro |
| `ACC_EMAIL_PIPELINE_DATABASE_URL` | conexão de **serviço**, só servidor/worker (nunca frontend, nunca impressa) |
| `ACC_EMAIL_CLASSIFY_ALLOW_REMOTE=1` | obrigatório para `--apply` em host que não seja 127.0.0.1/localhost (decisão do dono) |
| `--project <uuid>`, `--limit <n>`, `--internal-domains a.com,b.com` | escopo (padrão: todos os projetos, 500, `axion.com.br`) |

```
ACC_EMAIL_CLASSIFY_ENABLED=1 ACC_EMAIL_PIPELINE_DATABASE_URL=... node scripts/email-classify-run.mjs            # dry-run
ACC_EMAIL_CLASSIFY_ENABLED=1 ACC_EMAIL_CLASSIFY_APPLY=1 ... node scripts/email-classify-run.mjs --apply         # grava
```

**Nenhum workflow do GitHub Actions foi criado** e nada o agenda. Ligar em produção (cron/Actions) é decisão do dono, depois de aplicar as migrations A–E e homologar.

## Regras implementadas

- **Projeto da mensagem** = `emails.project_id`. Sem projeto => `UNLINKED` / `CANNOT_ANALYZE (SEM_PROJETO)` / `EXTERNA_NAO_CLASSIFICADA`; nunca oficial. (No banco, `emails.project_id` é `NOT NULL`; o caminho existe para stores que o permitam e está provado no teste puro.)
- **Resolução de partes em lote**: uma chamada a `acc_resolve_external_party` por (projeto, e-mail) por execução (cache), para remetente, destinatários, cópia e remetente original de encaminhamento. Domínios internos não são resolvidos.
- **Resolvedor estrito**: ao contrário de `resolveExternalParty` (fail-closed para autorização), o pipeline lança em erro de transporte. Motivo: a classificação é idempotente por `(email_id, rule_version)`; congelar "desconhecido" por falha transitória seria permanente. A mensagem fica `ERRO_NA_CLASSIFICACAO` e é reprocessada na execução seguinte. Resposta válida `known=false` continua sendo "desconhecido".
- **Domínio compartilhado/ambíguo** => `AMBIGUOUS`, sem projeto e sem sinais (motor de B).
- **Sem indício, sem sinal**; sinais nascem `is_indication=true`, `confirmed=false`. Conteúdo é dado não confiável; mensagem com instrução embutida fica `injection_flag` e **não** gera candidato.
- **Mensagem original nunca é alterada** (teste compara o digest de `public.emails`).
- **Candidatos** (`acc_external_candidate_register`, status PENDING; decisão humana): participante externo cuja resolução é `known=false`, e só quando a classificação foi **criada agora** (reexecução não incrementa `message_count`). Um contato novo num domínio JÁ vinculado ao projeto resolve como `known` (casa pelo domínio) e **não** vira candidato — é decisão de C.
- **Anexos**: só metadados de A (`attachments_meta`); `UNAVAILABLE` é registrado, nunca inventado. Não há extração de texto de anexo no pipeline (a análise do anexo fica limitada ao nome do arquivo).

## Reconciliação

Todo relatório traz `ingeridas × classificadas × sem classificação (com motivo)`, com identidade conferida (`identity_ok`):
`classified_by_status`, `cannot_analyze_by_reason`, `unclassified_by_reason` (`PENDENTE_DRY_RUN`, `ERRO_NA_CLASSIFICACAO`) e, como contexto fora da identidade, `not_ingested_by_reason` (`email_ingestion_exclusions` de A). A saída do runner contém só ids e contagens.

## Real × fixture

| Item | Estado |
| --- | --- |
| Migrations A–E, RPCs de C, tabelas A/B/C, store SQL, motor de B, coletor de D | **REAL**, exercitados em Postgres 17 local (base descartável) |
| Organizações, vínculos, mensagens (@weg.net, gerenciadora, fornecedor), usuários | **FIXTURE sintética** |
| "Conexão de serviço" | superusuário local + claims `role=service_role` por transação (o adaptador `createSqlRpcClient` faz o mesmo contra o banco que receber a URL) |
| Leitura de caixas Gmail/Graph | **não faz parte do pipeline** (é de A); nada aqui lê caixas ou envia e-mail |
| Execução contra o Supabase operacional | **NÃO realizada** (somente leitura permitida e não necessária) |
| Agendamento/Actions | **inexistente** |

## Limitações e riscos conhecidos

- O adaptador SQL assume conexão com privilégio para `set_config` de claims e `execute` nas RPCs de C; numa conexão `postgres` do Supabase isso vale, mas **não foi testado no operacional**.
- `loadProjectContext` fornece só `contractRefs` (de `external_org_project_links.contract_ref`) e referências de outros projetos; cláusulas e OCs (`ProjectFacts.clauses/orders`) ainda não têm fonte ligada, então impactos ficam `DECLARADO_NA_MENSAGEM`/`SEM_DADOS`.
- Mudança de `RULE_VERSION` reclassifica (nova linha por versão); sinais antigos permanecem (histórico).
- `--limit`: a consulta traz primeiro as mensagens SEM classificação (mais antigas primeiro), depois as já classificadas; a reconciliação cobre apenas as mensagens do lote consultado.
