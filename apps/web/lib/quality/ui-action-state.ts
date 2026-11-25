// Estado devolvido pelas Server Actions da Qualidade (useActionState). Arquivo sem "use server": pode exportar valores.

export interface QualityActionState {
  ok: boolean;
  message: string | null;
  error: string | null;
  /** código estável do erro (VERSION_CONFLICT, FORBIDDEN, TRANSITION_BLOCKED…) */
  code: string | null;
  /** true quando outra pessoa alterou o registro: a tela exige recarregar antes de tentar de novo. */
  conflict: boolean;
  /** muda a cada sucesso; usado como `key` do formulário para limpá-lo. */
  nonce: string | null;
  entityId: string | null;
}

export const initialQualityActionState: QualityActionState = {
  ok: false,
  message: null,
  error: null,
  code: null,
  conflict: false,
  nonce: null,
  entityId: null,
};
