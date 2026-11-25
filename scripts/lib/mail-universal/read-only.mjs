// Fase 5/A — o leitor NUNCA escreve na caixa. O transporte entregue ao leitor é embrulhado num Proxy que só expõe os
// métodos de LEITURA listados; qualquer outro (enviar, modificar, apagar, mover, marcar como lida) lança erro e é registrado.
export const GMAIL_READ_METHODS = Object.freeze(["listMessages", "getMessage", "getAttachment"]);
export const GRAPH_READ_METHODS = Object.freeze(["delta", "getMessage", "listAttachments"]);

export function readOnlyTransport(transport, allowed) {
  const violations = [];
  return new Proxy({}, {
    get(_target, prop) {
      if (prop === "violations") return violations;
      if (typeof prop !== "string") return undefined;
      if (!allowed.includes(prop)) {
        return () => {
          violations.push(prop);
          throw new Error(`READ_ONLY_VIOLATION: o leitor tentou "${prop}" (somente ${allowed.join(", ")})`);
        };
      }
      const fn = transport[prop];
      if (typeof fn !== "function") throw new Error(`TRANSPORT_INCOMPLETE: falta ${prop}`);
      return fn.bind(transport);
    },
  });
}
