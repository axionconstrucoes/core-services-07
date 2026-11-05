# Levantamento SSMA / ESG no ACC — fechamento da implementação (05/11/2026)

Leitura do repositório (working tree em `fc04982`), **sem executar testes, builds, rede, banco ou `.env`**. Duas afirmações centrais foram conferidas por `grep` após o levantamento: (1) o Dashboard lê `ssma_form_submissions` (`dashboard/page.tsx:593`) e não `ssma_field_records`; (2) `EsgCard` só é **definido** (`components/dashboard-visual/summary-cards.tsx:177`) e nenhuma página o renderiza. Contagens de verificações de teste são aproximadas (asserts por `grep`). O estado real do banco de produção **não** foi verificado (usado `docs/plano-implantacao-vera-hardening.md:8`).

## 1. Resumo

- **SSMA tem duas trilhas independentes.** **A — formulários/checklists** (`ssma_form_submissions`, migration `20260909143000`): 12 checklists (DDA, DDS, fotos diárias, APR, PT, integração, almoxarifado, riscos apontados, limpeza, outros, bota-fora, ocorrência/acidente), com fotos, **exigem conexão**. **B — registros de campo PWA** (`ssma_field_records`, `20261028130000`): ocorrência/inspeção, responsável, prazo, ação corretiva com histórico imutável, fotos e **fila offline**.
- **ESG no ACC = obrigações contratuais** (`esg_obligations`, submissões, evidências): RLS, risco determinístico, revisão por ADMIN e Diretor de ESG IA. O próprio doc diz que **não** é sistema de ESG corporativo nem de gestão de segurança do trabalho (`docs/esg-obligations.md:6-25`). **Não há indicadores quantitativos** (kg de resíduo, consumo, horas de treinamento, taxa de frequência).
- **Maior lacuna — Dashboard:** o painel SSMA classifica **texto livre por regex** em `ssma_form_submissions` e ignora a trilha B e as ações corretivas; sem correspondência mostra "—" (inclusive para zero acidentes). **ESG não aparece no Dashboard** (`EsgCard` existe e não é usado).
- **Faltam:** alerta de prazo vencido das ações corretivas; ações corretivas offline; teste em iPhone/Android reais; fluxo próprio de DDS/quase-acidente; edição/correção do registro após envio; notificação para ocorrência crítica da trilha B.
- **Compartilhado ESG/SSMA:** a tela `/{obra}/esg` abriga os dois; a categoria `REGISTRO_ACIDENTE_INCIDENTE`; o Drive; o Diretor de ESG IA cobre os dois. Registros de campo (B) e obrigações ESG **não** se ligam por FK.

## 2. Tabela A — SSMA (Saúde, Segurança e Meio Ambiente)

