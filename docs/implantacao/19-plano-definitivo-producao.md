# 19 - Plano definitivo de publicação em produção do piloto WEG (PLANO; nada foi executado em produção)

Status: pronto para aprovação do Dono. Nenhum comando abaixo foi executado em produção (`plbcvwostmdmdmrziwmd`). Tudo foi ensaiado em PostgreSQL local, em cópia local do backup de produção e no `acc-homolog` (`gtadbeaevxglrqkhcwfz`). Complementa `02`, `06`, `11`, `12`, `16`, `17`, `18`, `20` (aceitação), `21` (revisão da integração) e `22` (checklist GO/NO-GO).

## 0. Resumo executivo
- Pendências de banco: 134 migrations registradas em produção; a integração tem 206 arquivos. **70 itens** (69 migrations + o registro do hotfix `20261121090000`) formam as **14 ondas executáveis A a N**; **2 migrations ficam adiadas** (SLA `20261121177000` e a onda H2). Ordem e conteúdo: `scripts/data/implantacao-sequencia.json`.
- **Ensaio com dados reais de produção (cópia local do backup de 22/11):** as 14 ondas foram aplicadas com o executor guardado em 2 s. O P0 foi conferido depois de cada onda e o hash do histórico bateu em todas (134 para 204 linhas). Das 130 tabelas pré-existentes só mudaram `sla_matrix_rules` (+4 regras novas da área QUALIDADE, ver 3.4) e `audit_log_entries` (+4). As **9 ações de SLA MÉDIO/BAIXO abertas ficaram com o mesmo hash**; `auth.users` e as demais tabelas, inalterados; 218 tabelas com RLS. Evidência: `14b` a `14c` fora do repositório.
- Registro do histórico: **recomendação (b) atômica** (seção 2).
- Migration de SLA irreversível: **não é necessária** para a operação inicial do piloto; **manter adiada** (seção 3).
- O app **não** sobe antes do banco: o merge na `main` dispara deploy de produção automático na Vercel (seção 5).

## 1. Sequência da publicação (T = início da janela)
| Fase | Quando | O quê | Parada se |
|---|---|---|---|
| 0. Pré-requisitos | D-7 a D-1 | PR aberto e CI verde; aceitação em homologação aprovada (doc 20); decisões D1 a D7 tomadas; PAT do executor validado em homologação (seção 4); flags de produção definidas (seção 6); verificação de que ninguém usa o ACC na janela | qualquer item reprovado |
| 1. Porta de entrada | T-60 min | backup lógico e de Storage de produção (`backup-banco.ps1`/`backup-storage.ps1`, papel exclusivo de backup) e restauração local validada; fingerprints de produção (`8-verificar-integridade.sql` adaptado, hash do histórico `70a176da...`, P0 `930f6d75...`); `risk_alert_outbox` sem PENDING; 11 jobs ativos; ACL das funções do doc 12 salva | divergência no hash, P0 divergente, outbox pendente |
| 2. Congelar | T | pausar os 11 jobs (`6-pg-cron-pausar.sql`), desabilitar os workflows do GitHub que escrevem (doc 12, seção 1.4), aplicar o congelamento (`1-aplicar-congelamento.sql`) e o de Storage (`4-...`), `3-verificar` | verificação do congelamento diferente de 219/219 |
| 3. Ondas | T+10 | executor, uma onda por vez, na ordem do JSON: A, B, C, D, F, G, H1, I, P0, J, K, L, M, N. Depois de cada migration: P0 e linha do histórico; depois de cada onda: hash do histórico e `verificacao-onda-<id>.sql` (antes e depois). Falha de SQL desfaz só aquele arquivo; **parar na primeira falha**. | qualquer divergência de P0 ou hash |
| 4. Trava de módulos | T+25 | aplicar `1-aplicar-trava.sql` (35 RPCs de RNC/Garantias/Seguros/Competências) e conferir 35/0, 6 liberadas | contagem diferente |
| 5. Descongelar | T+30 | `5-storage-descongelar`, `2-reverter-congelamento`, `8-verificar-integridade.sql` (fingerprints = esperado da onda N, 0 resíduos); **ainda sem retomar jobs** | resíduo ou fingerprint diferente |
| 6. Aplicativo | T+35 | merge na `main` (deploy automático) com as variáveis já configuradas (seção 6); conferir o deployment READY e a produção apontando para o commit esperado | build falha: ver rollback do app |
| 7. Retomar | T+45 | `7-pg-cron-retomar.sql`, reabilitar os workflows, observar 15 minutos (execuções, falhas, duplicidade) | falha de job, erro de runtime |
| 8. Fumaça e aceitação | T+60 | teste de fumaça (login, obra WEG, alerta simulado) e blocos críticos do doc 20 com usuários reais | falha P0/segurança = NO-GO |
| 9. Observação | T+2 h a T+24 h | monitoramento de jobs, `acc_system_health_incidents`, erros da Vercel; janela de rollback aberta | gatilhos da seção 8 |

