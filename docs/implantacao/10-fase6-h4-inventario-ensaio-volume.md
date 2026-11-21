# 10 - Fase 6/H4 (atualizado na H5): inventário das 70 pendentes, ensaio com perfil de volume e caminho para cópia fiel (PLANO; nada foi aplicado)

Data da leitura: 21/11/2026. Base: `9858f7c` (integration/acc-noturna). Supabase operacional (`plbcvwostmdmdmrziwmd`): somente SELECT de contagens, tamanhos e metadados (`pg_class`, `pg_stat_user_tables`, `pg_constraint`, `cron.job`); nenhum conteúdo de linha e nenhum dado pessoal foi lido. Nada foi aplicado, registrado ou alterado; o hotfix P0 não foi reaplicado.

## 1. Contagem confirmada (**70** pendentes; 65 na H4 + 4 da onda L + 1 da onda M/H6e)

| Item | Valor |
|---|---|
| Registros remotos em `supabase_migrations.schema_migrations` | 134; última `20261119034721`; `md5(string_agg(version\|\|'_'\|\|name order by version))` = `70a176da74c9f88ac06b04d80bc55891` (igual ao hash do inventário `01`) |
| Corpo de `record_risk_alert_action` (md5 sem CR) | `930f6d75898793479b418950b0053bd9` (protegido) |
| Arquivos locais em `supabase/migrations` | 205 (200 na H4; +4 da Fase 6, +1 da Fase 7/H6e) |
| Aplicada fora do histórico (hotfix `20261121090000`) | 1 |
| Pendentes | **69** = 64 `pendente` + 3 `pendente-fora-de-ordem` + 1 `pendente-parcial` + 1 `pendente-decisao` |

Conferência: 134 + 1 + 69 = 204 (H4: 134 + 1 + 65 = 200). Na sequência (`scripts/data/implantacao-sequencia.json`): 67 em ondas executáveis (A 3, B 12, C 2, D 12, F 1, G 5, H1 10, I 8, P0 1, J 1, K 8, L 4) + 2 adiadas (`20261121177000` por decisão do dono; `20261123302000` só junto com o app). A diferença para os 57 do doc `09` são as 8 da onda K (Fase 5), já integradas e presentes na sequência.

As migrations de H2a (`20261208*`), H2b (`20261209*`) e H2c (`20261210*`) NÃO existiam na base da H4. **Atualização H5: entraram (204 arquivos; 69 pendentes; onda L com as 4; 67 em ondas executáveis + 2 adiadas).** Procedimento de atualização na seção 7 do doc `12`.

## 2. Por onda: dependências banco x app

Fonte de verdade das listas: `scripts/data/implantacao-sequencia.json`. Verificações somente leitura por onda: `scripts/sql/verificacao-onda-<id>.sql` (gerados; ver `12`).

| Onda | Arquivos | Conteúdo | Dependência banco x app |
|---|--:|---|---|
| A | 3 | fora de ordem: controles de caixa, `list_addable_profiles_for_project`, índice único de SLA | banco antes do app; A-bis só após checagem de duplicidade (feita em 21/11: 0 grupos duplicados) |
| B | 12 | segurança/permissão de 20/11 (inclui as duas intermediárias 130000/151000, ignoradas pela guarda de md5 quando o hotfix já está efetivo) | banco antes do app novo |
| C | 2 | centralização da regra de permissão e residual null-safe (101000 restaura/reafirma o corpo protegido) | banco antes do app novo |
| D | 12 | e-mail, envio, IA, SLA L2 (colunas e gatilhos em `risk_alert_outbox` e tabelas de entrega) | banco antes do app; pausar agendador e envio (ver lock da seção 4) |
| F | 1 | fluxo de aprovação de reemissão | independente; envio depende de flag desligada |
| G | 5 | Qualidade e Seguros (base) e `quality-analyst` | `20261122300000` ANTES do código que roteia para o Expert `quality-analyst` (senão `INVALID_EXPERT`, falha fechada) |
| H1 | 10 | Fase 3: tier, wrappers, integridade, vínculos, persistência | `20261123301000` antes do app novo; `302000` adiada (só com o app) |
| I | 8 | Fase 4 A+B: competências, endosso, aceite comprovado, coerência de seguros | `20261124101000` aplica falha-fechada `COMPETENCE_REQUIRED`: conceder competências logo após a onda; demais antes do app novo |
| P0 | 1 | portão final (confere e reafirma; não redefine) | n/a |
| J | 1 | destinatários externos (Fase 4/D) | banco antes do app novo; app antigo não confirma destinatário (falha fechada) |
| K | 8 | Fase 5: monitoramento universal, classificação/sinais, contatos externos, fonte EMAIL, governança | aplicar JUNTO com o app da Fase 5; cauda após o portão P0; nenhuma redefine `record_risk_alert_action` |
| H2 (adiada) | 1 | `20261123302000` revoga escrita direta nas 15 tabelas de Qualidade | SÓ com o app que chama as RPCs de `301000` |
| E (adiada) | 1 | `20261121177000` SLA MÉDIO 2 / BAIXO 5 d.u., prospectivo | decisão do dono; preserva as 9 abertas; depende de A-bis |

