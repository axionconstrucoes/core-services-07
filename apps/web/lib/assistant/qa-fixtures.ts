// Entradas FICTÍCIAS para validar cobertura, citação do manual e encaminhamento ao ADMIN. Só entram na AXIA quando
// qaFixturesEnabled() (ambiente local de teste). Não contêm conteúdo do lote real do Q&A, que aguarda aprovação por ID.

import type { AssistantEntry } from "./knowledge";

export const QA_FIXTURE_ENTRIES: AssistantEntry[] = [
  {
    id: "qa-teste-completa",
    title: "[TESTE] Carimbo azul fictício",
    keywords: ["carimbo azul", "selo ficticio azul", "carimbo ficticio"],
    summary: "Resposta COMPLETA de teste: o carimbo azul fictício indica que o item foi conferido. Dado inventado só para validação.",
    steps: ["Abra a tela fictícia de teste.", "Procure o carimbo azul."],
    links: [{ label: "Ajuda e tutorial", path: "ajuda" }],
    tutorialSlide: null,
    manualSection: "99.1 (fictícia)",
    coverage: "completa",
  },
  {
    id: "qa-teste-parcial",
    title: "[TESTE] Prazo fictício de conferência",
    keywords: ["prazo ficticio", "conferencia ficticia", "prazo de conferencia ficticio"],
    summary:
      "Resposta PARCIAL de teste: o prazo fictício de conferência é de 3 dias, mas o caso da obra pode ter regra própria que esta resposta não cobre.",
    steps: [],
    links: [],
    tutorialSlide: null,
    manualSection: "99.2 (fictícia)",
    coverage: "parcial",
  },
];
