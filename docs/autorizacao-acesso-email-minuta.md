# Minuta — Solicitação individual de autorização de acesso ao e-mail corporativo

Versão do texto: **v1** (registrada junto com cada solicitação; qualquer mudança de texto gera nova versão).
Status: MINUTA. Nenhum envio foi feito. Revisão jurídica/DPO recomendada antes do primeiro envio real.

Uso: um e-mail por colaborador, enviado individualmente (nunca em cópia para outras pessoas). Campos entre `{{ }}` são preenchidos pelo sistema.

---

**Assunto:** Solicitação de autorização — acesso à sua caixa de e-mail corporativa (ACC) [v1]

Olá, {{nome}},

A Axion Engenharia pede a sua autorização individual para que o sistema ACC (Axion Contract Intelligence) leia mensagens da sua caixa de e-mail corporativa. A resposta é voluntária e você pode recusar ou revogar a qualquer momento.

**Finalidade.** {{finalidade}} (ex.: identificar nos e-mails da obra comunicações contratuais relevantes — prazos, pedidos de aditivo, notificações — e manter a rastreabilidade até a mensagem original). As mensagens não serão usadas para avaliar desempenho individual nem para outra finalidade sem nova solicitação.

**Dados acessados.** Mensagens da caixa {{caixa}}: remetente, destinatários, data, assunto, corpo e anexos. O sistema só deve guardar o que for pertinente à finalidade acima, com referência à mensagem original. O acesso é somente leitura: o sistema não envia, apaga nem altera mensagens.

**Abrangência.** {{abrangencia}} (ex.: caixa de entrada e pastas/marcadores indicados; mensagens marcadas como pessoais ou fora do escopo da obra não devem ser guardadas). Atenção: tecnicamente a permissão do Google permite leitura ampla da caixa; a restrição ao escopo é feita pelos filtros do ACC, e não pelo Google.

**Duração.** {{duracao_dias}} dias a partir do registro da sua resposta. Depois disso o acesso deixa de valer e uma nova autorização será necessária.

**Como revogar.** A qualquer momento, responda a qualquer e-mail do ACC ou escreva para {{contato}} dizendo "Revogo a autorização", e/ou remova o acesso do ACC em https://myaccount.google.com/permissions. Após a revogação o sistema não faz novas leituras. Dados já registrados permanecem como evidência histórica, conforme a política de retenção da empresa, e você pode pedir informações sobre eles ao contato acima.

**Base legal (LGPD).** Esta solicitação se apoia no seu consentimento, para a finalidade descrita. Você pode exercer seus direitos de titular (acesso, correção, informação, revogação) pelo contato {{contato}}.

**Como responder.** Responda a ESTE e-mail, a partir do seu endereço corporativo, escrevendo apenas uma das frases abaixo no início da resposta:

- `Autorizo`
- `Não autorizo`

Respostas com condições, dúvidas ou texto diferente serão tratadas como pendentes e revisadas por uma pessoa; elas **não** valem como autorização. Respostas enviadas por outro endereço também não valem. A solicitação vale por {{prazo_resposta_dias}} dias; sem resposta nesse prazo ela expira e nada é acessado.

**Importante — o seu "Autorizo" por e-mail não libera, sozinho, o acesso técnico.** Ele apenas registra o seu consentimento. A leitura da caixa só começa depois que a conexão técnica (autorização Google Workspace/OAuth) for feita pelo administrador do Workspace ou por você mesmo, e só enquanto o consentimento estiver registrado, dentro da duração e não revogado.

Atenciosamente,
{{remetente}} — Axion Engenharia

---

## Notas internas (não vão no e-mail)

- O Message-ID da solicitação enviada deve ser guardado (`request_message_id`); é por ele (In-Reply-To/References) e pelo remetente igual ao colaborador que a resposta é vinculada. Resposta de outro remetente ou sem referência não vale.
- O texto não promete: exclusão automática de dados já coletados, filtragem perfeita de mensagens pessoais, nem acesso por pasta imposto pelo Google. Se isso for implementado, atualizar o texto (nova versão).
- Valores padrão do código: validade da solicitação 15 dias, duração do acesso 90 dias.
