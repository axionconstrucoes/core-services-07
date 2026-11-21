# Piloto WEG — plano de implantação e recuperação (21/11/2026)

Projeto piloto (ID preservado): `00000000-0000-4000-8000-000000000001`. Produção hoje: `main` em `09fda9b`, 134 migrations registradas (última `20261119034721`), P0 `record_risk_alert_action` protegido (md5 do `prosrc` sem CR `930f6d75898793479b418950b0053bd9`).
**Nada deste plano foi executado.** Cada fase depende de autorização expressa.

## 1. Evidências em que o plano se apoia

| Evidência | Resultado | Onde |
|---|---|---|
| `main` × integração | `main` é ancestral da integração (321 commits à frente, 0 fora); `merge-tree` sem conflito | consulta Git de 21/11 |
| Correção da regra `@weg.net` | patch cirúrgico de 5 arquivos sobre a `main` (branch `fix/weg-regra-participantes`); sem a flag `ACC_EMAILS_PARTICIPANT_COLUMNS` não grava coluna nova | commits `66ae582`, `bffecbf` |
| Backfill simulado (só leitura, só metadados) | 198 mensagens WEG no Gmail do titular; regra antiga aceita 73; nova aceita 198; das 125 novas, **122 já estão no banco** (21 de 21 enviadas) e faltam **3** (todas recebidas: 2 em junho e 1 em 18/11); **0 duplicatas** (id do provedor e Message-ID) | `scripts/diagnostico-gmail/simular-backfill.mjs` |
| Ciclo de riscos por e-mail, ponta a ponta | 33 OK, 0 FAIL em Postgres 17 real, 205 migrations, provedores falsos; P0 intacto do início ao fim | `scripts/test-piloto-weg-e2e-realpg.mjs`, `docs/piloto-weg-e2e-ciclo-por-email.md` |
| Sequência de migrations | ensaio por ondas 401 verificações, 0 falha, P0 conferido após cada arquivo, 9 ações de SLA abertas preservadas, rollback exercitado | `docs/implantacao/08`, `12` |
| Aplicação em Supabase hospedado | 205 migrations aplicadas do zero no `acc-homolog` (Postgres 17 gerenciado, `pg_cron`, `pg_net`, `supabase_vault`), 0 pendentes, 0 tabelas sem RLS, P0 igual | provisionamento de 21/11 |
| Backup | arquivamento contínuo de WAL ativo (`archive_mode=on`, 7.401 arquivos, 0 falhas, último há ~1 min). **Janela de retenção do PITR não é legível por consulta: confirmar no painel** | consulta de 21/11 |
| DNS do remetente | sem SPF; DKIM não encontrado em 14 seletores comuns; DMARC `v=DMARC1;p=none;` sem `rua`; MX do Google | consulta pública de 21/11 |

## 2. Rollback de código NÃO reverte migrations
- Reverter um deploy ou um commit na `main` **não desfaz** nenhuma alteração de banco já aplicada. Banco e aplicação têm ciclos de recuperação **separados**.
- Há migrations que o aplicativo antigo **não tolera** (RPCs que passam a exigir competência, fonte e aceite comprovado) e migrations que **só funcionam** com o aplicativo novo. Por isso a ordem é obrigatória: **banco → aplicativo → competências → pipeline em simulação**.
- Recuperação de banco, em ordem de preferência: (1) rollback por arquivo (`supabase/rollbacks/`, 70 arquivos, transacionais, com guarda que recusa apagar dado); (2) restauração por PITR para o instante anterior à janela; (3) restauração do backup. **Só a `20261121177000` (SLA) é irreversível por script.**
- O corpo restaurado de uma função é o da última migration que a definiu: alteração feita fora de migration (painel) é desconhecida. Capturar as definições vigentes antes da janela (doc 02, seção 6).

## 3. Fases

### Fase 0 — agora, sem nenhuma alteração
Continuar o piloto como está. Acompanhar a fila de envio e as 21 ações abertas.

### Fase 1 — regra do `@weg.net` e backfill (sem migration)
**Pré-requisitos:** autorização de merge na `main` da branch `fix/weg-regra-participantes` (5 arquivos); confirmar que a flag `ACC_EMAILS_PARTICIPANT_COLUMNS` **não** está ligada.
1. Antes: registrar contagens (e-mails do projeto, MD5 do P0, `provider_message_id` duplicados = 0).
2. Merge na `main`. Os workflows do Gmail usam o código do repositório; **não há deploy do aplicativo nem migration**.
3. Backfill do Gmail em **simulação** com janela explícita (por exemplo 18/11 19:00 a 21:00 UTC). Conferir que devolve exatamente as 3 mensagens faltantes e nenhuma duplicata.
4. Só então o backfill em modo de aplicação (idempotente; não altera cursor).
5. Depois: contagem +3, 0 duplicatas, P0 igual.
**Rollback:** reverter o commit na `main` (nenhum dado de esquema muda). As 3 mensagens gravadas são evidência legítima e **não** se apagam.

