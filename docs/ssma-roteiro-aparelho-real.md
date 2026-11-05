# Roteiro curto — app de campo SSMA em iPhone/Safari e Android/Chrome

**Estado: PENDENTE.** Nenhum aparelho real foi usado até aqui; o item só passa a "comprovado" quando este roteiro for executado e os resultados registrados no final. Tempo: ~15 min por aparelho. Use a obra **TESTE**; todo registro deve começar com **[TESTE REMOTO]** na descrição.

Pré-requisito: conta com perfil Colaborador (ou superior) na obra TESTE; internet disponível para o passo 1.

## A. Instalar e abrir (com internet)
1. **iPhone:** Safari → `https://acc.axion.com.br/ssma` → Compartilhar → **Adicionar à Tela de Início**. **Android:** Chrome → mesmo endereço → menu ⋮ → **Instalar app**. (Ou escanear o QR Code mostrado em Ações → app de campo.)
2. Abrir pelo ícone, entrar com a conta, escolher a obra **TESTE**. ✅ Abre o início do app, sem erro.
3. Abrir **Registros** uma vez (guarda a casca e o contexto da obra no aparelho).

## B. Registro com foto da câmera
4. **Novo registro** → tipo Ocorrência → categoria → descrição `[TESTE REMOTO] câmera <aparelho>` → local → risco **Baixo**.
5. **Tirar foto** (câmera real). ✅ A prévia aparece. Salvar.
6. ✅ Com internet: o registro vira **Sincronizado** e a foto **Sincronizada** em até ~30 s (tela Registros ou Envios).

## C. Modo avião e reconexão
7. Ativar **modo avião**. ✅ Aparece o aviso de "sem conexão".
8. Novo registro `[TESTE REMOTO] modo avião <aparelho>` com **2 fotos** (câmera + galeria). Salvar.
9. ✅ O registro fica **Salvo no aparelho** e as fotos **Pendente no aparelho** (Registros e Envios). Fechar o app por completo e reabrir **ainda em modo avião**: ✅ o registro continua lá (IndexedDB). *(Se o app não abrir sem rede, anotar: a casca offline é um limite conhecido.)*
10. Desativar o modo avião. ✅ Em até ~30 s: **Enviando → Sincronizada** nas duas fotos e **Sincronizado** no registro. Se não enviar sozinho, tocar **Enviar agora / tentar de novo** e anotar.
11. Tocar **Enviar agora** de novo. ✅ Nada duplica.

## D. Queda no meio e fotos grandes
12. Criar registro com **5 fotos**; assim que tocar Salvar, ativar o modo avião por ~20 s e desativar. ✅ Termina sem duplicar; nenhuma foto fica "Falha".
13. *(Opcional)* 1 foto de ~10 MB em rede móvel. ✅ Sincroniza ou mostra falha clara com nova tentativa.

## E. Conferir no ACC (outro aparelho/computador)
14. Em `acc.axion.com.br` → obra TESTE → ESG/SSMA → **Registros de campo**. ✅ Os registros `[TESTE REMOTO …]` aparecem com a contagem de fotos correta; abrir e ver as fotos.

## F. Registro CRÍTICO (só com a notificação ligada em circuito fechado)
15. Registro com risco **Crítico**. ✅ O aviso "Aviso de registro crítico: enviado…" (ou o motivo da falha / "sem destinatário") aparece no registro; no modo piloto o e-mail chega **somente** à caixa do piloto com `[TESTE CONTROLADO]`.

## Resultado (preencher)
| Aparelho / SO / navegador | Data | Passos OK | Passos com problema (número + o que ocorreu) | Executado por |
|---|---|---|---|---|
| | | | | |

Enquanto esta tabela estiver vazia, "iPhone/Safari" e "Android/Chrome" permanecem **PENDENTES**.
