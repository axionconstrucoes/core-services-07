# Design system do ACC — Hover Text universal e legibilidade (regra permanente)

Este documento é parte dos **critérios de aceite** do ACC. Vale para todo módulo atual e futuro.

## 1. Regra permanente de desenvolvimento (Definition of Done)

Nenhuma nova **aba, subaba, campo funcional relevante, indicador (KPI), status, coluna de tabela, filtro, gráfico, configuração ou ação administrativa** é considerada concluída sem:

1. **Descrição contextual adequada** no catálogo (`apps/web/lib/ui/help/modules/<módulo>.ts`), renderizada com `HelpHint`/`FeatureInfo` e inventariada no manifesto (`apps/web/lib/ui/help/manifests/<módulo>.ts`).
2. **Contraste acessível** (seção 3), inclusive nos estados hover, foco, ativo, selecionado, desabilitado, carregando, sucesso, aviso e erro.
3. **Suporte a desktop e dispositivos móveis** (sem depender de hover; painel rolável; sem cortes).
4. **Navegação por teclado** quando aplicável (Enter/Espaço abrem, ESC fecha, foco visível, ordem lógica).
5. **Testes de cobertura e acessibilidade** passando (`scripts/test-help-catalog.mjs`, `scripts/test-help-coverage.mjs`, `scripts/test-contrast-system.mjs` e os testes de navegador).

Mecanismos que impedem regressão: uma rota nova (`page.tsx`) sem manifesto **falha** `test-help-coverage`; um helpId inexistente ou não renderizado **falha** `test-help-catalog`; um par de cores que viole os limiares **falha** `test-contrast-system`; texto genérico, KPI sem fórmula/fonte e especialista sem limitações **falham** o catálogo.

## 2. Arquitetura do Hover Text

| Peça | Caminho |
|---|---|
| Componente universal | `apps/web/components/shared/help-hint.tsx` (`HelpHint`); `FeatureInfo` é o nome histórico (wrapper) |
| Corpo estruturado | `apps/web/components/shared/help-content.tsx` (`HelpContent`) — reutilizável em páginas (ex.: perfis dos EXPERTS IA) |
| Contrato | `apps/web/lib/ui/help/types.ts` (`FeatureHelpDefinition`, `HelpManifest`) |
| Registro único | `apps/web/lib/ui/help/registry.ts` (agrega legado + módulos; reexportado por `lib/ui/feature-help.ts`) |
| Catálogo por módulo | `apps/web/lib/ui/help/modules/*.ts` (cada módulo edita só o seu arquivo) |
| Inventário por módulo | `apps/web/lib/ui/help/manifests/*.ts` (lista **autoritativa** de elementos: tela, aba, tipo, rótulo, helpId, lacuna ou isenção) |
| Política de cobertura | `apps/web/lib/ui/help/coverage-policy.ts` (rotas isentas com motivo) |
| Inventário automático | `node scripts/help-inventory.mjs` → `docs/design-system/inventario-ui-ajuda.{json,md}` (heurística para achar lacunas) |

### Identificadores
Entradas novas: `modulo.tela.elemento` (minúsculas, hífens; ex.: `planejamento.acoes.kpi-vencidas`). Ids legados (91) são preservados. O id é **estável**: nunca renomear; mudar o sentido do texto exige nova `version`.

### Conteúdo (campos de `FeatureHelpDefinition`)
`description` (o que é) · `purpose` (para que serve) · `howToUse` · `howItWorks` · `data` · `criteria` · `formula` · `source` · `unit` · `refresh` · `missingData` · `consequences` · `permissions` · `limitations` · `validity` · `humanReview` · `version`. **Omitir o que não se aplica** — nunca preencher com texto genérico. **Nunca inventar** fórmula, fonte, frequência, prazo, permissão ou currículo: o texto descreve o que o código faz (citar o arquivo/tabela real). Indicador sem fonte/fórmula identificável vira lacuna declarada no manifesto, não texto inventado. Dado ausente é "sem fonte", nunca zero.

### SLAs
Prazos aprovados: **CRÍTICO 1 hora corrida · ALTO 4 horas úteis · MÉDIO 2 dias úteis · BAIXO 5 dias úteis**. Enquanto a regra operacional publicada no banco divergir (migration `20261121177000` ainda não aplicada em produção), a entrada informa a diferença e a vigência em `validity`, sem apresentar como ativa a regra não publicada.

### Interação (HelpHint)
Desktop: o mouse sobre o ícone abre o painel e ele permanece aberto enquanto o ponteiro estiver sobre o ícone ou o painel; clique/Enter/Espaço fixam. Teclado: Enter/Espaço abrem (foco vai ao painel), ESC fecha e devolve o foco. Mobile/toque: folha inferior rolável com botão Fechar, sem depender de hover. Painel em portal, dentro da tela, rolagem interna, sem rolagem automática da página; um painel por vez; não usa o atributo `title`.

## 3. Legibilidade e contraste (regra universal)

**FUNDO CLARO → FONTE ESCURA. FUNDO ESCURO → FONTE CLARA.** Vale para qualquer componente, independentemente do tema.

| Elemento | Mínimo |
|---|---|
| Texto normal | 4,5:1 (WCAG AA); meta 7:1 (AAA) |
| Texto grande | 3:1 |
| Controles e componentes gráficos relevantes (borda de campo, foco, ícones, barras) | 3:1 |

A avaliação usa o **fundo efetivo** (transparências, sobreposições e gradientes compostos), nunca só a cor declarada no pai. Estados a verificar: NORMAL, HOVER, FOCUS, ACTIVE, SELECTED, DISABLED, LOADING, SUCCESS, WARNING, ERROR (desabilitado deve ser distinguível de ativo sem virar ilegível).

Implementação: `apps/web/lib/ui/contrast.ts` (funções puras: hex/rgb/oklch, composição, razão, regra claro/escuro), `apps/web/lib/ui/contrast-pairs.ts` (pares semânticos protegidos; **adicione o par de todo token novo**), tokens em `apps/web/app/globals.css`. Auditoria estática de todas as classes de cor: `node scripts/contrast-audit.mjs [--summary|--meta|--json|--scope=shared]` (resolve a paleta REMAPEADA e as regras do globals.css; heurística, não é 100%): **bloqueante** nos arquivos compartilhados (`scripts/test-contrast-audit.mjs`, sem exceções) e informativa nos módulos (revisão em `docs/design-system/contraste-revisao-modulos.md`; correções mecânicas em `scripts/contrast-apply-module-fixes.mjs`). Testes em Chrome real do componente de ajuda: `npm run test:browser` (hover, teclado, celular, `axe-core`, contraste medido). Lacunas conhecidas só podem existir em `KNOWN_GAPS` com motivo e providência (o teste exige que a lista seja exata).

## 4. Como adicionar um elemento novo (passo a passo)
1. Escreva a entrada em `lib/ui/help/modules/<módulo>.ts` com id `modulo.tela.elemento`, `kind`, `module`, `version` e os campos que se aplicam, descrevendo o comportamento REAL (leia o código).
2. Renderize `<HelpHint helpId="…" />` junto do elemento (ou `<FeatureInfo …/>`).
3. Registre o elemento no manifesto do módulo (rota, aba, kind, rótulo, helpId).
4. Se criou cor/token novo, adicione o par em `contrast-pairs.ts`.
5. Rode `node scripts/test-help-catalog.mjs`, `node scripts/test-help-coverage.mjs --matrix`, `node scripts/test-contrast-system.mjs`.
