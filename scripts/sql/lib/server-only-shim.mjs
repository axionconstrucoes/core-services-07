// Loader de teste: "server-only" é resolvido pelo bundler do Next.js e não existe como pacote instalável. Em scripts Node que
// importam módulos do servidor (apps/web/lib/**), ele vira um módulo vazio. Não altera nenhum outro especificador.
export async function resolve(specifier, context, nextResolve) {
  if (specifier === "server-only") return { url: "data:text/javascript,export {};", shortCircuit: true };
  return nextResolve(specifier, context);
}
