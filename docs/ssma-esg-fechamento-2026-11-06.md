# SSMA/ESG — decisões aprovadas, implementação, lacunas e critérios de encerramento (06/11/2026)

Branch `feat/ssma-esg-acoes-notificacoes-perfis`. Migration **não aplicada** (ver `docs/ssma-esg-migration-20261106100000.md`). Critério de aceite permanente: **Reynaldo acessa acc.axion.com.br de outro PC autorizado e continua o trabalho com o computador do escritório desligado.**

## 1. Decisões aprovadas → o que foi implementado

| # | Decisão | Implementação | Prova |
|---|---|---|---|
| 1 | Manter as duas trilhas; indicadores consolidados, com origem e período, sem dupla contagem; zero ≠ ausência | `lib/ssma/dashboard-metrics.ts`: origem de cada total (formulários × registros de campo), período dos dados, regra do **mesmo fato** (acidente de formulário + registro de campo OCORRÊNCIA em até 24 h contam uma vez, 1:1, informado na tela); `null` = sem dado, `0` = zero registrado | `test-ssma-dashboard-metrics.mjs` (11) |
| 2 | ESG: cumpridas, pendentes, vencidas, evidências, revisão; card no Dashboard; consulta das obrigações de cada total | `compute-esg-summary.ts` (partição cumprida/pendente/vencida/dispensada + sobreposições aguardando revisão e evidência pendente, com `items`), bloco no Dashboard com link por total para `/{obra}/esg?filtro=…` que lista as obrigações que compõem o total | `compute-esg-summary.test.mjs` (9), `test-esg-dashboard.mjs` (17) |
| 3 | Ações corretivas SSMA vinculadas ao módulo Ações/SLA | migration: vínculo 1:1, fonte oficial por campo, conclusão só pelo SSMA, propagação de responsável/prazo/início, backfill idempotente, reenvio/concorrência sem duplicar | `test-ssma-esg-migration-sql.mjs` (24) |
| 4 | E-mail de ocorrência crítica de campo e de atraso da ação | `lib/ssma/field-notifications/*`, rota `POST /api/ssma/field-records/notifications`, cron `/api/cron/ssma-notifications` (fail-closed `ACC_SSMA_NOTIFICATIONS_ENABLED`), workflow, aviso visível no app (enviado/falhou/sem destinatário) | `test-ssma-field-notifications.mjs` (13) |
| 5 | Perfis ESG alinhados (interface, servidor, banco) | `lib/esg/esg-permissions.ts` na tela e nas 3 ações; policies + Storage na migration; revisão/configuração só Administrador | `test-esg-profiles.mjs` (8) + SQL |
| 6 | Drive como evolução posterior; fotos de campo seguem pelos serviços de produção | nenhum código de Drive alterado; registro/consulta/recuperação das fotos validados em produção (ver `ssma-validacao-remota-2026-11-05.md`) | E2E em produção (20/20) |
| 7 | Testes e fechamento | `test-ssma-app-foundation.mjs` corrigido (comportamento das telas) e ligado em `test:ssma`; testes ESG/SSMA em `test:scripts`, `test:sql` e `test:ssma` (CI) | CI |

## 2. Lacunas — consequência e recomendação

