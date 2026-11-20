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