| Funcionalidade | Estado implementado | Evidência | Lacuna | Próxima ação |
|---|---|---|---|---|
| Formulários/checklists (trilha A) | **Pronto.** 12 checklists, campos, checks e fotos (`required`, `requiredPhotoActions`). | `lib/ssma/checklist-definitions.ts`; `components/ssma/ssma-field-app.tsx:257-510`; `scripts/test-ssma-app-foundation.mjs` (~35) | Exige conexão; validação no cliente só `required` + fotos. | Auditar a RPC `create_ssma_form_submission` (`20260909143000:117`); decidir migrar para a trilha B. |
| Ocorrência/inspeção (trilha B) | **Pronto (local); produção provável.** Tipo, categoria, descrição, local, data, risco, responsável, prazo. | `20261028130000_ssma_field_records.sql:21-35`; RPC `ssma_field_record_submit:156`; `test-ssma-field-records-sql.mjs` (~27), `-logic.mjs` (~46) | Sem edição/correção após envio; sem DDS/quase-acidente com fluxo próprio. | Decidir se "quase-acidente" vira `kind` da trilha B. |
| Validações no servidor | **Pronto (B).** CHECKs (descrição 3–4000, risco, foto jpg/png ≤ 15 MB, sha256), `INVALID_FUTURE_DATE`, `DUE_DATE_REQUIRED`, `RESPONSIBLE_NOT_PROJECT_MEMBER`, `USER_MISMATCH`, `RECORD_ID_CONFLICT`. | migration `:24-69`; RPC `:156-232` | Equivalente na trilha A **não confirmado**. | Auditar a RPC da trilha A. |
| Gravação offline/online | **Pronto, só em Chrome.** Fila IndexedDB, idempotência por UUID, estados Salvo/Aguardando/Sincronizado/Falha. | `lib/ssma/field-records/queue-core.ts`, `idb-store.ts`; `test-ssma-offline-queue.mjs` (~82), `test-ssma-offline-browser.mjs` (Chrome real) | **Não validado em iPhone/Android reais**; HEIC não aceito. | Teste em 1 iPhone e 1 Android. |
| Service worker / PWA / QR | **Parcial.** SW guarda casca/estáticos; QR leva só a URL. | `public/sw.js`; `test-ssma-service-worker.mjs`; `test-ssma-qr-content.mjs`; `ssma-install-card.tsx` | QR só com `ACC_SSMA_PWA_URL`/`AXION_APP_BASE_URL` (produção não verificada). | Confirmar a variável; teste em celular. |
| Permissões (RLS/perfis) | **Pronto.** SELECT para membro ativo; escrita só por RPC; LEITURA não registra; andamento só por responsável ou GESTOR+. | migration `:88-99,183-186`; `ssma_corrective_action_update:304+`; `test-ssma-field-records-sql.mjs` | Policies reais em produção não verificadas. | Rodar `test:sql` antes do fechamento. |
| Anexos/evidências (Storage) | **Pronto.** Bucket `project-documents`, caminho validado (`can_upload_ssma_field_photo_object`), foto registrada por RPC, URL assinada só leitura; descarte de foto órfã. | migration `:115-151,233`; `app/api/ssma/records/photos/[photoId]/route.ts`; `app/api/ssma/photos/discard/route.ts`; `20261030140000_*`; `scripts/sql/run-ssma-photo-discard-{http,storage}-test.mjs` | A migration `20261030140000` está **pendente em produção** (plano de implantação). Sem compressão. | Aplicar conforme o plano (exige autorização). |
| Espelho no Drive | **Parcial.** Sync de foto e validação read-only de 12 subpastas. | `lib/drive/sync-ssma-photo-to-drive.ts`; `test-ssma-drive-*` (~75) | Depende de credencial do Drive (não confirmada). | Decidir se entra em 06/11. |
| Acidentes/ocorrências (notificação) | **Parcial.** `POST /api/ssma/accident-notifications` (checklist `ocorrencia-acidente`): e-mail à área ENGENHARIA (+ COMERCIAL se houver afastamento); sem destinatário → auditoria + 409. | `app/api/ssma/accident-notifications/route.ts:11-60`; `lib/email/send-ssma-accident-alert-email.ts` | Só a trilha A notifica; a B não dispara e-mail; WhatsApp só simulado. | Decidir notificação de ocorrência crítica da B; conferir áreas dos membros. |
| Responsáveis | **Pronto (B).** `responsible_user_id` membro ativo não-LEITURA; exige prazo. Trilha A só tem técnico. | migration `:35,156-232` | Responsável da trilha A não existe; ESG é texto livre. | — |
| Providências / ações corretivas | **Pronto (B).** `ssma_corrective_actions` (ABERTA/EM_ANDAMENTO/CONCLUIDA), histórico imutável, conclusão exige evidência ou justificativa. | migration `:59-86,304-366`; `record-detail.tsx`; `test-ssma-field-records-sql.mjs` | **Sem offline**; sem integração com o módulo Ações/SLA. | Decidir se vira Ação/Providência do ACC. |
| Prazos / atraso | **Parcial.** Atraso calculado na exibição e contado no painel. | `field-records-table.tsx:36`; `ssma-registros/page.tsx:41-50` | Sem alerta/e-mail por vencimento. | Criar alerta ou documentar a ausência. |
| Painel de registros | **Pronto.** Totais (registros, ações em aberto, em atraso, críticos em aberto) + tabela com fotos por link assinado. | `app/[projectId]/ssma-registros/page.tsx` | Fora do menu (só por botão na tela ESG). | Atalho no menu ou no Dashboard. |
| Consulta IA SSMA | **Pronto (provedor simulado nos testes).** Somente leitura. | `app/ssma/consult-actions.ts`; `lib/ai/alert-consult/ssma-consult.ts`; `test-ssma-record-consult.mjs` (~17) | Provedor real depende de configuração. | Smoke com IA real, se autorizado. |

