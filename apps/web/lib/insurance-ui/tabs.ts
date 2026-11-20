// Abas do módulo Seguros (dado puro; cada aba declara o helpId literal do Hover Text).
export const SEGUROS_TABS = [
  { id: "painel", label: "Painel", helpId: "seguros.abas.painel" },
  { id: "apolices", label: "Apólices", helpId: "seguros.abas.apolices" },
  { id: "garantias", label: "Fianças e garantias", helpId: "seguros.abas.garantias" },
  { id: "endossos", label: "Endossos", helpId: "seguros.abas.endossos" },
  { id: "adiantamentos", label: "Adiantamentos", helpId: "seguros.abas.adiantamentos" },
  { id: "sinistros", label: "Sinistros e eventos", helpId: "seguros.abas.sinistros" },
  { id: "dossies", label: "Dossiês", helpId: "seguros.abas.dossies" },
  { id: "minutas", label: "Minutas e acionamento", helpId: "seguros.abas.minutas" },
  { id: "canais", label: "Canais oficiais", helpId: "seguros.abas.canais" },
  { id: "sujeitos", label: "Sujeitos e RCC", helpId: "seguros.abas.sujeitos" },
  { id: "referencias", label: "Referências", helpId: "seguros.abas.referencias" },
  { id: "auditoria", label: "Auditoria", helpId: "seguros.abas.auditoria" },
] as const;
export type SegurosTabId = (typeof SEGUROS_TABS)[number]["id"];
