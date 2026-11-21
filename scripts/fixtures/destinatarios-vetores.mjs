// Vetores compartilhados (teste puro e teste em Postgres real) de e-mails válidos/inválidos para a paridade TS x SQL.
export const VALID = ["a@axion.com.br", "Nome.Sobrenome+tag@Axion.Com.Br", "  x_y@cliente.com  ", "a-b@sub.dominio.co", "u@d.com.br"];
export const INVALID = [
  "", "   ", null, undefined, 42, "sem-arroba", "a@", "@b.com", "a@b", "a@b.c", "a b@c.com", "a@b..com", ".a@b.com", "a.@b.com", "a..b@b.com",
  "a@-b.com", "a@b-.com", "a@b.c0m", "a@b.com.", "<a@b.com>", '"a"@b.com', "a@b.com,c@d.com", "a@b.com;c@d.com", "a@b.com c@d.com",
  "a@b.com\r\nBcc: x@y.com", "a@b.com\nSubject: x", "a@b.com\u0000", "a@b.com ", "a@example.com", "a@x.invalid", "a@x.test", "a@x.localhost", "a@x.local",
  "a@[127.0.0.1]", "a@1.2.3.4", `${"a".repeat(65)}@b.com`, `a@${"b".repeat(64)}.com`, `a@${"b".repeat(250)}.com`, "a@b.c" + "o".repeat(30),
];

