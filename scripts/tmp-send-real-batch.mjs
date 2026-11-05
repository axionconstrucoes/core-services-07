import { register } from "node:module";

register("./ts-module-resolver.mjs", import.meta.url);

const { createAndSendContractAlertBatch } =
  await import("../apps/web/lib/email/create-and-send-contract-alert-batch");

function required(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Variável obrigatória ausente: ${name}`);
  return value;
}

if (required("AXION_EMAIL_PROVIDER").toLowerCase() !== "gmail") {
  throw new Error("BLOQUEADO: AXION_EMAIL_PROVIDER precisa ser gmail.");
}

if (required("ACC_PILOT_RECIPIENT").toLowerCase() !== "reynaldo@axion.com.br") {
  throw new Error("BLOQUEADO: ACC_PILOT_RECIPIENT precisa ser reynaldo@axion.com.br.");
}

if (required("GOOGLE_GMAIL_SENDER_EMAIL").toLowerCase() !== "crm@axion.com.br") {
  throw new Error("BLOQUEADO: remetente Gmail precisa ser crm@axion.com.br.");
}

const result = await createAndSendContractAlertBatch({
  projectId: "00000000-0000-4000-8000-000000000001",
  recipientUserId: "c7bfe367-bac6-4263-8dd1-2b8b561e8cec",
  deliveryEmail: "crm@axion.com.br",
  items: [
    {
      eventId: "2da5834f-3623-4355-81f4-db102ac1e8bb",
      title: "[TESTE FINAL 2] Validação ENVIADO P/",
      severity: "MEDIA",
      riskDescription:
        "Teste controlado do botão ENVIADO P/ após implantação do PR #106.",
      clauseLabel: null,
      clauseText: null,
      evidence: [
        "Teste exclusivo do fluxo ENVIADO P/."
      ],
      eventUrl:
        "https://acc.axion.com.br/00000000-0000-4000-8000-000000000001/ledger/2da5834f-3623-4355-81f4-db102ac1e8bb"
    }
  ]
});

console.log("");
console.log("ENVIO REAL CONCLUÍDO");
console.log(JSON.stringify(result, null, 2));
