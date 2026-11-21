# 07 - Sequência de implantação ENSAIADA (Fase 4/C) - PLANO; nada foi aplicado no operacional

Status: proposta tecnicamente ensaiada em PostgreSQL 17 local descartável. Nenhuma migration foi aplicada no Supabase operacional, nenhum registro de histórico foi alterado, o hotfix P0 NÃO foi reaplicado. A decisão de aplicar (por onda) é do dono.

Fontes: `scripts/data/implantacao-sequencia.json` (a sequência, lida pelo ensaio e pelo teste), `scripts/ensaio-implantacao-ondas-realpg.mjs` (ensaio local), `scripts/sql/p0-verificar-record-risk-alert-action.sql` (verificação P0 somente leitura), `08-relatorio-ensaio-ondas.md` (resultado por onda: tempo, locks, P0). Este documento SUPERA o que `02-plano-aplicacao.md` diz sobre a onda C e sobre o tratamento do hotfix.

> Fase 5/F (21/11/2026): contagens atualizadas em `09-fase5-reinventario-e-preparacao.md` (192 arquivos; 57 pendentes; as ondas I, P0 e J abaixo cobrem `20261124`..`20261127`; migrations das frentes A-E entram pela onda F5 automática do ensaio).

> Fase 6/H5 (21/11/2026): 204 arquivos; 69 pendentes; entrou a onda **L** (4 migrations da Fase 6, ver tabela). Ensaio completo: 197 verificações, 0 falhas.

## 1. Estado de partida (remoto) e o que é "47 pendentes"

Remoto: 134 migrations registradas + hotfix P0 `20261121090000` efetivo fora do histórico (corpo de `record_risk_alert_action` com md5 sem CR `930f6d75898793479b418950b0053bd9`). Localmente há 183 arquivos: 134 registradas, 1 hotfix efetivo, 47 pendentes e a nova `20261126100000` (portão P0, também pendente) = 48 a aplicar, das quais 2 ficam fora da sequência principal (`177000` por decisão e `302000` por acoplamento ao app), restando 46 na sequência principal.

## 2. Sequência (ordem numérica, com 3 exceções decididas)

| Onda | Migrations | Observações |
|---|---|---|
| A (fora de ordem) | 20261107090000, 20261116090000, 20261118140000 | Aplicadas PRIMEIRO, por serem pré-requisitos (110000, 160000) e por terem versão menor que a última remota. Ver seção 5. |
| B | 20261120100000 a 20261120190000 (12 arquivos) | Inclui as intermediárias 130000 e 151000 de `record_risk_alert_action` (seção 3). |
| C | 20261121100000, 20261121101000 | **A 20261121090000 NÃO é reaplicada** (já efetiva). Seção 4. |
| D | 20261121110000 a 20261121176000 (12 arquivos) | E-mail, envio, IA, SLA L2. |
| F | 20261121178000 | Fluxo de aprovação de reemissão. |
| G | 20261122100000, 101000, 200000, 201000, 300000 | A 300000 (lista de Experts, inclui `quality-analyst`) deve estar aplicada ANTES de publicar o código de Qualidade/Seguros que roteia para esse Expert; antes disso o banco recusaria a consulta (falha fechada, `INVALID_EXPERT`). |
| H1 | 20261123100000, 101000, 102000, 200000, 300000, 301000, 303000, 400000, 401000, 402000 | Fase 3. |
| I | 20261124100000, 101000, 102000, 20261125100000, 200000, 201000, 202000, 203000 (8 arquivos) | Fase 4 A+B (competências, dupla conferência de endosso, aceite comprovado, coerência/fundamentação de seguros). Redefinem funções de Seguros/Qualidade, nunca `record_risk_alert_action`; aplicadas ANTES do portão P0. Código do app da Fase 4 deve ser publicado junto (RPCs exigem competência/fonte). |
| P0 | 20261126100000 | Portão final: confere e reafirma a proteção; não redefine nada. |
| J | 20261127100000 | Fase 4 D (destinatários externos). Aplicada após o portão P0; não toca `record_risk_alert_action`; o ensaio confere o P0 depois dela também. |
| K | 20261201100000, 20261202100000, 20261203100000, 20261203110000, 20261204100000, 20261205100000, 20261205101000, 20261205102000 | Fase 5 (monitoramento universal de e-mail, classificação e sinais de risco, contatos externos, fonte de risco EMAIL, governança). Cauda após o portão P0; nenhuma redefine `record_risk_alert_action`; o ensaio confere o P0 após cada arquivo. Publicar junto com o app da Fase 5 (as RPCs de competência e de envio externo mudam de contrato). |
| L | 20261208100000, 20261209100000, 20261209101000, 20261210100000 | Fase 6 (H2a revalidação de competências + conteúdo de envio; H2b pilares/revisão de sinais e organizações globais só ADMIN; H2c área QUALIDADE no SLA). Cauda após K e após o portão P0; nenhuma toca `record_risk_alert_action` (P0 conferido após cada arquivo). Dependências reais: 20261208 <- 20261205100000/102000 e 20261124100000; 20261209100000 <- 20261202100000 e 20261203*; 20261209101000 <- 20261203110000; 20261210100000 <- tabelas de SLA/alertas (G, 20261204100000). A 20261208 marca TODAS as competências existentes como `REQUIRED`: aplicar o banco -> app -> designar validador -> revalidar -> só então atos críticos (`12`, seção 5). A 20261210 é prospectiva (as 9 abertas mantêm valor e hash). |
| H2 (adiada, app) | 20261123302000 | **Só junto com a versão do app que chama as RPCs de 301000.** Ver seção 6. |
| E (adiada, decisão) | 20261121177000 | SLA MÉDIO 2 e BAIXO 5 dias úteis, prospectivo. Seção 7. |