### Fase 2 — risco por e-mail em produção (janela)
**Pré-requisitos:** backup e **PITR confirmados no painel** (retenção e plano); decisão do registro no histórico (opção (a), (b) ou CLI, doc 14); pausa dos 11 jobs `pg_cron` e dos 11 workflows agendados (doc 15); envios desligados; captura das definições atuais das funções; decisão do SLA (seção 5); o aplicativo novo pronto para publicar.
1. Registrar hotfix e as 3 migrations fora de ordem no histórico (só registro, sem reexecutar; o hotfix só depois da onda B).
2. Ondas A a M na ordem de `scripts/data/implantacao-sequencia.json`, com P0 conferido após cada arquivo e parada na primeira falha. `20261123302000` só junto com o aplicativo.
3. Publicar o aplicativo novo.
4. Competências (ordem obrigatória): aplicar `20261208`, designar validador, revalidar, só então liberar atos críticos. Bootstrap do TENANT_ADMIN.
5. Retomar jobs e workflows. Pipeline de classificação em **simulação** (`--dry-run`), revisar o relatório de cobertura; **só depois** considerar `--apply`.
**Teste de fumaça:** P0; 70 pendentes registradas; contagens do projeto piloto iguais às de antes; 9 ações de SLA abertas com prazo e estado idênticos; ciclo de alertas rodando; nenhuma linha nova na fila de envio sem autorização.
**Rollback:** por onda (arquivos de rollback, ordem inversa) ou PITR. Aplicativo: redeploy da versão anterior **somente se** o banco ainda for compatível com ela.

### Fase 3 — comprovar o tratamento por e-mail com envio real controlado (exige autorização específica)
Armar **um** envio único, com **uma** conta de teste, **um** destinatário e **um** caso definidos por você; responder `EM ANDAMENTO` e depois `RESOLVIDO` por e-mail; conferir confirmação, trilha e que nada foi para terceiros. Desarmar logo depois. Sem esta fase, o critério ponta a ponta real **não está homologado**.

## 4. O que permanece desativado até homologação específica
Envio real fora do modo piloto, envios externos, ESPECIALISTA por e-mail e EXPERTS (IA real não comprovada; o rótulo "SIMULADA" só existe na integração), Outlook, disparo único (continua desarmado), alterações retroativas de SLA, Qualidade/Garantias/Seguros.

## 5. Política de SLA
CRÍTICO 1 hora corrida; ALTO 4 horas úteis; MÉDIO **2 dias úteis**; BAIXO **5 dias úteis**. **Somente para novas ações.** Nenhuma ação existente é alterada retroativamente: o ensaio prova que as 9 ações MÉDIO/BAIXO abertas mantêm prazo e estado idênticos. A migration `20261121177000` é a que aplica a regra e entra na janela somente com a sua autorização; estender prazo de ação existente é decisão separada.

## 6. Bloqueios restantes
**P0 de segurança:** nenhum. O hotfix está protegido em produção e no ciclo ponta a ponta.

**P1 (impedem o critério de sucesso em produção):**
1. Risco por e-mail não está em produção (migrations e aplicativo novos não autorizados).
2. Regra do `@weg.net` em `main` ainda é a antiga (3 mensagens faltando; correção pronta).
3. Tratamento por e-mail nunca teve sucesso em produção (0 chaves consumidas, 0 ações): depende da Fase 3.
4. Backup e retenção de PITR não confirmados no painel.
5. Rótulos `[DEV]`/"Cliente Fictício DEV" no projeto (aparecem no assunto dos alertas): correção pronta, depende dos valores conferidos.
6. SPF, DKIM e DMARC: P1 **antes de ampliar destinatários**; P2 enquanto a entrega for só interna.

**P2 (não impedem o piloto, devem ser tratados):**
- Resolução de parte por domínio exato: remetente de `sub.weg.net` vira candidato, não herda o vínculo do `weg.net` (fail-closed).
- A cláusula usada não aparece no alerta (a RPC não a devolve; exige migration).
- O coletor gera caso de sinal pendente sem confirmação humana; a confirmação só limita o nível CRÍTICO.
- RESOLVIDO de ALTO só com evidência em texto é aceito, embora o e-mail sinalize anexo obrigatório (decisão de produto).
- IA real não comprovada; Outlook inexistente; critérios 4 (impedimento) e 6 (anexos por e-mail) do contrato de e-mail seguem pendentes segundo a documentação do piloto.

## 7. Autorizações necessárias, em ordem
1. **Fase 1:** merge de `fix/weg-regra-participantes` na `main`; backfill em simulação e depois em aplicação (janela de 18/11).
2. **Dados do projeto:** conferir razão social, CNPJ e número do contrato no original; autorizar a correção dos rótulos (`scripts/sql/piloto-weg-corrigir-rotulos.sql`) e ajustar `configure-weg-project-relevance.mjs`.
3. **Fase 2:** confirmar backup e PITR no painel; escolher (a), (b) ou CLI para o histórico; autorizar a janela e cada onda por escrito; decidir `20261121177000`; definir o validador de competências e o TENANT_ADMIN.
4. **Fase 3:** definir conta, destinatário e caso do envio único controlado e autorizar o armamento.
5. **Antes de ampliar destinatários:** aprovar SPF, DKIM e DMARC (doc 13).