Estado remoto das 9 ações MÉDIO/BAIXO abertas: 6 PENDING/MEDIUM + 2 PENDING/LOW + 1 ESCALATED/LOW = 9 (contagem confirmada em 21/11). Regras de SLA ativas hoje: CRÍTICO 1, ALTO 4, MÉDIO 1, BAIXO 3 (sem duplicidade).

Rollback em arquivo (posição da H4; a H5 gerou os 43 faltantes, ver `03`): 22 das 65 têm `supabase/rollbacks/<nome>.rollback.sql`; 43 (Fases 1 a 3 e parte da 4) têm rollback apenas DESCRITO em `03` (dependem da captura de definições pré-janela). É um risco registrado em `12`, seção 6.

## 3. Perfil de volume (metadados, 21/11/2026)

Arquivo: `scripts/data/implantacao-perfil-volume.json` (só contagens e tamanhos).

| Tabela | Linhas (n_live_tup) | Heap | Total com índices | Índices |
|---|--:|--:|--:|--:|
| document_text_segments | 19.168 | 5,1 MB | 9,2 MB | 3 |
| emails | 710 | 1,5 MB | 6,0 MB | 12 |
| audit_log_entries | 4.363 | 1,7 MB | 2,7 MB | 5 |
| email_attachments | 573 | 1,1 MB | 2,4 MB | 7 |
| document_extractions | 190 | 0,09 MB | 1,9 MB | 2 |
| email_inline_images | 546 | 0,5 MB | 0,9 MB | 4 |
| diario_de_obra_reports | 201 | 0,4 MB | 0,9 MB | 6 |
| risk_alert_cases / sla_actions / risk_alert_outbox | 43 / 25 / 36 | < 0,1 MB cada | ~0,17 MB cada | 5 / 8 / 5 |

Banco total 64 MB; 130 tabelas em `public`; 10 projetos; 86 perfis; 21 memberships ativas; 11 jobs `pg_cron` ativos; 1 conexão não ociosa. Distribuição: `emails` = 510 GMAIL/INBOUND, 168 GMAIL/OUTBOUND, 32 sem provider; 43 casos de alerta, todos OPEN (origens INGESTION_ALERT 9, SCHEDULE_COMPARISON 10, WEEKLY_REPORT_SHEET 24); outbox 28 SUPPRESSED, 7 SENT, **1 PENDING** (conferir antes da janela).

Compatibilidade de DADOS REAIS com as novas restrições (contagens somente leitura): valores de `emails.provider` hoje são GMAIL e NULL, ambos aceitos pelo novo `emails_provider_check` (GMAIL, OUTLOOK ou NULL); os 3 valores de `risk_alert_cases.source_type` existentes são mantidos pelo novo CHECK (que só acrescenta EMAIL); 0 grupos de regras de SLA ativas duplicadas (a `20261118140000` cria o índice único); backfill de `risk_alert_outbox.delivery_state` toca só as 7 linhas SENT.

## 4. Ensaio com dados sintéticos de mesma ordem de grandeza

Implementação (somente banco local descartável, `127.0.0.1:55434`):
- `scripts/ensaio-implantacao-volume-lib.mjs`: gera linhas sintéticas por tabela do perfil (`generate_series`, colunas obrigatórias por tipo, hashes e CHECKs de coluna única respeitados, texto com largura derivada do tamanho médio de linha). Tabelas que não puderem ser geradas são REPORTADAS (hoje `risk_alert_outbox`, por um CHECK composto; 36 linhas, irrelevante para o tempo).
- `scripts/ensaio-implantacao-ondas-realpg.mjs`: com `ACC_ENSAIO_VOLUME_SCALE=<n>` gera o volume (1 = ordem de grandeza do remoto; 10 = dez vezes) ANTES das ondas; sem a variável o comportamento é o anterior. O ensaio agora também roda `verificacao-onda-<id>.sql` nas fases `antes` e `depois` de cada onda e a verificação P0 após cada migration.

Como rodar (Git Bash; runner com a senha local protegida por DPAPI, como nas fases anteriores):
`ACC_ENSAIO_VOLUME_SCALE=1 ACC_REALPG_URL=... ACC_REALPG_PKG_DIR=... node scripts/ensaio-implantacao-ondas-realpg.mjs --report <arquivo>`

Resultados (PostgreSQL 17.12 local; 183 verificações, 0 falhas em todas as execuções; soma do tempo das 63 migrations das ondas, LF / CRLF):

| Volume sintético | Soma LF | Soma CRLF | Maior migration |
|---|--:|--:|---|
| 0 (base anterior) | 1429 ms | 983 ms | `quality_foundation` ~215 ms |
| 1x (19.168 segmentos, 710 e-mails, 4.363 auditorias...) | 1266 ms | 1489 ms | `quality_foundation` (ordem de 150 a 250 ms) |
| 10x (191.680 segmentos, 7.100 e-mails, 43.630 auditorias...) | 1375 ms | 1121 ms | `quality_foundation` ~245 ms |

