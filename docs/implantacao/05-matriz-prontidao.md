# 05 - Matriz de prontidão (atualizada em 20/11/2026)

Base: `docs/implantacao-prontidao-b3-20261120.md`. Esta versão incorpora o inventário completo (`01`), a Frente A, a leitura de DNS (`04`) e os módulos novos (Qualidade, Garantias, Seguros). Somente leitura; nada foi aplicado.

Legenda: PRONTO = sem bloqueio conhecido; DEPENDE = precisa de ação/decisão humana; BLOQUEIA = não abrir envio real/produção antes de resolver.

## 1. Mudanças desde a matriz de 20/11 (B3)

- Frente A resolvida: `record_risk_alert_action` remoto é IDÊNTICO ao corpo local vigente (md5 sem CR `930f6d75898793479b418950b0053bd9`), SECURITY DEFINER, `search_path` vazio, sem EXECUTE para `anon`/PUBLIC. Estado: PROTEGIDO. O item "Hotfix" deixa de bloquear a segurança e passa a ser pendência de REGISTRO.
- Nova pendência: "hotfix aplicado fora do histórico" (sem linha em `supabase_migrations.schema_migrations`). Risco: ao aplicar o restante em ordem, as migrations 20261120130000 e 20261120151000 redefinem a mesma função com versões anteriores ao hotfix (ver `02`, "Atenção").
- Contagem: 36 migrations pendentes (eram 32 na B3; entraram os 5 arquivos `20261122*`, e o hotfix passou a ser contado como aplicado fora do histórico). O bloco `20261123*` da frente B ainda não existe nesta base.
- Resultado do DNS: sem SPF; sem DKIM nos seletores comuns; DMARC `p=none` sem relatórios (`04`).

## 2. Matriz

| Item | Situação (evidência) | Risco se ignorado | Prontidão | Ação / decisão |
|---|---|---|---|---|
| Hotfix `record_risk_alert_action` | Corpo remoto == local; PROTEGIDO (Frente A, recomprovado 20/11) | Regressão transitória por reaplicação em ordem das migrations 130000/151000 | PRONTO (efeito); DEPENDE (registro) | Registrar no histórico e blindar a ordem de aplicação (`02` seções 3 e 5) |
| Histórico de migrations | 134 registradas (hash conferido); 36 pendentes; 3 fora de ordem; hotfix fora do histórico | Aplicação fora de ordem, duplicidade, conciliação incorreta | DEPENDE | Decidir método de aplicação e opção de registro (`02` seção 5) |
| Migrations pendentes (36) | Nenhuma tabela/coluna/índice novo existe no remoto; nenhum arquivo apaga dados | Funcionalidades novas (respostas por e-mail, governança de IA, SLA L2, Qualidade, Seguros) indisponíveis em produção | DEPENDE | Ensaio em banco descartável com dados atuais, depois janela (`02`, `03`) |
| Backup/ponto de restauração | Procedimento existe (`docs/backup-restore-procedure.md`); PITR/plano do projeto não verificado | Sem retorno em caso de falha | DEPENDE | Confirmar PITR no painel; gerar dump e snapshot de ACL antes da janela |
| SPF | Ausente | Spam/rejeição; spoofing | BLOQUEIA o envio a destinatários reais | Publicar SPF após inventário de remetentes (`04` passo 2) |
| DKIM | Sem chave nos seletores comuns | DMARC não alinha; reputação | BLOQUEIA o envio real | Gerar chave no Workspace e publicar (`04` passo 3) |
| DMARC | `p=none`, sem `rua` | Sem proteção nem visibilidade | DEPENDE | Adicionar `rua`, observar, endurecer gradualmente |
| Modo de envio | Trava fail-closed (`ACC_OUTBOUND_MODE` diferente de `production` = piloto); flags de reemissão, seguros, respostas e Expert por e-mail desligadas por padrão | Envio real inadvertido | PRONTO no modo piloto | Conferir as variáveis (somente nomes em `04` seção 5) antes de qualquer janela |
| Respostas por e-mail | Depende de `Authentication-Results` do Google; migrations pendentes | Confirmações recusadas (fail-closed) ou ações sem governança | DEPENDE | Homologar depois de SPF/DKIM; decidir `ACC_EMAIL_WORKSPACE_TENANT_DOMAINS` |
| Caixas de e-mail / delegação de domínio | Conforme B3: aceites individuais incompletos; delegação/WIF pendentes | Coleta sem autorização ou falha | DEPENDE | Autorização formal; aplicar 20261107090000 e 20261121110000 |
| Correção de SLA MÉDIO/BAIXO (177000) | Remoto: MÉDIO 1 / BAIXO 3 dias úteis; aprovado: 2 / 5; só ações novas mudam | Divergência entre SLA aprovado e operacional; expectativa de prazo retroativo | DEPENDE (decisão expressa) | `02` seção 4; NÃO APLICAR sem autorização |
| SLAs CRÍTICO/ALTO | 1h corrida / 4h úteis (aprovados, não alterados nesta fase) | n/a | PRONTO | Nenhuma ação |
| Especialistas IA (Experts) | Limites e governança (`20261120120000`, `20261121150000`, `20261121174000`) e novo Expert de Qualidade (`20261122300000`) pendentes; IA nunca envia nem altera evidência | Consumo sem limite; Expert novo recusado (INVALID_EXPERT) | DEPENDE | Aplicar em ordem; chaves de IA só server-side; orçamento definido pelo dono |
| Módulo Qualidade | Código e UI na base; tabelas `quality_*` não existem no remoto | Telas sem dados/erro em produção | DEPENDE | Aplicar onda G; validar RLS e isolamento (`03` seções 3 e 4) |
| Garantias e Seguros | Código/UI na base; tabelas `insurance_*`, `bank_guarantees` ausentes; envio real bloqueado por flag + aprovação humana | Idem; risco de envio a seguradora | DEPENDE | Aplicar onda G com flag desligada; nenhum envio real |
| Permissões unificadas (frente B) | `acc_project_tier` (20261123*) ainda não integrada | Listas de papéis divergentes entre módulos | DEPENDE | Integrar frente B, depois acrescentar ao inventário e ao plano |
| Dados operacionais | 10 projetos (2 com "teste" no nome, 5 com "weg"); `risk_alert_outbox` 36 linhas (7 SENT); 25 ações SLA abertas (B3) | Reemitir/enviar sobre dados de teste ou casos encerrados | DEPENDE | Decidir o que é teste x real; não reprocessar outbox na janela |
| Projeto TESTE | Existem projetos com "teste" no nome (identificação por nome, a confirmar pelo dono); trava de piloto redireciona e-mails | Mistura de teste com operação | PRONTO com a trava; DEPENDE ao abrir produção | Marcar formalmente os projetos de teste e excluí-los do envio real |
| Piloto WEG | Piloto controlado (docs `piloto-weg-*`); envio só pela allowlist | Envio a terceiros fora do piloto | PRONTO no modo piloto | Qualquer abertura exige decisão do dono |
| Repositório seguro | Plano em `docs/seguranca/plano-repositorio-privado.md` | Código/evidências expostos | DEPENDE | Executar o plano (decisão humana) |
| Teste de consistência do plano | `scripts/test-implantacao-plano.mjs` (inventário x diretório; sem comando de aplicação operacional) | Plano desatualizado após novas migrations | PRONTO | Rodar em toda integração |