Os tempos são estimativas (o ensaio local mediu 2 s para as 14 ondas; no remoto a latência de rede domina). A janela reserva 60 minutos.

## 2. Registro do histórico: (a) x (b)
Análise detalhada no doc 11; o que mudou desde então é que **(b) foi exercitado de ponta a ponta**: o executor aplicou a onda N no `acc-homolog` e registrou a linha com a **versão do arquivo**, atomicamente com a migration; os 4 ensaios de atomicidade passaram; e as 14 ondas rodaram na cópia de produção com o hash do histórico conferido a cada onda.

| Critério | (a) versão do conector | (b) versão do arquivo, atômico | Vencedor |
|---|---|---|---|
| Integridade | registro e migration em transações distintas se feito à mão; versões diferentes das do repositório | registro dentro da mesma transação do arquivo (falha desfaz os dois); provado em homologação e no ensaio | (b) |
| Rastreabilidade | 66 correspondências manuais entre versão do conector e arquivo; hash do histórico deixa de conferir com o repositório | versão = arquivo; o hash `md5(version\|\|name)` do histórico é comparado com o esperado em cada onda | (b) |
| Reversibilidade | renomear 66 arquivos ou manter tabela de equivalência | `delete` da linha por versão (backup da tabela salvo antes) + rollback da migration, ambos por onda | (b) |
| Risco operacional | `supabase db push`/`migration repair` pode reaplicar ou reparar errado | digitação: eliminada pelo executor (versão lida do nome do arquivo) | (b) |
| Esforço no dia | baixo | zero (automático), mas exige o executor validado | empate |

**Recomendação: (b) com o executor.** Condição: o transporte do executor para a produção (Management API com PAT) deve ser ensaiado no homolog antes (seção 4). Alternativa se o PAT não for aceito: `psql -1` com `insert` na mesma transação (doc 12, seção 3), mais manual.

## 3. A migration de SLA irreversível (`20261121177000`) é necessária?
**Não. Manter adiada.**

### 3.1 O que ela faz
Altera só o prazo para **assumir** de MÉDIO (1 para 2 dias úteis) e BAIXO (3 para 5 dias úteis) nas regras já existentes (desativa a regra antiga e cria nova; atualiza o padrão de `sla_ssma_assume_due_at`). Não recalcula nenhuma ação existente.

### 3.2 O que a produção tem hoje (cópia do backup de 22/11)
| Obra | Risco | Unidade | Assumir | Escalonamento 2 | Diretoria |
|---|---|---|---|---|---|
| WEG (`AXION-DEV-001`) | CRÍTICO | horas corridas | 1 | 1 | 2 |
| WEG | ALTO | horas úteis | 4 | 4 | 4 |
| WEG | MÉDIO | dias úteis | **1** | 1 | 1 |
| WEG | BAIXO | dias úteis | **3** | 3 | 2 |

