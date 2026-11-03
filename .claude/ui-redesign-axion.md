# Redesign da interface do ACC — especificação

Base do conceito: `origin/main` em `e11fe7c`. Protótipo aprovado em canvas
(quatro pranchas: Dashboard, Timeline, Detalhe do evento, Sistema visual).
Este documento existe para que a implementação não dependa de ver o
protótipo — tudo que decide cor, tipo e estrutura está aqui.

## 1. Princípio da direção

Navegação lateral em **vermelho AXION com textura quadriculada**; barra
superior e painéis de indicador em **grafite**; área de trabalho em
**cinza muito claro**.

O grafite saiu da lateral de propósito. Com lateral preta e painéis de
indicador pretos, os indicadores não se destacavam de nada. Agora a marca
ocupa a borda da tela e o grafite marca exclusivamente o que exige
atenção — os quatro indicadores que abrem o Dashboard.

## 2. Paleta

| Papel | Hex | Observação |
| --- | --- | --- |
| Vermelho AXION | `#7F1D1D` | Já existe como `--brand-sidebar` em `globals.css` (`oklch(0.396 0.141 25.723)`). **Não criar outro vermelho institucional.** |
| Vermelho AXION — ativo | `#991B1B` | `--brand-sidebar-active`, já existe |
| Creme (item ativo, logo) | `#F7F3EA` | Mesmo creme do cartão da tela de seleção de projeto |
| Vinho (texto sobre creme) | `#5E1414` | |
| Grafite | `#141922` | Barra superior e painéis de indicador |
| Grafite — borda | `#242C37` | |
| Cinza de trabalho | `#F3F4F6` | Fundo da área de conteúdo |
| Branco | `#FFFFFF` | Cartões |
| Borda de cartão | `#E3E6EB` | |
| Texto principal | `#0F1419` | |
| Texto secundário | `#5A6472` | |
| Verde — normal | `#19795A` | |
| Âmbar — atenção | `#E59A1B` | texto sobre âmbar: `#1A1206` |
| Laranja — alto | `#E8701F` | |
| Vermelho vivo — crítico | `#D23B2A` | |

Regra que não pode ser quebrada: **dois vermelhos com papéis separados.**
O institucional identifica a AXION e nunca significa risco; o vivo
significa risco crítico e nunca é superfície de marca.

As quatro faixas de risco diferem também em luminosidade, não só em
matiz — requisito de acessibilidade, não estética.

### Textura quadriculada

Aplicada sobre o vermelho da lateral:

```css
background-color: var(--brand-sidebar);
background-image:
  linear-gradient(rgba(255,255,255,.07) 1px, transparent 1px),
  linear-gradient(90deg, rgba(255,255,255,.07) 1px, transparent 1px);
background-size: 48px 48px;
```

Mesma textura, em módulo de 40 px e opacidade `.04`, no bloco grafite de
"Enviar alerta contratual".

## 3. Tipografia

IBM Plex Sans (texto) + IBM Plex Mono (número, data, código, identificador).

| Papel | Tamanho / peso |
| --- | --- |
| Título de tela | 21 / 600, `letter-spacing: -0.01em` |
| Título de seção | 14 / 600 |
| Corpo | 13–14, `line-height: 1.6`, máx. 72ch |
| Número de indicador | Mono 42 / 600 |
| Dado tabular | Mono 12 |
| Rótulo de coluna | 11, `letter-spacing: .08em`, caixa alta |

Toda data, valor, percentual e identificador usa a mono — é o que alinha
as colunas sem truque de CSS.

## 4. Espaçamento e raio

4 px rótulo→valor · 8 px entre botões · 16 px entre cartões · 20 px
respiro interno · 28 px margem lateral da tela.

Raio cresce com o elemento: 3 px etiqueta, 5 px botão, 7 px cartão.

**Sem sombras.** Separação por borda de 1 px.

## 5. Estrutura das três telas

### Dashboard (`app/[projectId]/dashboard/page.tsx`)

1. **Primeira linha, painéis grafite:** alertas ativos · ações vencidas ·
   risco atual · avanço físico. Só esses quatro são escuros.
2. **Segunda linha, cartões claros:** avanço do contrato (curva S) ·
   situação contratual · planejamento.
3. **Terceira linha:** avisos operacionais (seção própria) · integrações.

Avisos operacionais ficam separados dos alertas contratuais. São coisas
diferentes; misturá-las é o que transforma o dashboard em ruído.

### Timeline (`app/[projectId]/timeline/page.tsx`)

- Busca sempre visível, barra de 42 px, com contagem de resultados.
- Filtros avançados em painel expansível, com contador de filtros ativos.
  Fechado por padrão depois da primeira visita.
- Filtros em quatro grupos: origem · criticidade · período · participantes.
- Lista cronológica com cabeçalho de data por dia; faixa de 3 px à
  esquerda só nas linhas críticas; sem listras alternadas.

### Detalhe do evento (`app/[projectId]/ledger/[eventId]/page.tsx`)

Duas colunas.

- **Esquerda — ler e decidir:** resumo; avaliação da IA separando
  explicitamente **fato / inferência / recomendação** (regra 12 do
  `CLAUDE.md`), cada um com sua etiqueta; fontes usadas ao pé.
- **Direita — o que sustenta:** evidência original marcada "não
  editável"; confronto com outras fontes; histórico.
- **Enviar alerta** fica em bloco grafite com textura, visualmente de
  outra família que a evidência — é ação, não prova.

## 6. Ordem de implementação

1. `apps/web/app/globals.css` — tokens. `--brand-sidebar` já tem o
   vermelho certo; acrescentar os tokens de superfície e de risco que
   faltam, sem redefinir os existentes.
2. `apps/web/components/layout/app-sidebar.tsx` — fundo vermelho +
   textura, item ativo creme.
3. `apps/web/components/layout/top-bar.tsx` — grafite.
4. Dashboard, Timeline, Detalhe do evento — nessa ordem, uma tela por
   vez.

## 7. Restrições

- Mudança **visual apenas**. Nenhuma alteração de rota, loader, action,
  permissão, RLS ou regra de negócio.
- `--brand-sidebar` e `--brand-header` são a marca do produto: valor
  fixo, nunca redefinido em `.dark`.
- Nenhum vermelho institucional novo. Nenhum segundo tom aproximado.
- Após cada etapa: `npm run lint`, `npm run build`, e os scripts de
  teste da área tocada.
- `git push` só com autorização explícita (regra 15).

## 8. Estado da suíte de testes em `e11fe7c`

Nove testes vermelhos pré-existentes, sem relação com UI, em
`test-expert-capabilities` (3), `test-provider-per-expert` (1) e
`test-experts-ia-hub` (5). Sete são asserts que descrevem um estado
antigo do produto; dois dependem de credencial real da API Anthropic.

Convém saber disso antes de começar: com a suíte já vermelha, uma
regressão nova passa despercebida.
