# SSMA/ESG — decisões aprovadas, implementação, lacunas e critérios de encerramento (06/11/2026)

Branch `feat/ssma-esg-acoes-notificacoes-perfis`. Migration **não aplicada** (ver `docs/ssma-esg-migration-20261106100000.md`). Critério de aceite permanente: **Reynaldo acessa acc.axion.com.br de outro PC autorizado e continua o trabalho com o computador do escritório desligado.**

## 1. Decisões aprovadas → o que foi implementado

| # | Decisão | Implementação | Prova |
|---|---|---|---|
| 1 | Manter as duas trilhas; indicadores consolidados, com origem e período, sem dupla contagem; zero ≠ ausência | `lib/ssma/dashboard-metrics.ts`: origem de cada total (formulários × registros de campo), período dos dados; **proximidade de 24 h só SUGERE "possível duplicidade"** (painel de revisão em `/{obra}/ssma-registros`, só Administrador); **só vínculo explícito confirmado por humano** (`ssma_incident_links`, `SAME_FACT`, auditado) desconta um relato; dois acidentes distintos no mesmo intervalo contam 2; `null` = sem dado, `0` = zero registrado; **quase-acidentes** = categoria estruturada "Quase-acidente" (lista fechada), com origem e período | `test-ssma-dashboard-metrics.mjs` (15) + SQL |
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
| **Quase-acidente** como fluxo próprio *(indicador entregue; fluxo próprio = evolução)* | Pode ser registrado como "Quase-acidente" (categoria da trilha B) e conta em "ocorrências" quando o tipo é OCORRÊNCIA; **não há indicador separado** nem taxa (quase-acidentes por acidente), e o formulário de acidente (trilha A) não o cobre. Risco: subnotificação sem visibilidade no Dashboard. | **Parcial**: o registro existe; o **indicador separado** é desejável. | **Requisito leve desta entrega se a diretoria quiser o número no Dashboard**: contar `category = 'Quase-acidente'` como linha própria (1 consulta já feita pela trilha B, sem migration). Fluxo próprio com investigação = evolução. |
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

- Concorrência: provada em **PostgreSQL real (18.6) com conexões independentes** (`npm run test:realpg`, 10/10; fora do CI): envio concorrente do mesmo registro, criação concorrente do vínculo SLA, andamento × reatribuição sem deadlock, decisão de duplicidade concorrente e reserva das notificações (3 destinatários → exatamente 3 e-mails com 10 execuções simultâneas). Limite: versão 18 do servidor de teste, sem GoTrue/Storage reais.
- "Mesmo fato" nas duas trilhas **só é descontado com decisão humana** (vínculo explícito, Administrador, auditada); a proximidade de 24 h apenas sugere. Enquanto ninguém decide, o total conta os dois relatos (pode superestimar, nunca subestima); o painel informa quantas possíveis duplicidades aguardam decisão.
- O e-mail de notificação leva ao registro no ACC; a **resposta** do responsável é o andamento/conclusão no app SSMA ou em Ações (não há resposta por e-mail para este tipo de aviso, diferente dos alertas de risco).
- O mapeamento de risco SSMA→SLA e os prazos de assunção por risco (1 h/4 h/1 dia/3 dias, limitados ao prazo da ação) seguem a matriz padrão do SLA, mas são calculados no banco, **sem** considerar a matriz configurada por obra.
- Status `OVERDUE` do SLA continua sem ser gravado por nenhum job (comportamento anterior do módulo): o atraso é derivado na leitura; o aviso de atraso SSMA usa o prazo da ação SSMA.

## 5. Atualização (06/11/2026, tarde) — estado por categoria

**IMPLEMENTADO (código, branch `feat/ssma-esg-limpa`, PR #142)**
- Contraste do app SSMA/ESG: o produto usa tema escuro com a paleta Tailwind remapeada (`globals.css`); botões e cartões que precisam de cor garantida usam cores explícitas. "Tirar foto/Anexar" claros com texto preto; "Da galeria/Selecionar fotos do computador" e "Registros de campo" escuros com texto branco; cartão 11 verde-escuro e 12 vermelho, texto e ícone brancos; faixa "SISTEMA EM TESTE" legível; estado desabilitado legível. Auditoria automática de contraste (WCAG) em 19 telas, desktop e celular: 0 achados.
- Formulários 11 e 12: causa do "não consigo enviar" = sem confirmação visível (cartões independentes nunca mostravam conclusão) e, no 12, erro de aviso por e-mail **depois** de o acidente já estar gravado (parecia falha e convidava a reenviar → duplicidade). Agora: tela "Enviado e confirmado no ACC", aviso separado de comunicação, mensagens úteis, dados preservados, bloqueio de reenvio após confirmação, aviso de falta de internet.
- DDS (diário, form. 01) / DSS (semanal, form. 02) nos nomes exibidos; identificadores e valores gravados preservados.
- Ícone de conclusão `done-icon.png` (hash preservado) em `public/ssma/`, só após envio confirmado.
- Campo Obra (formulários 1–12, novo registro, tela ESG): obra atual / única autorizada / escolha; só obras autorizadas; limpeza de dependentes; pendências conservam a obra.
- Quase-acidente nas duas trilhas, filtros, vínculo de evidência ESG (interface alinhada às permissões: Administrador em qualquer comprovação, demais perfis só na própria; Leitura só vê), contagem de acidentes por vínculo humano.
- Preparo (NÃO aplicado/ativado): autorização individual de acesso ao e-mail (`docs/autorizacao-acesso-email-*.md`, lib pura, migration `20261106120000`).

**TESTADO LOCALMENTE**: tsc, lint (0 erros), `npm test`, `test:scripts`, `test:email`, `test:sql`, `test:ssma`, build; PostgreSQL 18.6 real com conexões independentes: 13/13 (inclui vínculo ESG concorrente G1–G3); navegador (build local contra o projeto TESTE de produção): formulários 11 e 12 enviados, confirmados e gravados; campo Obra com 3 obras autorizadas; contraste.

**PUBLICADO / COMPROVADO EM PRODUÇÃO**: nada deste bloco ainda (depende de aplicar migrations e do merge).

**PENDENTE**: aplicar `20261106100000` (autorizada) e `20261106110000` (aguarda aprovação do SQL); `20261106120000` só se aprovada; merge, Vercel, validação em produção em duas sessões; circuito fechado de e-mail (piloto); iPhone/Safari e Android/Chrome reais; Drive (conector não autenticado); conta Leitura/não-membro reais.
