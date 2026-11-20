// Chave de habilitação do ESPECIALISTA por e-mail (módulo mínimo: sem dependências, para não criar ciclo de importação).
/**
 * ACC_EMAIL_SPECIALIST_ENABLED=true (valor exato; falha fechada = desligado). Ligado: o e-mail ganha o atalho ESPECIALISTA e o
 * worker aceita "ESPECIALISTA: <pergunta>" (grava em email_specialist_consultations, responde com o Expert da área e consome o
 * limite diário de IA). Padrão DESLIGADO até a migration 20261121170000 estar aplicada e a homologação concluída.
 */
export const SPECIALIST_EMAIL_ENABLED_ENV = "ACC_EMAIL_SPECIALIST_ENABLED";
export function isSpecialistEmailEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return env[SPECIALIST_EMAIL_ENABLED_ENV] === "true";
}