CRÍTICO e ALTO já coincidem com a política aprovada. MÉDIO e BAIXO estão com os valores **anteriores** (mais curtos) à política aprovada (2 e 5). Há 9 ações MÉDIO/BAIXO abertas (6 MÉDIO, 3 BAIXO); a migration não as altera.

### 3.3 Por que a política de alertas do piloto continua correta sem ela
1. **Segurança operacional:** os prazos de MÉDIO/BAIXO em produção são **mais exigentes** do que o aprovado. Nenhum alerta é tratado com mais folga do que a política permite; o efeito é só mais pressão sobre os responsáveis.
2. **CRÍTICO/ALTO** (os que importam para a segurança do piloto) são idênticos nas duas versões.
3. **Escalonamento e confirmações** não mudam.
4. **A onda L não toca as regras da WEG:** no ensaio sobre a cópia de produção, as 6 regras existentes ficaram idênticas; entraram apenas 4 regras **novas da área QUALIDADE** (CRÍTICO 1 h, ALTO 4 h úteis, MÉDIO 2 d.u., BAIXO 5 d.u.), que só valem para alertas da área Qualidade.
5. As 9 ações abertas mantêm o mesmo `assume_due_at` (hash idêntico antes e depois).
6. **Reversibilidade:** a migration pode ser aplicada depois, em janela própria, sem efeito retroativo. Adiá-la não cria dívida técnica.

### 3.4 Divergência a decidir (não bloqueia)
A área QUALIDADE nasce com MÉDIO 2/BAIXO 5 e a obra WEG geral continua com 1/3. É coerente com o desenho (regras novas seguem a política aprovada; as existentes não são alteradas sem autorização), mas o Dono deve saber disso. Como o módulo de Qualidade está parcialmente bloqueado, o efeito prático no go-live é nulo.

### 3.5 Texto da AXIA
Como a WEG segue com 1/3, a AXIA **não deve afirmar 2/5**: Médio e Baixo são descritos como "a matriz de SLA da obra" (tarefa em andamento; ver `22`).

## 4. Transporte do executor para produção: ponto a validar
O executor tem dois caminhos para banco remoto: `--alvo pg` (conexão direta; **só aceita o homolog isolado**, a guarda recusa qualquer ref operacional) e `--alvo operacional` (Management API do Supabase com token pessoal em DPAPI, exige `--producao` e a frase digitada `APLICAR <ref> <ondas>`). Em produção só o segundo é permitido por desenho. Esse transporte **ainda não foi exercitado contra a API real**: o ensaio no homolog usou `--alvo pg`.
Ação indispensável antes da janela: o responsável cria um token pessoal do Supabase e o guarda em DPAPI (`salvar-segredo.ps1`); então se roda no homolog `--alvo homolog --verificar` e `--ensaio-homolog` (atomicidade) e se mede a latência. Se o endpoint recusar ou se comportar de forma diferente, usar a alternativa `psql` do doc 12.

## 5. Ordem banco x aplicativo
- A integração tem `main` como ancestral direto: o merge é *fast-forward*.
- O projeto da Vercel `axion-contract-intelligence-5d3g` faz **deploy de produção a cada push na `main`** e **preview a cada push de branch**. As variáveis `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` e `SUPABASE_SECRET_KEY` existem **só no alvo `production`**: um preview não tem credenciais do Supabase e não alcança a produção.
- Portanto: **banco primeiro, depois o merge**. Durante as fases 2 a 5 o app antigo continua servindo (leitura); as escritas ficam congeladas.
- Risco não provado: a compatibilidade do app antigo (`27da839`) com o schema novo durante as fases 3 a 6. As ondas são aditivas, mas algumas redefinem funções (B, C, D). Mitigação: congelamento durante a janela e rollback por onda.