## 3. Tabela B — ESG

| Funcionalidade | Estado implementado | Evidência | Lacuna | Próxima ação |
|---|---|---|---|---|
| Cadastro de obrigação | **Pronto.** 16 categorias, periodicidade, cláusula, evidência exigida, penalidade; responsável em **texto livre**. | `20260822050000_esg_obligations_foundation.sql:44-64`; `esg/actions.ts:30-78`; `esg-obligation-form.tsx` | Responsável não é usuário/FK; sem obrigações pré-cadastradas. | Definir o checklist inicial do projeto piloto. |
| Registro de comprovação | **Pronto.** 6 status, prazo, período, DDS (tema, equipe, participantes), justificativa obrigatória para NAO_APLICAVEL/DISPENSADO. | `esg/actions.ts:106-108,146-149`; `esg-submission-form.tsx`; `test-esg-obligations.mjs` (~34) | **Sem agendador** (cada registro é manual). | Decidir se a periodicidade gera pendências. |
| Indicadores ambientais/sociais/governança (quantitativos) | **Ausente.** Só status por obrigação; DDS guarda nº de participantes; bota-fora guarda MTR em campo livre. | grep em migrations, `lib/esg/*`, `components/esg/*` | Se "indicadores" = números, não existem. | Definir escopo (Decisão 1) antes de implementar. |
| Evidências (Storage) | **Pronto, com ressalva.** pdf/doc/docx/xls/xlsx/csv/txt/jpg/png, 50 MB; registro criado antes do upload. | `esg-submission-form.tsx:85-150`; migration `:418-426` | **Upload real não exercitado por teste automatizado** (`docs/esg-obligations.md:261-265`). | Teste manual ponta a ponta. |
| Revisão | **Pronto.** RPC `review_esg_obligation_submission` exige ADMIN. | migration `:574-575`; `esg-review-form.tsx` | Recalculo de risco na revisão não confirmado. | Ler a RPC. |
| Permissões | **Pronto, com divergência.** Banco: criar/anexar por nível editor, revisar por ADMIN. UI: formulários só ao ADMINISTRADOR. | migration `:184-198,360-370,493-500`; `esg/page.tsx:48-50` | Divergência UI × servidor. | Decisão 3. |
| Risco e prazos | **Pronto.** Regra determinística com motivos legíveis. | `lib/esg/compute-obligation-risk.ts:44-111`; `test-esg-obligations.mjs` (10 casos) | Filtro de risco mostra LOW/HIGH em inglês. | Rótulo trivial. |
| Providências ligadas | **Parcial.** `acoes` tem `related_esg_obligation_submission_id`; vínculo manual. | `lib/sla/sla-actions-data.ts:78`; `app/[projectId]/acoes/actions.ts:141` | Sem criação automática. | Confirmar o fluxo na UI de Ações. |
| Diretor de ESG IA | **Pronto.** | `lib/ai/experts/esg-director/*`; `test-esg-director.mjs` (~25) | Depende de provedor configurado. | — |

## 4. Tabela C — Dashboard (`app/[projectId]/dashboard/page.tsx`)

| Bloco | Lê do banco? | Detalhe | Estado |
|---|---|---|---|
| "SSMA — Segurança" (acidentes com/sem afastamento, ocorrências, dias sem acidente) | Sim, **por heurística** | `ssma_form_submissions` com `status = SUBMITTED` (`:592-599`), regex em slug/título/JSON (`:616-663`); "dias sem acidente" = dias desde o último registro com "acidente"; sem correspondência → "—". | **Parcial e frágil.** Não usa o campo estruturado `afastamento`, nem `ssma_field_records`, nem as ações corretivas. |
| Planilha do relatório semanal (`ssmaMetrics`) | Sim | `accidents`, `incidents`, `dds`, `dda` calculados; renderização não encontrada (só o status "SSMA" da fonte). | A confirmar. |
| ESG (`EsgCard`, `computeEsgSummary`) | A função busca obrigações/submissões/evidências (`get-dashboard-visual-data.ts:124`) | **`EsgCard` não é renderizado.** | **ESG ausente no Dashboard.** |
| Trilha B / ações corretivas / em atraso | Não | Só em `/{obra}/ssma-registros`. | **Ausente no Dashboard.** |

