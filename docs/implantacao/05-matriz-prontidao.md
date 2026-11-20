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
