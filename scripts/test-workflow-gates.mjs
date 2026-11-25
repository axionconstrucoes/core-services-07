// Gates de workflows decididos pelo responsavel: passos novos de efeito operacional ficam DESLIGADOS por padrao.
// - gmail-delegated-sync: o passo "Anexos da caixa por delegacao" so roda com a variavel de repositorio
//   ACC_DELEGATED_ATTACHMENTS_ENABLED == 'true' (e nunca no teste tecnico). Sem a variavel (padrao), nao roda.
// Teste estatico (sem rede, sem segredos): le o YAML e confere a condicao do passo.
import { readFileSync } from "node:fs";

let passed = 0, failed = 0;
const check = (name, fn) => { try { fn(); console.log(`OK   ${name}`); passed += 1; } catch (e) { console.log(`FAIL ${name}\n     ${e.message}`); failed += 1; } };
const assert = (c, m) => { if (!c) throw new Error(m); };
const wf = readFileSync(new URL("../.github/workflows/gmail-delegated-sync.yml", import.meta.url), "utf8").replace(/\r\n/g, "\n");

function stepBlock(name) {
  const i = wf.indexOf(`- name: ${name}`);
  assert(i >= 0, `passo "${name}" nao encontrado`);
  const rest = wf.slice(i + 1);
  const next = rest.search(/\n      - name: /);
  return wf.slice(i, next < 0 ? undefined : i + 1 + next);
}

check("passo de anexos por delegacao so roda com ACC_DELEGATED_ATTACHMENTS_ENABLED == 'true'", () => {
  const b = stepBlock("Anexos da caixa por delegação");
  assert(/if:\s*\$\{\{[^}]*vars\.ACC_DELEGATED_ATTACHMENTS_ENABLED\s*==\s*'true'[^}]*\}\}/.test(b), "condicao do passo nao exige a variavel ligada");
});
check("o passo continua fora do teste tecnico (technical_check)", () => {
  assert(/inputs\.mode\s*!=\s*'technical_check'/.test(stepBlock("Anexos da caixa por delegação")), "perdeu a exclusao do teste tecnico");
});
check("a variavel nao tem valor padrao ligado no workflow (nenhum `|| 'true'`)", () => {
  assert(!/ACC_DELEGATED_ATTACHMENTS_ENABLED\s*\|\|\s*'true'/.test(wf), "padrao ligado encontrado");
});
check("o passo do worker usa o modo de delegacao opt-in (nao o histórico)", () => {
  assert(/ACC_GMAIL_AUTH_MODE:\s*DOMAIN_DELEGATION/.test(stepBlock("Anexos da caixa por delegação")), "modo de delegacao nao declarado no passo");
});
console.log(`\nRESULTADO: ${passed} passaram, ${failed} falharam`);
process.exit(failed ? 1 : 0);
