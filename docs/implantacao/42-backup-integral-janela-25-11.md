# 42 - Backup integral de produção para a janela de quarta-feira 25/11/2026, 08h BRT (PREPARADO; NÃO EXECUTADO)

Atualiza a data dos docs 23, 38, 39, 40 e 41 (decisão da Diretoria em 23/11: janela técnica em 25/11/2026, 08h BRT; aceitação funcional em 02/12/2026). Os docs anteriores com 28/11 e 24/11 ficam como histórico.
Nenhum papel, credencial ou comando de produção foi criado ou executado por este documento.

## 1. Divergência de hash do Storage: RESOLVIDA
- Causa: a impressão digital de origem do backup de 22/11 foi gerada com a ordenação padrão do banco (en_US) às 01:46 (local); a correção `collate "C"` do `impressao-digital.sql` entrou às 01:57. Comparar origem (en_US) com restaurado (C) dá hash diferente com conteúdo igual.
- Prova (23/11): em produção, o mesmo SQL dá `07c27609...` com a ordenação padrão (= valor antigo da origem) e `b2ae9c5b0938f3a0a72416c5353a1bb8` com `collate "C"`; o banco restaurado dá `b2ae9c5b...`; o manifesto do backup do Storage de 22/11 (1345 `OK`, 0 divergência de tamanho) dá `b2ae9c5b...`; hashes por bucket idênticos (178 e 1167 objetos).
- Fechamento definitivo: um backup NOVO gera origem e restaurado com o SQL corrigido (as duas pontas em "C"); a verificação do Storage tem script próprio e determinístico: `verificar-manifesto-storage.mjs` (testado: `STORAGE_IGUAL=True` contra b2ae9c5b...; `False` contra a impressão antiga, como esperado).

## 2. O que Reynaldo precisa fornecer (únicas dependências humanas)
| # | Item | Quando | Observação |
|---|---|---|---|
| 1 | Papel temporário de backup no banco de produção | Manhã da janela, ~06h00 BRT | OPÇÃO A (recomendada): Reynaldo roda `gerar-credencial-producao.ps1` (local, não toca no banco; senha só em DPAPI) e cola `1-criar-papel.sql` no SQL Editor de produção. OPÇÃO B: autorizar por escrito que o Claude Code crie o papel em produção via MCP (é escrita em produção: `create role`/`grant`; exige autorização específica). A credencial vale 6 h; não gerar antes das ~05h30. |
| 2 | Chave de serviço (secret key) de produção para baixar os arquivos do Storage | Mesma manhã | Reynaldo cria uma secret key NOVA e exclusiva no painel (Project Settings > API Keys), guarda com `salvar-segredo.ps1 -Nome SERVICE_KEY` no terminal dele (não em chat) e a revoga ao final. Sem ela só se compara o manifesto de 22/11 (nomes e tamanhos iguais hoje), sem reler o conteúdo. |
| 3 | Conferir, no painel Database > Backups, a data e hora do último backup diário da plataforma (plano Pro, 7 dias) | Qualquer hora | Cópia de segurança independente; não substitui o dump. |
| 4 | Autorização para a restauração em banco local descartável | Imediatamente depois do dump | É local (127.0.0.1:55434), sem tocar em produção; já ensaiado em 23/11. |
Sem os itens 1 e 2 o backup integral do dia NÃO existe; o último é de 22/11 04:46 UTC (banco) e 05:08 UTC (Storage).