Regras de execução (iguais ao plano 02): um arquivo por transação (`psql -1 -v ON_ERROR_STOP=1`, `set lock_timeout='5s'`, `set statement_timeout='120s'`); parar na primeira falha; depois de CADA migration (não só por onda) rodar a verificação P0 da seção 3; backup e PITR anotados antes; agendador pausado e envio em modo piloto durante a janela.

## 3. Proteção P0 em todas as etapas

Verificação (somente leitura, `scripts/sql/p0-verificar-record-risk-alert-action.sql`), esperado `ok = true`: corpo (md5 sem CR) = `930f6d75898793479b418950b0053bd9`, `SECURITY DEFINER`, `search_path` vazio, sem EXECUTE para `anon` e `PUBLIC`, EXECUTE para `authenticated` e `service_role`. O ensaio também faz sondas reais negativas depois de cada migration: LEITURA, COLABORADOR sem papel no alerta e `anon` recusados, caso inalterado.

Achados do ensaio (105 verificações, 0 falhas; relatório em 08):

1. As migrations 130000 e 151000 já têm guarda por md5 (`md5(prosrc) in (c2f015a9..., 930f6d75...)`): partindo do estado remoto (hotfix efetivo) elas SÃO ignoradas e o corpo protegido nunca é rebaixado. A premissa do plano 02 de "passar por corpos intermediários" só vale para um replay a partir de banco SEM o hotfix.
2. A guarda compara o corpo BRUTO. `c2f015a9...` é o corpo do hotfix com finais de linha CRLF (checkout Windows) e `930f6d75...` é o mesmo corpo com LF; ambos são aceitos. Por isso o ensaio roda as DUAS variantes (LF e CRLF) e ambas passam. Um terceiro formato (por exemplo corpo com espaços alterados por editor) NÃO seria reconhecido pela guarda e a intermediária seria aplicada: por isso a verificação P0 (que ignora CR) é feita após cada migration e existe o portão final.
3. Controle negativo (ensaiado): colocando à força o corpo intermediário da 130000, a verificação P0 detecta (`corpo_protegido = false`), o portão `20261126100000` FALHA com `P0_GATE` (transação desfeita) e reaplicar a 101000 restaura o corpo protegido.
4. A 101000 (parcial) é aplicada inteira: no remoto o corpo de `record_risk_alert_action` já é idêntico; o que falta são `email_alert_action_risk_case_guard` e a correção de `finalize_ssma_form_submission`. A redefinição da função na 101000 reescreve o MESMO corpo (md5 sem CR igual antes e depois, comprovado) e reafirma as ACLs. Não é "reaplicar o hotfix": o arquivo do hotfix (090000) não é executado.
5. Nova migration `20261126100000_p0_gate_record_risk_alert_action` (justificativa): confere e reafirma a proteção ao fim das ondas, sem redefinir função (por isso o teste N1 de sobrescrita de funções não precisou de ajuste). Rollback: no-op.

## 4. Hotfix 20261121090000: registrar, não reaplicar

O plano 02 (onda C) sugeria reaplicar a 090000 por ser idempotente. Decisão desta fase: NÃO reaplicar. O corpo já é o protegido e a 101000 reafirma o mesmo corpo. Resta só o registro no histórico (procedimento da seção 5 do plano 02, `insert` da linha `20261121090000 / hotfix_risk_alert_action_authorization`), a executar apenas com autorização e depois de conferir que a linha não existe.

## 5. Migrations fora de ordem e registro do histórico

