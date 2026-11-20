import { LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { logout } from "@/lib/auth-actions";

export function LogoutButton() {
  return (
    // help-exempt: ação de sair da sessão, autoexplicativa e sem parâmetros (aria-label Sair)
    <form action={logout}>
      <Button type="submit" variant="ghost" size="icon" title="Sair" aria-label="Sair">
        <LogOut className="size-4" />
      </Button>
    </form>
  );
}
