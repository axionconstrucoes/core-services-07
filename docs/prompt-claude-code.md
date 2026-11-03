Leia o CLAUDE.md, o AGENTS.md e docs/ui-redesign-axion.md (especificação do redesign aprovado, tema escuro).

Regras desta tarefa:
- Mudança VISUAL apenas. Não altere rota, loader, action, permissão, RLS nem regra de negócio. Não invente indicador, regra ou funcionalidade.
- Antes de codar, leia apps/web/node_modules/next/dist/docs/ (Next 16 tem mudanças incompatíveis).
- NÃO faça commit, push nem PR.
- Rode `git status` e crie uma branch nova a partir de origin/main antes de qualquer alteração.
- Anote quantos testes estão vermelhos antes de começar (esperado: 9, sem relação com UI).

Execute SOMENTE a etapa 1 da seção 6 da especificação:
apps/web/app/globals.css — acrescentar os tokens de superfície, texto e risco do tema escuro, sem redefinir --brand-sidebar nem --brand-header, e sem criar outro vermelho institucional.

Ao terminar: rode `npm run lint` e `npm run build`, mostre o diff e a contagem de testes vermelhos, e pare para eu aprovar a etapa 2.