As três (20261107090000, 20261116090000, 20261118140000) têm versão menor que a última remota e não podem ser aplicadas por `db push`. Na sequência elas vão primeiro (onda A) por dependência e são aplicadas arquivo a arquivo. Resultado do ensaio: aplicam sem erro em banco com os dados representativos. Registro: correspondência por NOME, opções (a)/(b) do plano 02 inalteradas.

Correção ao plano 02 sobre a 20261118140000: ela NÃO falha se houver regra ativa duplicada; apenas emite aviso e NÃO cria o índice único (`sla_matrix_rules_active_key_unique`). Ensaiado com duplicata. Portanto: (1) rodar a pré-verificação de duplicidade antes; (2) depois de aplicar, CONFERIR que o índice existe (`select 1 from pg_indexes where indexname='sla_matrix_rules_active_key_unique'`).

## 6. Dependências banco x app

| Migration | Regra | Por quê |
|---|---|---|
| 20261123302000 | Banco DEPOIS do app (ou junto) | Revoga INSERT/UPDATE/DELETE de `authenticated` nas 15 tabelas de Qualidade/Garantias. Se aplicada antes de o app chamar as RPCs de 301000, as telas de Qualidade deixam de gravar. Reversível (rollback devolve os GRANTs). Ensaio: aplica por último, SELECT permanece, escrita direta fecha, P0 intacto. |
| 20261122300000 | Banco ANTES do código de Qualidade/Seguros que usa o Expert `quality-analyst` | Sem ela o banco recusa a consulta (falha fechada). Reescreve CHECKs e funções; toma ACCESS EXCLUSIVE breve em 5 tabelas (seção 8). |
| 20261123301000 | Banco ANTES do app novo | As RPCs precisam existir antes do app chamá-las. |
| 20261121177000 | Só com decisão | Seção 7. |

Ordem de publicação sugerida: ondas A a H1 + P0 (banco) -> publicar o app -> 302000 (H2) -> smoke -> E (se decidida).

## 7. SLA MÉDIO 2 / BAIXO 5 (prospectivo) - revisão da 20261121177000

Revisão: a migration já é prospectiva e idempotente. Desativa a regra geral antiga e cria a nova (histórico preservado), atualiza em lugar as regras por área, falha com `SLA_MATRIX_DUPLICATE_ACTIVE` se houver duplicata, não toca `sla_actions`, não altera CRÍTICO/ALTO nem `record_risk_alert_action`. Por isso NÃO foi criada migration prospectiva adicional (`2026112601xxxxx`): seria duplicação sem ganho de segurança.

Ensaio (dados representativos: 6 regras como no remoto, 9 ações MÉDIO/BAIXO abertas com prazo já atribuído, 3 concluídas, ALTO/CRÍTICO): depois da 177000 as 9 abertas mantêm exatamente o `assume_due_at` e o estado (hash idêntico); `sla_actions` inalterada; regras ativas MÉDIO = 2 dias úteis e BAIXO = 5 (2 regras antigas ficam inativas, histórico); `sla_ssma_assume_due_at` devolve 2/5 dias úteis; uma ação nova criada depois usa o prazo novo; reaplicar não altera nada; P0 intacto. Cenário com duplicata ativa: falha limpa e sem efeito parcial. Não foi alterado nenhum SLA operacional. Pendências que são decisão do dono: autorizar/data/hora, comunicação e eventual extensão retroativa para as 9 abertas (NÃO implementada).

## 8. Tempos e locks (ver 08)

Banco pequeno: 46 migrations em menos de 2 s de soma no ensaio local; as maiores são `quality_foundation` (~180 ms) e `seguros_garantias_model` (~130 ms). Locks fortes em tabelas preexistentes que merecem atenção de janela (todas pequenas, cobertas por `lock_timeout` de 5 s): `ai_consult_usage`, `alert_email_messages` e `risk_alert_action_events` (ACCESS EXCLUSIVE na 20261120170000: durante milissegundos nenhuma ação de alerta grava eventos), `construmanager_version_review_deliveries` (130000 de 21/11), `email_mailbox_collection_controls`, `insurance_endorsements` e `quality_warranty_cases`. `sla_matrix_rules` leva `ShareLock` na A-bis. Todos duram a transação do arquivo (milissegundos no ensaio); em produção o agendador pausado evita contenção.

## 9. Como reexecutar o ensaio

`ACC_REALPG_URL=postgres://...@127.0.0.1:55434/postgres ACC_REALPG_PKG_DIR=<pasta com pg> node scripts/ensaio-implantacao-ondas-realpg.mjs` (sem a variável é PULADO). Recusa qualquer host que não seja 127.0.0.1:55434, cria bases `acc_f4c_*` e as apaga. Variável opcional `ACC_ENSAIO_REPORT=<caminho>` regrava o relatório 08. O ensaio não contém comando de aplicação operacional (`test-implantacao-plano` continua validando isso).
