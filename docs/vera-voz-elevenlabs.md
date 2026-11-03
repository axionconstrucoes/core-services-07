# Voz da VERA com ElevenLabs

Estado: implementada e testada **somente com serviço simulado**. **Nenhuma chamada real à ElevenLabs foi feita** e a voz fica desligada até você configurar as variáveis abaixo. Esta página substitui o piloto de voz que havia sido preparado para o Azure (removido).

## Como funciona
- Resposta em texto sempre primeiro. "Ouvir resposta" (só após clique), "Parar" e seleção de voz continuam iguais.
- O servidor converte o texto da **base de conhecimento** (nunca texto vindo do navegador, nunca conteúdo de contrato) em áudio MP3 e devolve ao navegador. A chave nunca sai do servidor.
- Vozes: só as listadas em `ELEVENLABS_VOICE_IDS` (lista autorizada). A primeira (ou a indicada em `ELEVENLABS_DEFAULT_VOICE_ID`) é a padrão; nome e rótulos (feminina, português) são lidos da sua conta (consulta sem custo).
- Modelo padrão `eleven_flash_v2_5` (português, 0,5 a 1 crédito por caractere); alternativas aceitas: `eleven_turbo_v2_5` e `eleven_multilingual_v2` (1 crédito por caractere).
- Falha de qualquer tipo (sem configuração, chave recusada, créditos abaixo da reserva, serviço ocupado/fora, tempo esgotado): aviso claro e a resposta em texto permanece.

## Travas de custo (a assinatura e a cobrança não são alteradas por esta integração)
1. **Desligada por padrão**: só funciona com `ELEVENLABS_ENABLED=true` + `ELEVENLABS_API_KEY` + `ELEVENLABS_VOICE_IDS`.
2. **Reserva de créditos antes de cada leitura**: consulta a assinatura (somente leitura, não consome créditos) e recusa se `créditos restantes < caracteres da leitura + reserva` (`ELEVENLABS_CREDIT_RESERVE`, padrão 2000). Se a consulta falhar, recusa. Assim a leitura não empurra a conta para cobrança excedente.
3. Texto limitado a 900 caracteres por leitura (a maior leitura da base hoje tem 646; média ≈ 494).
4. 8 leituras por minuto por usuário (melhor esforço) e nenhuma retentativa automática.

## Custo estimado (preços públicos em elevenlabs.io/pricing; confirme na sua assinatura)
| Item | Valor |
|---|---|
| Consumo por leitura (Flash v2.5) | ≈ 250–650 créditos (0,5 a 1 crédito/caractere; média 494 caracteres) |
| Consumo por leitura (Multilingual v2) | ≈ 494 créditos em média (1/caractere), máx. 646 |
| Planos (créditos/mês) | Free 10 mil · Starter 30 mil · Creator 121 mil · Pro 600 mil · Scale 1,8 mi |
| Valor aproximado do crédito (preço do plano ÷ créditos) | Starter ≈ US$ 0,0002 · Creator ≈ US$ 0,00018 · Pro ≈ US$ 0,000165 |
| **Uma amostra curta (texto fictício de até 200 caracteres)** | **≤ 200 créditos** ≈ US$ 0,03–0,04 do saldo do plano; dentro dos créditos incluídos não há cobrança extra |
| Cobrança excedente | A página de preços não informa o valor por crédito excedente. Confira em *Assinatura* se o faturamento por uso (excedente) está desligado. A reserva acima impede que esta integração use além dos créditos incluídos. |

O plano da sua conta e os créditos disponíveis **não foram consultados** (nenhuma chamada foi feita). Para vê-los sem consumir nada, use o utilitário abaixo.

## Como configurar a chave com segurança (você faz; não cole a chave no chat)
1. Em https://elevenlabs.io/app/api crie (ou use) uma chave **com permissões mínimas**: *Text to Speech* (acesso), *Voices* (leitura) e *User* (leitura da assinatura). Se possível, defina um limite de créditos para a chave.
2. No seu terminal (na raiz do repositório), consulte a conta sem gastar créditos:
   `node scripts/elevenlabs-list-voices.mjs --confirmo-chamada-real --creditos`
   `node scripts/elevenlabs-list-voices.mjs --confirmo-chamada-real` (lista vozes femininas em português da sua conta)
   (a chave é lida de `ELEVENLABS_API_KEY` no seu terminal ou de `apps/web/.env.local`; nunca é impressa.)
3. Escolha as vozes (a primeira deve ser feminina pt-BR) e cadastre no **Vercel (Production, tipo sensível)**:
   `ELEVENLABS_ENABLED=true`, `ELEVENLABS_API_KEY=<sua chave>`, `ELEVENLABS_VOICE_IDS=<id1,id2,…>`; opcionais: `ELEVENLABS_DEFAULT_VOICE_ID`, `ELEVENLABS_MODEL_ID`, `ELEVENLABS_CREDIT_RESERVE`.
4. Nunca coloque a chave em arquivo versionado (`.env*` está ignorado pelo Git).
5. Primeira amostra real (só depois do seu aval): uma resposta curta da base de conhecimento ("Quem é a VERA"), ≤ 200 créditos; o áudio fica salvo para você ouvir.

## Testes
`scripts/test-vera-voice-elevenlabs.mjs` (28 verificações, serviço simulado, nenhuma rede): configuração fail-closed, lista autorizada, ordem créditos→síntese, reserva (limite exato), falhas HTTP/rede/timeout sem vazar a chave, modo simulado, rótulos de voz, ausência de chave em componente/rota/log e de qualquer segredo no repositório.
