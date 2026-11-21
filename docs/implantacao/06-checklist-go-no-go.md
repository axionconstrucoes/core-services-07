# 06 - Checklist e critérios GO/NO-GO por bloco

Responsáveis sugeridos são papéis, não pessoas: Dono = diretoria AXION; Eng = responsável técnico do ACC; TI = responsável por DNS/Google Workspace; SSMA/Qual = coordenação da área; Jur = jurídico.
Regra geral: NO-GO prevalece. Um bloco só vira GO com todos os critérios obrigatórios comprovados por evidência (consulta, teste, captura de tela, ata). Nenhum bloco é aplicado automaticamente; esta lista é de decisão.

## B1 - Hotfix e registro de histórico (responsável: Eng; aprovação: Dono)
- GO se: corpo remoto de `record_risk_alert_action` com md5 sem CR `930f6d75898793479b418950b0053bd9`; `anon`/PUBLIC sem EXECUTE; decisão sobre a forma de registro (`02` seção 5); plano para 130000/151000 definido.
- NO-GO se: hash divergente; qualquer migration da onda B aplicada sem plano de retorno ao corpo final.
- Estado hoje: efeito PROTEGIDO; registro pendente.

## B2 - Migrations (Eng; aprovação: Dono)
- GO se: backup lógico e snapshot de ACL feitos; ponto de restauração anotado; ensaio em banco descartável com a mesma sequência e `test:sql`/`test:scripts` verdes; checagem de duplicidade de `sla_matrix_rules` limpa; agendador pausado; envio em modo piloto; janela aprovada por onda.
- NO-GO se: qualquer teste vermelho; hash do histórico divergente do inventário; falta de backup; plano de rollback sem responsável.
- Estado hoje: NO-GO (sem ensaio nem autorização).

## B3 - E-mail (TI + Eng; aprovação: Dono)
- GO (envio real) se: SPF publicado e validado; DKIM ativo com `dkim=pass header.d=axion.com.br` em mensagem real; DMARC com `rua` e relatórios analisados (política `quarantine` ou `reject` decidida); homologação em Gmail e Outlook; `ACC_OUTBOUND_MODE=production` somente por decisão expressa; allowlist e flags conferidas (nomes em `04`).
- NO-GO se: SPF ou DKIM ausente; DMARC sem relatórios; envio real sem aprovação; remetente de terceiros fora do SPF.
- Estado hoje: NO-GO (SPF e DKIM ausentes; DMARC `p=none` sem `rua`).

## B4 - SLAs (Dono; Eng executa)
- GO para 177000 se: autorização expressa (aplicar sim/não, data, prazo retroativo sim/não, comunicação); migration `20261118140000` aplicada; teste da migration verde no ensaio.
- NO-GO se: ausência de autorização escrita. CRÍTICO 1h corrida e ALTO 4h úteis permanecem sem alteração.
- Estado hoje: aguardando decisão.

## B5 - Especialistas IA (Eng; Dono)
- GO se: migrations de limites/governança/auditoria aplicadas e validadas; limites e orçamento definidos pelo Dono; chaves de IA apenas server-side; resposta de IA distingue fato/inferência/recomendação com evidência; nenhum envio automático.
- NO-GO se: chave no frontend; consumo sem limite; Expert recusado por falta de `20261122300000`.
- Estado hoje: depende do B2.

## B6 - Dados operacionais (Dono; Eng)
- GO se: lista formal de projetos de teste x reais; outbox sem itens pendentes indevidos; casos encerrados na origem tratados (migration `20261121176000`); nenhum reprocessamento em massa na janela.
- NO-GO se: dados de teste vinculados a destinatários reais; contagens de verificação (projetos, outbox, ações SLA) mudando durante a janela sem explicação.

## B7 - Projeto TESTE e piloto WEG (Dono; SSMA/Qual; Eng)
- GO se: projeto TESTE identificado e excluído de envio real; piloto WEG restrito à allowlist; roteiros de piloto atualizados; evidências preservadas (CLAUDE.md itens 9 e 10).
- NO-GO se: abertura de destinatários originais sem decisão; ausência de rastreabilidade das mensagens do piloto.

## B8 - Repositório seguro e segredos (Eng; Dono)
- GO se: plano `docs/seguranca/plano-repositorio-privado.md` executado ou aceito com risco; nenhum `.env` ou segredo versionado; segredos apenas em Vercel/GitHub/Vault; varredura de segredos limpa.
- NO-GO se: segredo exposto; repositório com evidências públicas.

## B9 - Qualidade, Garantias e Seguros (Eng; Qual; Jur; Dono)
- GO se: onda G validada (RLS em todas as tabelas, isolamento entre projetos, auditoria append-only); flag `ACC_INSURANCE_REAL_SEND_ENABLED` desligada; minutas somente em estado DRAFT; permissões conforme a matriz central (frente B) quando integrada.
- NO-GO se: tabela sem RLS; qualquer envio real a seguradora/corretora sem aprovação humana expressa.
- Estado hoje: depende do B2 e da integração da frente B.

## Decisão consolidada
O GO global exige B1, B2, B3, B5, B6 e B8 em GO; B4 e B9 conforme o escopo da abertura; B7 define o escopo do piloto. Hoje: B1 pendente de registro; B2 pendente de ensaio e autorização; B3 NO-GO; B4 aguardando decisão; B5 a B9 dependem do B2.

## Complemento da Fase 5/F

B2: o critério passa a ser o ensaio sobre TODAS as migrations do diretório de integração (`ACC_ENSAIO_MIGRATIONS_DIR`; migrations novas entram na onda F5 com P0 por arquivo e idempotência), 0 falhas, no dia da janela; contagem de pendentes conferida contra `list_migrations` (hoje 57). B3 permanece NO-GO para envio real; leitura de caixas não depende de SPF/DKIM/DMARC (ver `04`, seção 6).

## Complemento da Fase 6/H5 (onda L e competências)

B2: contagem de pendentes conferida contra `list_migrations` (hoje 69; 204 arquivos). B2/B5: a ordem banco -> app -> competências -> revalidação -> validador -> pipeline em simulação é a de `12`; para competências é OBRIGATÓRIA: (1) aplicar `20261208100000`; (2) ADMINISTRADOR designa validador (documento/ata, aceite, prazo <= 180 dias); (3) revalidar as competências (todas viram `REQUIRED` na migração; `project_competence_revalidate`); (4) só então atos críticos. (NO-GO) ato crítico executado antes da revalidação; qualquer `ok = false` do P0 após um arquivo da onda L. Rollback: toda pendente tem arquivo em `supabase/rollbacks/` (`test-implantacao-rollbacks`).

## Complemento da Fase 4/C (sequência ensaiada)

Critérios adicionais, por bloco "migrations": (GO) o ensaio `scripts/ensaio-implantacao-ondas-realpg.mjs` repetido no dia com 0 falhas; a verificação `scripts/sql/p0-verificar-record-risk-alert-action.sql` devolve `ok = true` ANTES da janela e após CADA migration; o hotfix 20261121090000 NÃO é reaplicado (só registro); `20261123302000` só publicada junto do app; `20261121177000` só com decisão registrada do dono. (NO-GO) qualquer `ok = false` ou `P0_GATE`: parar, não prosseguir, investigar. Detalhes em `07-sequencia-ensaiada.md`; resultado do ensaio em `08-relatorio-ensaio-ondas.md`. Nenhum item deste complemento foi executado no operacional.