## 3. Sequência mínima (T-90 a T-0)
Hora BRT para a janela de 08h00. Atenção: o cron `weekly-alert-digest` da Vercel dispara quarta 07:00 BRT e o `system-health` 07:30 BRT, ambos no app ATUAL; o backup começa DEPOIS do resumo semanal e o congelamento só depois do backup.
| Hora | Passo | Comando | Critério |
|---|---|---|---|
| 05:30 | Gerar credencial local | `gerar-credencial-producao.ps1` | arquivos em `producao-acc_backup_<UTC>\` |
| 05:40 | Criar o papel (Reynaldo) | colar `1-criar-papel.sql` | linha de conferência: login, sem superuser, limite 1, validade |
| 05:45 | Teste de acesso | `verificar-papel-producao.ps1` | somente leitura, sem `cron.schedule` |
| 07:10 | Backup do banco | `backup-banco.ps1 -Alvo producao -Usuario acc_backup_<UTC> -Segredo <dpapi> [-Pooler aws-1-sa-east-1.pooler.supabase.com]` | `ORIGEM_ESTAVEL_DURANTE_DUMP`, SHA256SUMS, cópia na mídia externa verificada |
| 07:25 | Backup do Storage | `backup-storage.ps1 -Alvo producao -Usuario acc_backup_<UTC> -Segredo <dpapi> -Pooler ...` | todos `OK` |
| 07:30 | Remover o papel | `2-remover-papel.sql` | `ainda_existe=false`, `jobs_do_papel=0`; revogar a secret key |
| 07:35 | Restaurar em banco descartável | `restaurar-validar.ps1 -Pasta <pasta do backup>` | 13 de 13 iguais |
| 07:45 | Verificar o Storage | `node verificar-manifesto-storage.mjs --pasta <pasta do Storage> --origem <pasta do dump>\impressao-digital-origem.txt` | `STORAGE_IGUAL=True` |
| 07:50 | Conferências P0 e contagens | o banco restaurado confere a função `record_risk_alert_action` (md5 do corpo `930f6d75898793479b418950b0053bd9`), histórico 134 linhas md5 `70a176da74c9f88ac06b04d80bc55891`, RLS e linhas por tabela | iguais à origem |
| 07:55 | RELATÓRIO | `TUDO_IGUAL=True` só se `restaurar-validar` = True E `STORAGE_IGUAL=True` E P0 e contagens iguais | caso contrário NO-GO |
| 08:00 | Pré-voo e congelamento | doc 23 (T-30 em diante, comprimido) | — |
Se a restauração ou o Storage não fecharem, a janela NÃO começa. A janela pode ser empurrada sem perda para 26/11 ou 01/12.

## 4. Atualização final na janela (antes das migrations)
Entre o backup das 07:10 e o congelamento (T+4), produção continua recebendo dados (e-mails, auditoria). Para eliminar essa defasagem sem novo dump completo: (a) o congelamento (`1-aplicar-congelamento.sql`) bloqueia as escritas; (b) logo após o congelamento, repetir só a impressão digital da origem (`impressao-digital.sql`, somente leitura) e comparar linha a linha com a do backup: categorias iguais = o backup do dia equivale ao estado congelado; categorias com diferença = delta a registrar e, se relevante, refazer o dump (minutos, o banco tem 68 MB). Só depois do congelamento verificado o executor aplica as ondas.

## 5. Estado em 23/11/2026 (evidência)
| Item | Estado |
|---|---|
| Hash do Storage | resolvido e provado (seção 1) |
| Backup do dia (banco e Storage) | NÃO feito: falta a credencial do papel (item 1) e a secret key do Storage (item 2) |
| Restauração do backup de 22/11 | feita em 5 s: 12 de 13 iguais, a 13ª explicada; `TUDO_IGUAL=True` pendente do backup do dia |
| Verificador do Storage | pronto e testado |
| Migrations, merge, deploy | não executados |

## 6. Rodada de 23/11 (noite): comparação objeto a objeto, recursos de backup e decisão
**Storage, 1345 objetos (somente leitura; sem conteúdo exposto).** `comparar-storage-objetos.mjs` (axion-backups\fase2) cruza, por bucket e caminho completo (ordem em bytes), três visões: produção agora (id, tamanho, eTag, version, updated_at), o banco restaurado do backup de 22/11 e o backup de arquivos (MANIFESTO + arquivos locais). Resultado: **1345 de 1345 idênticos, 0 divergentes** (0 de conteúdo, 0 de metadado/versão, 0 ilegíveis). Os 1345 arquivos locais foram relidos: tamanho = esperado, sha256 recalculado = manifesto, md5 = eTag. Nenhum objeto mudou em produção entre 22/11 e 23/11 (nem `updated_at`). Normalizações aplicadas (só representação, não integridade): fuso dos carimbos (-03 x +00) e o mapeamento do arquivo local (nome do arquivo é o SHA-1 do caminho). Relatório: `RELATORIO-COMPARACAO-STORAGE-20261123.txt` (sem divergências). A divergência de 22/11 era exclusivamente a ordenação do hash de origem (seção 1); a verificação real de integridade (tamanho + sha256 + md5/eTag por objeto) está APROVADA.
**Recursos de backup do projeto de produção (painel, leitura):** backups agendados da plataforma, físicos, diários (último: 23/11/2026 08:23 UTC; 8 pontos de 16/11 a 23/11), com Restore no painel; NÃO incluem os arquivos do Storage; PITR NÃO habilitado (add-on pago, não ativado); "Restore to new project" (beta) existe. Os backups físicos não geram arquivo baixável: servem como recuperação independente da plataforma (restauração para o mesmo projeto ou para um projeto novo, com custo e impacto: só por decisão sua), não como dump lógico validável localmente.
**Mecanismo escolhido para o backup integral (banco):** dump lógico `pg_dump -Fc` (esquema, dados, `supabase_migrations`, papéis sem senhas) com o papel temporário `acc_backup_*`. Alternativas avaliadas: (i) `postgres` com a senha do projeto: dispensa criar papel, mas usa a credencial mais poderosa e a senha não está guardada aqui; pior em segurança; (ii) backup da plataforma: sem arquivo local e sem Storage; (iii) exportar por SELECT via MCP: não preserva esquema, funções, políticas, nem é íntegro. Conclusão: o papel temporário é a opção de menor privilégio e é o único caminho para um dump lógico validável; a plataforma serve de rede de segurança.
**SQL exato (gerado localmente pelo script; só o verificador SCRAM vai ao banco, a senha nunca):**
```sql
create role acc_backup_<UTC> with login inherit bypassrls nosuperuser nocreatedb nocreaterole noreplication
  connection limit 1 valid until '<agora+6h>' password 'SCRAM-SHA-256$4096:<salt>$<StoredKey>:<ServerKey>';
