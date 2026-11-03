# AXIA — Assistente ACC (piloto): texto + voz

> Atualizado: ver `docs/vera-autorizacao-email-e-voz.md` (nome definitivo, autorização de e-mails, e-mails e configuração da voz).

Estado: implementada em branch local, **não publicada**. A voz real **não foi testada**: não há recurso ElevenLabs Speech configurado.

## O que é
- "Fale com a AXIA" (foto circular + texto) no topo das telas da obra; abre a caixa de conversa (antes: botão flutuante "Ajuda ACC").
- Responde perguntas de **uso do ACC** em texto, com passos, link para o módulo e referência ao slide do tutorial; sempre oferece o link para "Ajuda e tutorial".
- **Só orienta**: não grava nada, não consulta dados de contratos nem de obras. Pedidos para alterar dados recebem o aviso de que ela só orienta.
- Exige login e participação na obra (mesma checagem do tutorial); quem não participa recebe 404.

## Como responde (infraestrutura de IA)
- Modo `AXION_AI_PROVIDER_ASSISTENTE` (padrão `fake`): base de conhecimento curada (`lib/assistant/knowledge.ts`), derivada do tutorial, sem rede e **sem custo**.
- Segue a convenção de providers do ACC: fail closed, nunca cai em silêncio para outro modo. `anthropic` ainda **não** está ligado à assistente (exigiria decisão de custo e novo contrato de resposta); qualquer valor diferente de `fake` falha com mensagem clara.

## Voz

A voz agora usa ElevenLabs — ver `docs/vera-voz-elevenlabs.md`. O piloto do ElevenLabs foi removido.
