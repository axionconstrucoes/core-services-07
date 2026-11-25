// Substituto de "next/link" apenas na fixture de navegador (o componente real exige o runtime do Next).
import type { AnchorHTMLAttributes, ReactNode } from "react";
export default function Link({ href, children, prefetch: _prefetch, ...rest }: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string; prefetch?: boolean; children?: ReactNode }) {
  return <a href={"#" + href} {...rest}>{children}</a>;
}