grant pg_read_all_data to acc_backup_<UTC>;                                   -- necessário para auth.users (sem grant option em auth)
alter role acc_backup_<UTC> set default_transaction_read_only = on;
alter role acc_backup_<UTC> set statement_timeout = '30min';
alter role acc_backup_<UTC> set idle_in_transaction_session_timeout = '5min';
```
Privilégios: somente leitura; sem escrita, sem DDL, sem superuser; 1 conexão; validade 6 h. Efeito colateral conhecido: `pg_read_all_data` dá USAGE em `cron`; mitigação: nome único, validade, remoção imediata e conferência de jobs. **Revogação (imediatamente após o dump):** `alter role acc_backup_<UTC> nologin;` verificação de que não há job do pg_cron nem objetos do papel; `revoke pg_read_all_data from acc_backup_<UTC>;` encerrar sessões; `drop role acc_backup_<UTC>;` conferir `ainda_existe=false`. Tudo isso já está nos arquivos `1-criar-papel.sql` e `2-remover-papel.sql` gerados pelo script.
**Plano revisado para tirar a pressão da manhã da janela:** (1) NA TERÇA 24/11, em horário comercial: backup integral + restauração + verificação completa e relatório `TUDO_IGUAL=True` (a credencial do papel vale 6 h, suficiente); (2) NA QUARTA 25/11, antes das migrations: só a atualização final: impressão digital da origem após o congelamento comparada com a do backup (seção 4), e novo dump apenas se houver delta relevante. Assim o bloqueio do backup fecha com um dia de folga.
**Credenciais ainda necessárias (nada criado):** (a) papel temporário no banco: Reynaldo roda o script local e cola o SQL, ou autoriza por escrito a criação via MCP; (b) secret key de produção do Storage, nova e exclusiva, guardada em DPAPI e revogada ao fim. Sem (b), o Storage já tem integridade comprovada para 22/11 e igualdade de metadados hoje, mas o conteúdo não é recopiado.