| Lacuna | Consequência hoje | Requisito desta entrega? | Recomendação |
|---|---|---|---|
| **Edição/correção do registro após o envio** | Um erro de digitação (local, descrição, risco) não pode ser corrigido; o registro original é imutável por desenho (rastreabilidade), então a correção exigiria novo registro ou intervenção no banco. Risco **crítico** registrado errado continua disparando aviso. | **Não** para encerrar esta entrega (preserva a evidência original, regra 10/12 do projeto). | **Evolução** próxima: "registro complementar/retificação" que referencia o original (nunca sobrescreve), com autor, motivo e histórico; só autor/Administrador; reclassificação de risco gera novo aviso auditado. |
| **DDS** (diálogo diário de segurança) como fluxo próprio | Existe como checklist de formulário (trilha A, exige conexão), sem lista de presença estruturada, sem indicador (nº de DDS/participantes) e **sem uso offline**. | **Não** — o formulário atende o registro; falta só indicador/offline. | **Evolução**: indicador de DDS/semana (já há a base em `ssma_form_submissions`) e versão offline reaproveitando a fila da trilha B. Incluir só se a diretoria exigir o indicador no Dashboard. |
| **Quase-acidente** como fluxo próprio | Pode ser registrado como "Quase-acidente" (categoria da trilha B) e conta em "ocorrências" quando o tipo é OCORRÊNCIA; **não há indicador separado** nem taxa (quase-acidentes por acidente), e o formulário de acidente (trilha A) não o cobre. Risco: subnotificação sem visibilidade no Dashboard. | **Parcial**: o registro existe; o **indicador separado** é desejável. | **Requisito leve desta entrega se a diretoria quiser o número no Dashboard**: contar `category = 'Quase-acidente'` como linha própria (1 consulta já feita pela trilha B, sem migration). Fluxo próprio com investigação = evolução. |
| Indicadores quantitativos de ESG (kg de resíduo, horas de treinamento, taxa de frequência) | Dashboard mostra **status das obrigações**, não números ambientais/sociais. | **Não** (decisão 2: evolução posterior). | Evolução: formulários e fontes próprios por indicador (resíduos → MTR/planilha; treinamento → lista de presença; frequência → horas-homem + acidentes), cada um com origem rastreável. |
| Espelhamento das fotos de campo no Drive | Fotos de campo só no Supabase (protegidas); Drive só para fotos de formulários e atrasa horas. | **Não** (decisão 6). | Evolução; exige credenciais do Drive no servidor ou disparo sob demanda do workflow. |
| Ações corretivas offline | Andamento/conclusão exigem conexão. | **Não**. | Evolução: fila de eventos (já existe a base da fila). |
| Aviso por WhatsApp | Provedor segue **simulado** (travas do piloto). | **Não**. | Evolução condicionada ao provedor real e autorização. |
| Cron GitHub sem pontualidade | Aviso de atraso pode atrasar horas (diário por ação/prazo, nunca duplica). | Aceitável no piloto. | Se precisar de pontualidade: cron na Vercel (plano limita a 2) ou disparo externo confiável. |

## 3. Critérios de aceite para ENCERRAR SSMA/ESG

Atendidos **no código e nos testes automatizados** (branch): decisões 1–7 acima, testes verdes no CI.

**Ainda faltam** (dependem de acesso/ação e não foram executados):
1. **Aplicar a migration** em produção (autorização + pré-condições do documento de migration) e verificar.
2. **Validar em produção** no projeto TESTE, após a migration, e em **segunda sessão independente** (navegador novo, só login): registro crítico → ação vinculada em Ações; conclusão pelo SSMA e recusa em Ações; comprovação ESG por Colaborador e recusa para Leitura; indicadores do Dashboard coerentes com os registros; card ESG e listas por total.
3. **Notificações em circuito fechado** real (provedor Gmail do piloto + `ACC_OUTBOUND_MODE=pilot`, destinatário único) com evidência de envio e de prevenção de duplicidade; depois, e só com autorização, ligar `ACC_SSMA_NOTIFICATIONS_ENABLED`.
4. **iPhone/Safari e Android/Chrome**: executar `docs/ssma-roteiro-aparelho-real.md` e registrar. **Permanecem PENDENTES.**
5. Contas reais de perfil **Leitura** e **não-membro** para provar a recusa em produção (hoje só nos testes de banco).
6. Decisão de Reynaldo sobre as lacunas da tabela acima (em especial indicador de quase-acidente e retificação de registro).

## 4. Limites observados

- Concorrência real entre sessões não é exercitada em PGlite (uma conexão); o tratamento de envio concorrente é por `unique_violation` e o claim das notificações é atômico no banco (UPDATE condicional), mas a prova com conexões simultâneas exige Postgres real descartável.
- "Mesmo fato" nas duas trilhas é uma **regra por proximidade (24 h)**, não um vínculo explícito; dois eventos distintos no mesmo dia podem ser tratados como um (o painel informa quantos relatos foram descontados). Um vínculo explícito (registro de campo ↔ formulário) é evolução recomendada.
- O e-mail de notificação leva ao registro no ACC; a **resposta** do responsável é o andamento/conclusão no app SSMA ou em Ações (não há resposta por e-mail para este tipo de aviso, diferente dos alertas de risco).
- O mapeamento de risco SSMA→SLA e os prazos de assunção por risco (1 h/4 h/1 dia/3 dias, limitados ao prazo da ação) seguem a matriz padrão do SLA, mas são calculados no banco, **sem** considerar a matriz configurada por obra.
- Status `OVERDUE` do SLA continua sem ser gravado por nenhum job (comportamento anterior do módulo): o atraso é derivado na leitura; o aviso de atraso SSMA usa o prazo da ação SSMA.