## 6. Configuração de produção (Vercel) antes do merge
Responsável: Eng. TI, com aprovação do Dono. Variáveis novas no código (`apps/web`):
| Variável | Padrão do código se ausente | Valor recomendado no go-live |
|---|---|---|
| `ACC_SSMA_EMAIL_EXTRA_ACTIONS_ENABLED` | **ligado** (só o valor exato `false` desliga) | `false` no go-live; ligar após a aceitação do bloco SSMA |
| `ACC_EMAIL_CLASSIFY_ENABLED` / `ACC_EMAIL_CLASSIFY_APPLY` | desligado (fail-closed) | não definir (pipeline de e-mail em simulação, doc 12 seção 6) |
| `ACC_QUALITY_TRIAGE_PROVIDER` | desligado | não definir |
Já existentes e que **devem permanecer**: `AXIA_CHAT_PROVIDER=off`, `ACC_SSMA_NOTIFICATIONS_SCOPE=WEG_CORRECTIVE_ACTIONS`, `ACC_PILOT_SINGLE_ALERT_*=DESARMADO`, `ACC_PROJECT_PILOT_TEST_GROUP` vazio. Conferir também os workflows do GitHub e seus segredos (workers de e-mail) conforme o documento `frenteC-flags-email-homologacao-producao.md` (pasta de documentos de homologação, fora do repositório).

## 7. Backup e recuperação
- Backup lógico (`pg_dump` 17) e de Storage de produção na véspera e na porta de entrada; cópia no disco externo com SHA; **restauração local validada** (a de 22/11 deu 12 de 13 categorias iguais e a 13ª, `storage_objetos`, diferiu no hash com a contagem igual (1.345); a causa **provável** é a ordenação (a impressão digital de origem desse backup foi gerada antes de o script fixar `collate "C"`), mas isso **não foi provado**: repetir a comparação com a impressão digital corrigida antes da janela).
- Ponto de retorno do banco: backup + `historico-pre.csv` + ACL das funções (doc 12, seção 1.3). **Supabase sem PITR no plano atual** (regime sem PITR confirmado na sessão anterior): o backup lógico é o ponto de recuperação, com perda de dados desde o backup. Por isso o congelamento durante a janela é parte do plano de recuperação.
- Ponto de retorno do app: deployment atual (`isRollbackCandidate: true`, commit `27da839`) para `request_rollback` da Vercel.

## 8. Rollback
| Situação | Ação |
|---|---|
| Falha numa migration (SQL) | automática: aquele arquivo é desfeito; o executor para; investigar; rollback das ondas já aplicadas em ordem inversa (`supabase/rollbacks/`, 71 arquivos, guarda de dados) |
| P0 divergente após qualquer arquivo | parar; rollback do arquivo; **NO-GO** |
| Falha de congelamento/trava | `2-reverter-congelamento`, `2-reverter-trava` (reversíveis, identidade de ACL comprovada) |
| Deploy do app com erro | `request_rollback` da Vercel para o deployment anterior; banco permanece (aditivo) ou rollback por onda se o app antigo for incompatível |
| Corrupção de dados | restaurar o backup lógico (perda desde a porta de entrada) |
| Qualquer incidente na observação (T+2 h a T+24 h) | critérios no doc 22; decisão do Dono |
A migration de SLA adiada e a onda H2 **não** têm rollback por script e não fazem parte desta janela.

## 9. O que NÃO está provado
1. O transporte do executor via Management API contra a API real (seção 4).
2. Compatibilidade do app antigo com o schema novo durante a janela.
3. Latência e locks no remoto real (o ensaio foi local e no homolog pequeno; produção tem ~30 mil linhas em `public`).
4. `service_role` real em produção; o teste de upload ao Storage por membro com caminho válido.
5. Tudo que exige usuários reais (doc 20).
6. A mensagem que o usuário vê quando a trava recusa uma escrita é o erro técnico `42501` (constatado no roteiro de aceitação); a recusa é correta e segura, mas o texto não é amigável.