Não há valores fictícios: os "—" são ausência de correspondência. **Zero** e **sem dado** ficam indistinguíveis.

## 5. Ordem de execução proposta para 06/11/2026

| # | Tarefa | Por quê | Esforço | Dependência | Critério de pronto |
|---|---|---|---|---|---|
| 1 | Confirmar migrations em produção (`20261028130000` aplicada? `20261030140000` pendente?) e `ACC_SSMA_PWA_URL`. | Tudo depende de a trilha B existir no banco real. | 1 h | Acesso ao remoto | Lista conferida e registrada. |
| 2 | Dashboard SSMA: usar `ssma_field_records` e `ssma_corrective_actions` (abertas, em atraso, críticas) e distinguir "0" de "sem dado". | Maior lacuna de "dados reais". | 6–8 h | Passo 1; Decisão 2 | Painel com contagens reais; teste cobre zero × ausência. |
| 3 | Dashboard SSMA: trocar regex por campo estruturado (`afastamento` da `ocorrencia-acidente`). | Heurística pode errar. | 3–4 h | — | Contagens batem em projeto de teste. |
| 4 | Dashboard ESG: renderizar `EsgCard` (ou bloco equivalente). | Função já calcula. | 2–3 h | — | Card visível lendo o banco. |
| 5 | Alerta de prazo vencido das ações corretivas SSMA. | Atraso só aparece na tela. | 6–10 h | Decisão 2 | Ação vencida avisa o responsável, com teste. |
| 6 | Alinhar permissões da UI do ESG com a decisão. | Divergência UI × banco. | 2 h | Decisão 3 | Perfil decidido registra; LEITURA não. |
| 7 | Testes manuais ponta a ponta: upload real de evidência ESG e foto SSMA; PWA em iPhone e Android. | Lacunas documentadas. | 3–4 h | Passos 1 e 6 | Checklist com evidências. |
| 8 | Notificação de ocorrência crítica da trilha B. | Hoje só a trilha A notifica. | 4–6 h | Decisão 4 | E-mail + auditoria. |
| 9 | Atualizar docs (`modulo-seguranca-pwa.md`, `esg-obligations.md`, manual 4.27–4.29) e `test:ssma`. | Rastreabilidade. | 2 h | 2–8 | Docs coerentes; testes verdes. |

## 6. Decisões do Reynaldo

1. "Indicadores ambientais/sociais" no Dashboard = números (kg de resíduo, horas de treinamento, taxa de frequência) ou só o status das obrigações ESG? Hoje só existe o status.
2. A ação corretiva SSMA vira "Providência/Ação" do módulo Ações/SLA (com alertas) ou fica isolada na trilha B?
3. Quem registra comprovação ESG: só ADMINISTRADOR (UI atual) ou também GERENTE/COLABORADOR (o que o banco permite)?
4. Ocorrência crítica da trilha B notifica por e-mail (e WhatsApp, hoje simulado)? A quem?
5. Trilhas A e B continuam as duas ou se unificam? Define de onde o Dashboard lê.
6. O Drive (espelho de fotos e validação das 12 subpastas) entra no fechamento de 06/11?

## 7. Incertezas desta leitura

- Corpos das RPCs `create_ssma_form_submission`, `finalize_ssma_form_submission` e `review_esg_obligation_submission` não foram lidos.
- Estado real do banco de produção não verificado.
- `EsgCard` e as métricas da planilha fora do Dashboard foram concluídos por `grep`, sem conferência visual.
- Contagens de testes aproximadas; Event Ledger/auditoria do ESG só pela documentação.