Leitura: o tempo NÃO cresce com o volume (variação dentro do ruído, 1 a 1,5 s no total). Esperado: nenhuma migration reescreve tabela grande. As únicas operações sobre tabela existente com volume são (a) `20261201100000` em `emails`: 5 colunas com DEFAULT constante (metadado, sem reescrita no PG 17), `ADD CONSTRAINT ... CHECK` (varre as 710 linhas) e 3 `CREATE INDEX` não concorrentes (bloqueiam ESCRITA em `emails` durante a criação): 37 a 49 ms localmente, mesmo a 10x; (b) `20261121130000` em `risk_alert_outbox` e tabelas de entrega: colunas aditivas e backfill das linhas SENT (7); (c) `20261204100000` em `risk_alert_cases`: troca de CHECK (43 linhas). Locks fortes registrados por arquivo no relatório do ensaio (`08`), todos em tabelas pequenas e cobertos por `lock_timeout = 5s`.

O que este ensaio PROVA: ausência de reescritas e de locks longos em volume 10x o atual, idempotência, P0 intacto por arquivo, existência/ausência dos objetos novos por onda. O que NÃO prova (e por que): (1) a distribuição REAL dos dados (valores que violem um CHECK/UNIQUE novo): só mitigado pelas consultas de contagem da seção 3, não por dados reais; (2) bloat, estatísticas, planos e latência de rede do Supabase; (3) contenção real (cron a cada 2 min, workflows do Gmail, usuários); (4) comportamento de extensões e de `pg_cron` do projeto hospedado; (5) tempo de `statement_timeout`/pooler. Os tempos são "ordem de grandeza", não previsão: some a latência de ida e volta por arquivo (estimar 0,3 a 1 s por arquivo pela rede; 65 arquivos = alguns minutos) e as conferências.

## 5. Cópia fiel dos dados: o que exige, opções e recomendação

Uma cópia fiel exige credencial operacional (string de conexão do banco ou acesso ao painel), que esta frente não tem e não deve ter. Opções reais:

| Opção | O que é | Custo | Ação humana | Fidelidade | Risco |
|---|---|---|---|---|---|
| 1. `pg_dump` + restore LOCAL | Eng executa `npx supabase db dump --db-url "$CONN"` (schema) e `... --data-only` (dados), restaura no Postgres 17 local descartável e roda o ensaio (`ACC_ENSAIO_MIGRATIONS_DIR` e restauração como espelho). Seguir `docs/backup-restore-procedure.md` (inclui a correção de ACL por default privileges) | Zero (banco de 64 MB) | Fornecer a conexão a quem executa o dump; máquina controlada; apagar a base depois | Alta (dados e distribuição reais; sem rede/cron/contenção) | Dados pessoais fora do Supabase: LGPD, disco criptografado, retenção mínima, registro de quem acessou |
| 2. Restaurar backup/PITR em projeto Supabase ISOLADO | No painel: restaurar o backup/PITR para um NOVO projeto (se o plano oferecer) e aplicar a sequência lá | Projeto novo com computação paga (confirmar custo e disponibilidade do plano no painel; esta leitura não informa o plano) | Dono autoriza o custo e executa/solicita a restauração | Muito alta (mesma plataforma, extensões e rede) | Duplica dados pessoais num segundo projeto; projeto precisa ser apagado depois |
| 3. Branch do Supabase | `create_branch` | Pago por hora | Dono confirma custo | Baixa para DADOS: branches nascem do conjunto de migrations (sem os dados de produção) | Branch só do schema não substitui a cópia dos dados; não criada |

RECOMENDAÇÃO: opção 1 como ensaio obrigatório antes da janela (custo zero, executável em minutos, mesma ferramenta do ensaio por ondas), com a máscara de colunas pessoais opcional se o dono preferir; e opção 2 apenas se o dono quiser um ensaio de plataforma (extensões, pg_cron, pooler) ou se o plano já tiver restauração para novo projeto sem custo adicional relevante. Em qualquer caso, a restauração precisa recriar a ACL conforme `docs/backup-restore-procedure.md`; a verificação P0 deve dar `ok = true` no espelho ANTES de aplicar as ondas.

## 6. Procedimento do ensaio completo (resumo)

1. Restaurar (opção 1) ou, na falta, gerar volume sintético (`ACC_ENSAIO_VOLUME_SCALE`).
2. `node scripts/gen-verificacao-onda.mjs --check` (verificações geradas em dia).
3. `node scripts/ensaio-implantacao-ondas-realpg.mjs --report docs/implantacao/08-relatorio-ensaio-ondas.md` com 0 falhas, em LF e CRLF.
4. Registrar contagem, hash do histórico e P0 no dia da janela (`12`, seção 1).