## 3. Resumo

Não está pronto para envio real. Bloqueios: (1) autenticação de domínio de e-mail (SPF e DKIM ausentes, DMARC sem relatório); (2) decisão e ensaio para aplicar 36 migrations em ordem, preservando o hotfix e tratando o registro de histórico; (3) decisões humanas: SLA MÉDIO/BAIXO, caixas/aceites, dados de teste x real. A segurança do hotfix está comprovada no remoto.

## Atualização Fase 5/F (21/11/2026)

Migrations: 192 arquivos locais, 57 pendentes, remoto inalterado desde 20/11 (134 registros; P0 protegido, md5 do corpo reconferido). Ensaio refeito sobre os 192 arquivos: 123 verificações, 0 falhas. SPF/DKIM/DMARC de `axion.com.br` reconsultados em 21/11/2026 (DNS público, somente leitura): inalterados (sem SPF, sem DKIM nos seletores comuns, DMARC `p=none` sem relatórios); isso bloqueia o ENVIO com autenticação alinhada, NÃO a leitura de caixas. Inventário Gmail/Outlook/Graph por camada em `04` (seção 6). Detalhe em `09`.

## Atualização Fase 6/H5 (21/11/2026)

Migrations: 204 arquivos locais, 69 pendentes (134 registradas + 1 hotfix fora do histórico + 69), remoto inalterado; entrou a onda L (Fase 6: revalidação de competências e conteúdo de envio, pilares e revisão de sinais, organizações globais só ADMIN, área QUALIDADE no SLA), cauda após K e após o portão P0, sem tocar `record_risk_alert_action`. Ensaio: 197 verificações, 0 falhas. Competências: ordem operacional OBRIGATORIA sobre competências: aplicar a `20261208100000` -> designar validador (documento/ata, aceite, prazo <= 180 dias) -> REVALIDAR competências (todas as existentes viram `REQUIRED` na própria migration) -> só então atos críticos (`12`, seção 5); sem validador designado e sem revalidação, os atos críticos são RECUSADOS (falha fechada). Rollbacks: arquivo para toda pendente (teste `test-implantacao-rollbacks`); migrations de dados/ordem marcadas IRREVERSÍVEIS no `03`.

## Atualização Fase 4/C

Migrations: sequência definida e ENSAIADA em PostgreSQL 17 local com dados representativos (105 verificações, 0 falhas; `07` e `08`). Proteção P0 de `record_risk_alert_action` verificada após cada migration, em variantes LF e CRLF, com controle negativo. Continua NÃO aplicado no operacional (48 migrations a aplicar, incluindo o portão `20261126100000`); `20261121177000` aguarda decisão; `20261123302000` aguarda o app. Prontidão do bloco: ensaio OK, execução PENDENTE de autorização.

## 9. Atualização Fase 7 / H6d (21/11/2026)

| Item | Situação (evidência) | Prontidão | Ação |
|---|---|---|---|
| Inventário | 134 registradas (hash conferido em 21/11), 207 locais, 72 pendentes (ondas M = H6e, N = watchdog e O = coleta Gmail por caixa incluídas) + hotfix fora do histórico | DEPENDE | autorização do Dono por onda |
| Compatibilidade com a CLI oficial | documentada e ensaiada (`14`); `db push` direto aplicaria 73 arquivos (inclui hotfix e adiadas): NÃO usar sem pasta cumulativa por onda | DEPENDE | decisão (a)/(b)/CLI: recomendado (b) + CLI só leitura |
| Permissão para escrever no histórico | só `postgres`/`supabase_admin` (catálogo); `service_role`/`authenticated` sem acesso | BLOQUEADO até a conexão de manutenção ser fornecida | confirmar o papel na janela |
| Pausa de jobs | 11 jobs `pg_cron` e 11 workflows com `schedule` listados (`15`); a lista de `12` 1.4 estava incompleta | DEPENDE | executar o runbook na janela |
