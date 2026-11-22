// Base de conhecimento POR ABA do ACC: fonte única (itens) usada pela AXIA e pelo Manual do Usuário.
import { ITENS_ADMIN } from "./conteudo-admin";
import { ITENS_GERAL } from "./conteudo-geral";
import { ITENS_MODULOS } from "./conteudo-modulos";
import type { ItemConhecimento } from "./tipos";

export * from "./tipos";
export const ITENS_CONHECIMENTO: ItemConhecimento[] = [...ITENS_GERAL, ...ITENS_MODULOS, ...ITENS_ADMIN];
