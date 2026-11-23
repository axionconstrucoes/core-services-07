# 43 - Roteiro do backup integral de produção, terça-feira 24/11/2026 (horário comercial) - PREPARADO; NÃO EXECUTADO

Decisão da Diretoria (23/11): opção A (Reynaldo gera a credencial e aplica o SQL), backup na terça, janela técnica na quarta 25/11 às 08h BRT. Não autorizado: migrations, merge, deploy, APPLY de e-mails, alteração de dados operacionais, envio real de alertas. Nada neste roteiro altera dados operacionais; as únicas escritas em produção são `create role`/`drop role` do papel temporário (e a criação/remoção de UMA secret key do Storage), todas feitas por Reynaldo.
Regras: nenhuma senha, token ou string de conexão é digitada ou colada em chat; os segredos ficam só em DPAPI (`C:\VIBE\PROJETOS\axion-backups\fase2\segredo-*.dpapi`). Hoje (23/11) NADA foi gerado: a credencial vale 6 h e só nasce na hora do uso.

## 0. Revisão do SQL do papel (condição 1) - APROVADA
| Item | Valor | Por quê |
|---|---|---|
| Nome | `acc_backup_<AAAAMMDDHHmm UTC>`, único | o pooler guarda cache por nome (reuso falhou no ensaio de homologação) |
| Login e senha | `login`; senha aleatória de 256 bits só em DPAPI; ao banco vai apenas o verificador SCRAM-SHA-256 | nem o SQL Editor nem o histórico veem a senha |
| Validade | `valid until` = agora + 6 h | expira sozinho se esquecido |
| Conexões | `connection limit 1` | o backup roda em sequência (pg_dump, esquema, papéis, impressão digital): comprovado, uma conexão por vez |
| Leitura | `pg_read_all_data` + `bypassrls` | necessários: sem o primeiro o backup perde `auth.users` (o `postgres` do Supabase não tem grant option em `auth`); sem o segundo o pg_dump lê só as linhas que a RLS deixaria passar |
| Somente leitura | `alter role ... set default_transaction_read_only = on`; o cliente ainda força `-c default_transaction_read_only=on` | nenhuma escrita possível mesmo por engano |
| Sem poderes | `nosuperuser nocreatedb nocreaterole noreplication` | menor privilégio |
| Timeouts | `statement_timeout = 30min`, `idle_in_transaction_session_timeout = 5min` | evita sessão pendurada |
| Exposição conhecida | USAGE em `cron` (por `pg_read_all_data`) | mitigação: nome único, 6 h, remoção imediata; `2-remover-papel.sql` RECUSA remover se houver job do pg_cron em nome do papel |
| Revogação | `nologin`; verificações; `revoke pg_read_all_data`; encerra sessões; `drop role`; confere `ainda_existe=false` e `jobs_do_papel=0` | já escrita em `2-remover-papel.sql` |
Estado de produção em 23/11: nenhum papel `acc_backup%` existe (consulta somente leitura); o de 22/11 foi removido.
Host do pooler de PRODUÇÃO: `aws-0-sa-east-1.pooler.supabase.com` (o de homologação é `aws-1`; não misturar).

## 1. Passo a passo de Reynaldo (24/11, horário comercial, projeto de PRODUÇÃO)
Atenção: o projeto de produção se chama `axion-contract-intelligence-dev` no painel (ref `plbcvwostmdmdmrziwmd`); conferir o ref na URL antes de colar qualquer SQL.

**Passo 1 - PRIMEIRO COMANDO (PowerShell normal, nesta máquina):**
```
powershell -NoProfile -ExecutionPolicy Bypass -File C:\VIBE\PROJETOS\axion-backups\fase2\gerar-credencial-producao.ps1
```
Deve aparecer: `PAPEL=acc_backup_<12 dígitos>`, `VALIDADE_UTC=<agora + 6 h>`, `ARQUIVOS=...\producao-acc_backup_<12 dígitos>` e, em seguida, o texto do SQL de criação (com `SCRAM-SHA-256$4096:...`, que é só o verificador) e o SQL de remoção. NÃO deve aparecer senha. Se aparecer "já existe ...segredo-producao-backup.dpapi", parar e me avisar. Marcar a hora: o backup inteiro tem de acabar em até 6 h (previsão: 1 h).

**Passo 2 - aplicar `1-criar-papel.sql` (SQL Editor):** abrir `https://supabase.com/dashboard/project/plbcvwostmdmdmrziwmd/sql/new`, abrir o arquivo `...\producao-acc_backup_<...>\1-criar-papel.sql` no Bloco de Notas, copiar TODO o conteúdo, colar e executar (Run). Deve aparecer ao final uma linha: `rolname=acc_backup_<...>, rolcanlogin=true, rolbypassrls=true, rolsuper=false, rolcreaterole=false, rolconnlimit=1, rolvaliduntil=<hoje + 6 h>`. Qualquer outro resultado: parar.

**Passo 3 - verificar o papel (somente leitura):**
```
powershell -NoProfile -ExecutionPolicy Bypass -File C:\VIBE\PROJETOS\axion-backups\fase2\verificar-papel-producao.ps1
```
Esperado: `identidade=acc_backup_... super=false bypassrls=true createrole=false limite=1`; contagens de leitura (auth.users 86, storage.objects 1345, histórico 134); `escrita_possivel:` tudo `false`; `exposicao_conhecida: cron_schedule=true` (esperado, mitigado); `CODIGO=0`.

