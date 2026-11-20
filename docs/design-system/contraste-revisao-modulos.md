# Contraste dos módulos — revisão das reprovações restantes do auditor (20/11/2026)

O auditor (`node scripts/contrast-audit.mjs`) é heurístico (sem árvore JSX, sem estilo inline, fundo-base por pior caso). Nos arquivos COMPARTILHADOS a auditoria é bloqueante (`scripts/test-contrast-audit.mjs`, sem exceções). Nos arquivos de MÓDULO ela é informativa; as reprovações restantes foram revisadas uma a uma:

| Arquivo:linha | Achado do auditor | Revisão |
|---|---|---|
| components/assistant/vera-trigger.tsx:36,46 | texto/anel preto sobre fundo escuro | Falso positivo provável: ramo `tone === "onLight"` (fundo claro). Confirmar o ramo escuro em navegador. |
| components/projects/edit-project-form.tsx:23,82,86 | anéis e bordas pretas/bordô | Falso positivo: formulário em cartão claro explícito (`bg-[#ffffff] [color-scheme:light]`). |
| components/projects/create-project-form.tsx:17 | placeholder #475569 | Falso positivo: cartão claro (bg-white/95); #475569 sobre branco ≈ 7,6:1. |
| components/projects/copy-structure-wizard.tsx:205 | erro #b42318 sobre accent | Falso positivo: assistente em cartão claro; #b42318 sobre claro ≥ 6:1. |
| components/integrations/construmanager-panel-styles.ts:27,31 | text-black e anel #C2185B | Falso positivo: campo `bg-white` próprio (regra composta devolve fundo claro); anel #C2185B sobre branco ≈ 5,6:1. |
| components/integrations/construmanager-version-impact-form.tsx:28 | hover/foco preto | Ícone sobre formulário `bg-white text-black` (claro). |
| components/legal/delete-legal-consultation-button.tsx:72 | texto preto sobre #ff6b57 desabilitado | Razão 3,30:1 no estado desabilitado (>= 3:1 exigido para desabilitado); ativo é ≈ 8:1. |
| Corrigidos nesta fase | caixas/page.tsx (opacity-40 → 60), ssma-field-app.tsx (border-slate-300 → border-input), esg-project-switch.tsx (outline #7f1d1d → token ring), 6 literais `disabled:opacity` via contrast-apply-module-fixes | — |

Pendência: validar em navegador real (com login) as telas acima; o harness de navegador (`npm run test:browser`) cobre o componente HelpHint, não as telas de módulo (exigem Supabase).

## Medição no Chrome real dos 16 apontamentos (B3, 20/11/2026)

O auditor reporta 16 apontamentos nos 7 arquivos acima. Cada um foi **medido no Chrome (CDP) com o CSS real do app** em fixture isolada (`scripts/fixtures/help-browser/entry.tsx`, cena `#contrast`; teste `CA1-CA16` em `scripts/test-help-browser.mjs`, `npm run test:browser`). As classes da fixture são cópias literais das do código e `scripts/test-help-fixture-sync.mjs` falha se divergirem.

| CA | Arquivo:linha | Estado medido | Razão medida (mínimo) | Veredito |
|--:|---|---|---|---|
| 1 | vera-trigger.tsx:38 | contorno de foco, tom `onLight` sobre #F7F4EC | **2,91:1 antes** (a regra global `a/button:focus-visible` #4d8dff não está em camada e vence `outline-black`); **19,11:1 depois** (3) | **REAL — corrigido** (`focus-visible:!outline-black`) |
| 2-4 | vera-trigger.tsx:48 | texto base/hover/foco, preto sobre #F7F4EC | 19,11:1 (4,5) | Falso positivo |
| 5 | construmanager-panel-styles.ts:27 | texto digitado, preto sobre branco | 21:1 (4,5) | Falso positivo |
| 6 | construmanager-panel-styles.ts:31 | foco: anel #C2185B + contorno global #4d8dff sobre o cartão #182941 | anel 2,50:1 (só ele); contorno global 4,59:1; anel sobre o branco do campo 21:1 (3) | Falso positivo (o indicador efetivo inclui o contorno global) |
| 7-8 | construmanager-version-impact-form.tsx:28 | ícone hover/foco, preto sobre o formulário branco (`.bg-white.text-black` → #fff) | 21:1 (3) | Falso positivo |
| 9 | delete-legal-consultation-button.tsx:75 | texto desabilitado | 6,22:1 (#a3a9b3 sobre #182941; ativo 14,66:1) (3) | Falso positivo |
| 10 | copy-structure-wizard.tsx:205 | erro #b42318 sobre o cartão claro | 5,47:1 (4,5) | Falso positivo |
| 11 | create-project-form.tsx:17 | placeholder #475569 | 6,83:1 (4,5) | Falso positivo |
| 12 | edit-project-form.tsx:23 | anel do campo #7f1d1d sobre #A8ADB5 | 4,44:1 (3); placeholder 7,56:1 | Falso positivo |
| 13-15 | edit-project-form.tsx:82 | borda/anel do Cancelar, preto sobre #A8ADB5 | 9,31:1 (3) | Falso positivo |
| 16 | edit-project-form.tsx:86 | anel de foco do Salvar | 9,31:1 (3) | Falso positivo |

Resultado: 1 de 16 era real (CA1) e foi corrigido; 15 são falsos positivos do auditor (que compõe o fundo-base pior caso, sem ver o cartão claro/regra `.bg-white:is(.text-black)`). **Não validado**: as telas completas autenticadas (sem sessão/Supabase); a medição vale para as classes reais, não para o fluxo da tela. `construmanager-content-download.tsx` (que usa as classes CA5/CA6) não é montado por nenhuma rota (ver `componentes-sem-rota.json`).
Observação geral: a regra global de foco (`globals.css`, `outline: 2px solid var(--focus-ring)`) vence utilidades `outline-*` do Tailwind; em fundo CLARO o azul #4d8dff dá ~2,9:1 — qualquer outro componente em superfície clara que dependa só do contorno global deve declarar o anel próprio (como em `edit-project-form`) ou usar `!outline-*`.
