// Gera o Manual do Usuário do ACC (docs/manual/manual-usuario-acc.md) a partir da MESMA base por aba usada pela AXIA
// (apps/web/lib/assistant/abas). O manual anterior (docs/manual-referencia-acc.md) é PRESERVADO e não é tocado.
// Uso: node scripts/gerar-manual-usuario.mjs          (grava o arquivo)
//      node scripts/gerar-manual-usuario.mjs --check  (falha se o arquivo publicado divergir do gerado)
import { register } from "node:module";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

register("./ts-module-resolver.mjs", import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const MANUAL_PATH = path.join(root, "docs", "manual", "manual-usuario-acc.md");

const tipos = await import("../apps/web/lib/assistant/abas/tipos");
const { ITENS_CONHECIMENTO } = await import("../apps/web/lib/assistant/abas/index");
const { CAPITULOS, SITUACAO_ROTULO, ACESSO_ROTULO } = tipos;

const lista = (arr) => arr.map((x) => `- ${x}`).join("\n");
const num = (arr) => arr.map((x, i) => `${i + 1}. ${x}`).join("\n");

export function gerarManual() {
  const out = [];
  out.push("# Manual do Usuário do ACC — por aba");
  out.push("");
  out.push("> Arquivo GERADO por `scripts/gerar-manual-usuario.mjs` a partir da base por aba (`apps/web/lib/assistant/abas`), a mesma fonte da AXIA. Não edite à mão: altere a base e gere de novo. O teste `scripts/test-axia-manual-abas.mjs` falha se este arquivo divergir.");
  out.push("> O manual anterior, `docs/manual-referencia-acc.md`, foi PRESERVADO (referência técnica detalhada, com divergências registradas).");
  out.push("");
  out.push("## Como ler este manual");
  out.push("");
  out.push("- Este manual explica como USAR cada aba do ACC. Ele não faz análise contratual ou técnica: isso é dos Especialistas de IA (Experts IA), sempre com revisão humana.");
  out.push("- A AXIA é a assistente de uso do ACC e responde com esta mesma base. Ela não lê dados da obra, não altera nada e não analisa contratos.");
  out.push("- Cada aba traz: finalidade, funcionalidades, informações exibidas, passo a passo, regras e status, permissões, integrações, perguntas e respostas, limitações e diferenças entre perfis.");
  out.push("- Prazos padrão (SLA) aprovados: CRÍTICO 1 hora corrida; ALTO 4 horas úteis; MÉDIO 2 dias úteis; BAIXO 5 dias úteis.");
  out.push("- A barra lateral mostra ícone e texto sempre visíveis, sem texto ao passar o mouse.");
  out.push("");
  out.push("### Situação de cada aba");
  out.push("");
  out.push(lista(Object.entries(SITUACAO_ROTULO).map(([k, v]) => `**${v}** (${k})`)));
  out.push("");
  out.push("Nenhuma aba está HOMOLOGADA para todos os perfis em 22/11/2026. As situações vêm de `docs/homologacao-autenticada-roteiro.md` e da decisão da Fase 2 sobre as abas bloqueadas.");
  out.push("");
  out.push("### Índice de abas e rotas");
  out.push("");
  out.push("| Aba | Rota | Situação |");
  out.push("|---|---|---|");
  for (const it of ITENS_CONHECIMENTO) out.push(`| ${it.nome} | ${it.rota ? "`" + it.rota + "`" : "—"} | ${SITUACAO_ROTULO[it.situacao]} |`);
  out.push("");
  for (const cap of CAPITULOS) {
    const itens = ITENS_CONHECIMENTO.filter((i) => i.capitulo === cap.id);
    if (itens.length === 0) continue;
    out.push(`## ${cap.numero}. ${cap.titulo}`);
    out.push("");
    out.push(cap.introducao);
    out.push("");
    for (const it of itens) {
      const pai = it.pai ? ITENS_CONHECIMENTO.find((p) => p.id === it.pai) : undefined;
      out.push(`### ${cap.numero}.${itens.indexOf(it) + 1} ${it.nome}`);
      out.push("");
      out.push(`- **Tipo:** ${it.tipo}${pai ? ` (dentro de ${pai.nome})` : ""}`);
      if (it.rota) out.push(`- **Rota:** \`${it.rota}\`${it.rotasRelacionadas?.length ? ` · relacionadas: ${it.rotasRelacionadas.map((r) => "`" + r + "`").join(", ")}` : ""}`);
      out.push(`- **Situação:** ${SITUACAO_ROTULO[it.situacao]} — ${it.evidenciaSituacao}`);
      out.push(`- **Quem vê:** ${ACESSO_ROTULO[it.acessoMenu]}`);
      out.push("");
      out.push(`**1. Nome e finalidade.** ${it.nome}: ${it.finalidade}`);
      out.push("");
      out.push("**2. Funcionalidades**");
      out.push(lista(it.funcionalidades));
      out.push("");
      out.push("**3. Informações e indicadores exibidos**");
      out.push(lista(it.indicadores));
      out.push("");
      out.push("**4. Passo a passo**");
      out.push(num(it.passoAPasso));
      out.push("");
      out.push("**5. Regras e significados de status**");
      out.push(lista(it.regrasEStatus));
      if (it.mensagens?.length) out.push("\nMensagens que aparecem na tela:\n" + lista(it.mensagens.map((m) => `“${m}”`)));
      out.push("");
      out.push(`**6. Permissões.** ${it.permissoes}`);
      out.push("");
      out.push("**7. Integração com outros módulos**");
      out.push(lista(it.integracoes));
      out.push("");
      out.push("**8. Exemplos de perguntas e respostas (as mesmas que a AXIA dá)**");
      for (const p of it.perguntas) out.push(`- **P:** ${p.pergunta}\n  **R:** ${p.resposta}`);
      out.push("");
      out.push("**9. Limitações e o que não está homologado**");
      out.push(lista(it.limitacoes));
      out.push("");
      out.push("**10. Diferenças entre perfis**");
      out.push(`- Administrador: ${it.perfis.administrador}`);
      out.push(`- Gerente (Gestor): ${it.perfis.gestor}`);
      out.push(`- Colaborador: ${it.perfis.colaborador}`);
      out.push(`- Leitura: ${it.perfis.leitura}`);
      out.push("");
      out.push("**Capturas de tela:** " + it.capturas.map((c) => (c.arquivo ? `\`${c.arquivo}\` — ${c.descricao}` : c.descricao)).join("; "));
      out.push("");
      out.push("**Fontes:** " + it.fontes.map((f) => "`" + f + "`").join(", "));
      out.push("");
    }
  }
  return out.join("\n").replace(/\r\n/g, "\n").replace(/\n{3,}/g, "\n\n").trimEnd() + "\n";
}

const principal = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (principal) {
  const texto = gerarManual();
  if (process.argv.includes("--check")) {
    const atual = existsSync(MANUAL_PATH) ? readFileSync(MANUAL_PATH, "utf8").replace(/\r\n/g, "\n") : "";
    if (atual !== texto) { console.error("O manual publicado diverge da base por aba. Rode: node scripts/gerar-manual-usuario.mjs"); process.exit(1); }
    console.log("Manual em dia com a base por aba.");
  } else {
    mkdirSync(path.dirname(MANUAL_PATH), { recursive: true });
    writeFileSync(MANUAL_PATH, texto, "utf8");
    console.log(`Manual gerado: ${path.relative(root, MANUAL_PATH)} (${texto.length} caracteres)`);
  }
}
