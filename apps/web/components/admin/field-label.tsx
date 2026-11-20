import type { ReactNode } from "react";
import { FeatureInfo } from "@/components/shared/feature-info";
import { cn } from "@/lib/utils";

// Rótulo de campo com o ícone de ajuda (Hover Text) AO LADO — nunca dentro do <label>, porque um <button> dentro de <label>
// é HTML inválido (elemento rotulável aninhado). O controle associado deve receber o mesmo `htmlFor` como `id`.
// Usado pelas telas administrativas (projetos, usuários, autorizações). O texto explicativo vem do catálogo (helpId).
export function FieldLabel({
  htmlFor,
  helpId,
  children,
  className,
  iconClassName,
}: {
  htmlFor: string;
  helpId: string;
  children: ReactNode;
  className?: string;
  /** Cor do ícone quando o fundo do formulário é claro (o padrão é para o tema escuro). */
  iconClassName?: string;
}) {
  return (
    <span className={cn("flex items-center gap-1.5 text-sm font-medium", className)}>
      <label htmlFor={htmlFor}>{children}</label>
      <FeatureInfo helpId={helpId} iconClassName={iconClassName} />
    </span>
  );
}
