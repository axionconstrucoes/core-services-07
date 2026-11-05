# Fase 1 do ACC — registro de encerramento

> Registro de 04/11/2026. Não contém credenciais, dados de clientes nem caminhos pessoais. Valores e nomes de teste são fictícios.

## 1. O que foi publicado

| Item | Resultado |
|---|---|
| PR | #129, mesclado em `main` |
| SHA publicado | `751fe2f7e5a9613738fc8223efcd0fbf6a8c520a` (base anterior: `a83843d`) |
| Deploy | Vercel, projeto `axion-contract-intelligence-5d3g`, estado **Ready**, alias `acc.axion.com.br` |
| Migration | `20261104120000_legal_consultations_private`, **aplicada em produção** antes do deploy (única pendente; sem outra) |
| Checks do PR | Build, Guards (sem segredos, sem envio real), Typecheck/lint/testes e Vercel: aprovados |

Conteúdo: AXIA só por texto (voz na Fase 3), tema escuro e Dashboard compactado, abas administrativas só para Administrador, histórico privado das consultas ao Especialista Jurídico, correção dos checkboxes da Timeline, selos de status padronizados, caixa Editar projeto. Detalhe em `docs/manual-referencia-acc.md` (Anexo F).

## 2. Três checagens finais em produção (sessão autenticada, nada gravado)

| # | Checagem | Resultado |
|---|---|---|
| 1 | **Timeline:** marcar e desmarcar uma opção; desmarcar a última | **Aprovada.** A lista acompanhou a seleção; ao desmarcar todas, a tela exibiu todos os eventos, com o aviso "Nenhuma opção marcada — exibindo todas (sem filtro)", sem remarcar nenhuma caixa. |
| 2 | **Editar projeto:** legibilidade e saída por Cancelar | **Aprovada.** Texto preto sobre o cinza `#A8ADB5`: 9,3:1; sobre o branco dos campos: 21:1; Salvar branco sobre vinho: 10:1. Cancelar voltou ao Dashboard; Salvar não foi acionado. |
| 3 | **AXIA:** "O que significam os graus de risco?" | **Aprovada.** Resposta em texto (cartão branco, texto preto); link amarelo abre a Ajuda; controles de voz ocultos. |

## 3. Pendências identificadas (não bloqueiam o encerramento)

1. **Validação manual do Jurídico com duas contas reais** (autor e Administrador; acesso por ID direto) — **adiada** por decisão do responsável. Substituída por testes automatizados (banco local com duas contas do mesmo projeto, código real do app contra as políticas RLS) e leitura em produção (seção visível; ID inexistente = 404).
2. **Validação com conta sem privilégios administrativos** nas áreas restritas — só testes automatizados.
3. **Links que levam a Eventos viram 404 para não Administradores** (e-mails de alerta, Timeline) — decisão de produto pendente (Anexo F, F1 do manual).
4. `ACC_WEEKLY_REPORTS_ENABLED` em produção — **não confirmado** (variável sensível).
5. **PNG oficial da AXIA** — fora do histórico público até autorização específica; o candidato usa o ícone provisório.
6. **Propostas A e B de tipografia do Dashboard** — só em prévia local, aguardando escolha.
7. Divergências D1 (permissão de revisão do grau) e D2 (lote semanal × grau efetivo) — inalteradas.

## 4. Preservado

Travas do piloto (`ACC_OUTBOUND_MODE=pilot`; `ACC_PROJECT_PILOT_*` existentes; `ACC_EMAIL_ONLY_RECIPIENT` ausente), configurações de alertas, ícone provisório da AXIA, voz desligada (nenhuma variável `ELEVENLABS_*` em produção).

## 5. Próximo passo (Fase 2)

Q&A por aba: primeiro lote em `docs/qa-axia-lote-1.md` (Navegação, Riscos, Escalonamento, Especialistas), para aprovação antes de integrar à AXIA. Critério de aceite: a AXIA responde com base no manual e cita a seção correspondente; perguntas sem entrada aprovada continuam encaminhadas à Ajuda. A voz fica para a Fase 3.