**Passo 4 - backup do banco** (eu preparo o comando exato com o nome do papel; leva alguns minutos):
```
powershell -NoProfile -ExecutionPolicy Bypass -File C:\VIBE\PROJETOS\axion-backups\fase2\backup-banco.ps1 -Alvo producao -Pooler aws-0-sa-east-1.pooler.supabase.com -Usuario acc_backup_<12 dígitos> -Segredo C:\VIBE\PROJETOS\axion-backups\fase2\segredo-producao-backup.dpapi
```
Esperado: pasta `producao-<UTC>` com `banco.dump`, `esquema.sql`, `roles.sql`, `impressao-digital-origem.txt` (antes) e `...-depois.txt`, `SHA256SUMS.txt`, mensagem `ORIGEM_ESTAVEL_DURANTE_DUMP` e cópia verificada no Seagate. O dump inclui esquema, dados, funções, políticas RLS, gatilhos, `supabase_migrations` e `auth.users`.

**Passo 5 - Storage.** Verificação feita em 23/11 do que já existe: não há `segredo-SERVICE_KEY.dpapi` (o de 22/11 foi apagado); as chaves legadas estão desativadas; a secret key do aplicativo existe só nos segredos da Vercel/GitHub, que NÃO devem ser decifrados nem reutilizados. Conclusão: uma secret key NOVA e exclusiva é indispensável para baixar o conteúdo.
 - 5a. Painel: Project Settings > API Keys > Secret keys > New secret key, nome `acc-backup-20261124`. Copiar o valor.
 - 5b. No PowerShell (o valor não aparece na tela): `powershell -ExecutionPolicy Bypass -File C:\VIBE\PROJETOS\axion-backups\fase2\salvar-segredo.ps1 -Nome SERVICE_KEY` e colar quando pedir. Esperado: confirmação de gravação cifrada, sem eco.
 - 5c. Backup: `backup-storage.ps1 -Alvo producao -Pooler aws-0-sa-east-1.pooler.supabase.com -Usuario acc_backup_<...> -Segredo <o mesmo dpapi do papel>`. Esperado: pasta `storage-producao-<UTC>` com `arquivos`, `MANIFESTO.tsv` e `MANIFESTO.sha256`; 1345 linhas `OK` (ou o número atual).

**Passo 6 - revogar logo após os passos 4 e 5:**
 - 6a. Colar `2-remover-papel.sql` no SQL Editor e executar. Esperado: `sessoes_encerradas=0` e `ainda_existe=false | jobs_do_papel=0`.
 - 6b. Painel: excluir a secret key `acc-backup-20261124` (somente ela; nenhuma outra chave nem integração é tocada).
 - 6c. `Remove-Item C:\VIBE\PROJETOS\axion-backups\fase2\segredo-producao-backup.dpapi, ...\segredo-producao-backup.nome, ...\segredo-SERVICE_KEY.dpapi`.

## 2. Restauração e verificação (comigo; local e isolada, 127.0.0.1:55434)
1. `restaurar-validar.ps1 -Pasta <pasta do backup>`: SHA-256 dos arquivos, `pg_restore -l`, restauração em banco NOVO e comparação da impressão digital. Esperado: 13 de 13 categorias `True` e `TUDO_IGUAL=True`. As 13: usuários de auth, funções (corpo, segurança, ACL), gatilhos, histórico de migrations, índices, linhas por tabela, P0 (`record_risk_alert_action`), permissões, políticas RLS, restrições, RLS ativada, Storage (objetos) e colunas. Qualquer `False` = NO-GO com a divergência registrada; nunca mascarada.
2. Storage: `node verificar-manifesto-storage.mjs --pasta <storage> --origem <backup>\impressao-digital-origem.txt` (esperado `STORAGE_IGUAL=True`) e `comparar-storage-objetos.mjs ... --arquivos sim` (objeto a objeto, sha256 e md5/eTag; esperado 0 divergentes).
3. Conferências extras: P0 (md5 do corpo `930f6d75898793479b418950b0053bd9`), histórico de migrations (134 linhas, md5 `70a176da74c9f88ac06b04d80bc55891` se nada mudou), RLS, funções e auditoria no banco restaurado.
4. Relatório final com manifestos, hashes, durações e erros esperados (COMMENT de extensões do Supabase, p. ex. pg_cron, pg_net, vault) e instruções de recuperação (restaurar tabelas com `pg_restore -t` num banco isolado primeiro; restauração em produção só por decisão da Diretoria). Evidências ficam fora do repositório.

## 3. Quarta 25/11, 08h BRT (antes de qualquer migration)
Após o congelamento, repetir só a impressão digital da origem (somente leitura; precisa de novo papel temporário de 6 h, mesmo roteiro dos passos 1 a 3 e 6) e comparar com a do backup de terça: iguais = o backup vale; diferenças relevantes = novo dump integral (68 MB, minutos). Nada de migration, merge ou deploy sem autorização final específica.
