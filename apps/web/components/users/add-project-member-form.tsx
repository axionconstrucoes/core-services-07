"use client";

// Formulário "Adicionar usuário" (Usuários & Permissões). Só renderizado
// pelo servidor quando permission === "ADMINISTRADOR" (ver page.tsx) —
// mesmo assim, toda escrita ainda passa pela RPC oficial, que revalida
// a autorização no servidor de forma independente da UI.
//
// Quando a busca por e-mail não encontra profile (ninguém logou ainda),
// oferece o pré-cadastro (pre_register_project_member). O acesso só é
// ativado quando a pessoa entra no ACC pela primeira vez com o mesmo
// e-mail corporativo.

import { useActionState, useState } from "react";
import { Avatar } from "@/components/ui/avatar";
import { FieldLabel } from "@/components/admin/field-label";
import { FeatureInfo } from "@/components/shared/feature-info";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import {
  addProjectMemberAction,
  preRegisterProjectMemberAction,
  searchProfileForMembershipAction,
} from "@/app/[projectId]/usuarios/actions";
import {
  initialAddProjectMemberState,
  initialPreRegisterMemberState,
  initialSearchProfileState,
  type FoundProfile,
} from "@/app/[projectId]/usuarios/actions-state";
import { permissionLabels, membershipAreaLabels } from "@/lib/labels";

// GERENTE, não GESTOR: toda inclusão nova usa o nome atual do papel
// (mesma autorização de GESTOR — ver ProjectPermission em @axion/types).
// Membros existentes com GESTOR continuam intocados; ver ALL_PERMISSIONS
// em member-row-actions.tsx para a edição de membro já existente.
const NEW_MEMBER_PERMISSIONS = ["ADMINISTRADOR", "GERENTE", "COLABORADOR"] as const;
const AREAS = [
  "DIRETORIA",
  "ADMINISTRATIVO",
  "COMERCIAL",
  "FINANCEIRO",
  "ENGENHARIA",
  "ORÇAMENTO",
  "JURÍDICO",
  "PLANEJAMENTO",
  "COMPRAS",
  "SSMA/ESG",
] as const;

export function AddProjectMemberForm({
  projectId,
  projectLabel,
  onCancel,
  onSuccess,
}: {
  projectId: string;
  projectLabel: string;
  onCancel: () => void;
  onSuccess: () => void;
}) {
  const [searchState, searchAction, searchPending] = useActionState(
    searchProfileForMembershipAction,
    initialSearchProfileState
  );
  const [addState, addAction, addPending] = useActionState(addProjectMemberAction, initialAddProjectMemberState);
  const [preRegisterState, preRegisterAction, preRegisterPending] = useActionState(
    preRegisterProjectMemberAction,
    initialPreRegisterMemberState
  );
  const [selected, setSelected] = useState<FoundProfile | null>(null);

  if (addState.success) {
    return (
      <Card>
        <CardContent className="pt-6">
          <p className="text-sm">Usuário adicionado com sucesso.</p>
          <Button type="button" size="sm" className="mt-3" onClick={onSuccess}>
            Fechar
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (preRegisterState.success) {
    return (
      <Card>
        <CardContent className="pt-6">
          <p className="text-sm">
            Pré-cadastro criado. O usuário aparecerá como &quot;Aguardando primeiro login&quot; até entrar no ACC pela primeira vez.
          </p>
          <Button type="button" size="sm" className="mt-3" onClick={onSuccess}>
            Fechar
          </Button>
        </CardContent>
      </Card>
    );
  }

  const candidate = searchState.result && !searchState.result.alreadyMember ? searchState.result : null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Adicionar usuário</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <form action={searchAction} className="flex flex-col gap-2">
          <input type="hidden" name="projectId" value={projectId} />
          <div className="flex flex-col gap-1.5">
            <FieldLabel htmlFor="add-member-query" helpId="admin.usuarios.busca-email">Buscar por e-mail @axion.com.br</FieldLabel>
            <div className="flex gap-2">
              <Input id="add-member-query" name="query" type="email" required placeholder="nome@axion.com.br" defaultValue={searchState.searchedEmail ?? ""} />
              <Button type="submit" size="sm" variant="outline" disabled={searchPending}>
                {searchPending ? "Buscando…" : "Buscar"}
              </Button>
            </div>
          </div>
          {searchState.error ? <p className="text-sm text-destructive">{searchState.error}</p> : null}
        </form>

        {candidate ? (
          // help-exempt: formulário de inclusão; Permissão e Área têm ícone próprio e Confirmar também (admin.usuarios.confirmar-adicao)
          <form
            action={(formData) => {
              setSelected(candidate);
              addAction(formData);
            }}
            className="flex flex-col gap-3 rounded-md border p-3"
          >
            <input type="hidden" name="projectId" value={projectId} />
            <input type="hidden" name="userId" value={candidate.id} />

            <div className="flex items-center gap-2">
              <Avatar>{candidate.avatarInitials}</Avatar>
              <div>
                <p className="text-sm font-medium">{candidate.name}</p>
                <p className="text-xs text-muted-foreground">{searchState.searchedEmail}</p>
              </div>
            </div>

            <p className="text-xs text-muted-foreground">Projeto atual: {projectLabel}</p>

            <div className="grid gap-3 md:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <FieldLabel htmlFor="add-member-permission" helpId="admin.usuarios.permissao-novo">Permissão</FieldLabel>
                <Select id="add-member-permission" name="permission" defaultValue="COLABORADOR" required>
                  {NEW_MEMBER_PERMISSIONS.map((permission) => (
                    <option key={permission} value={permission}>
                      {permissionLabels[permission]}
                    </option>
                  ))}
                </Select>
              </div>

              <div className="flex flex-col gap-1.5">
                <FieldLabel htmlFor="add-member-area" helpId="admin.usuarios.area-novo">Área</FieldLabel>
                <Select id="add-member-area" name="area" defaultValue="" required>
                  <option value="" disabled>
                    Selecione…
                  </option>
                  {AREAS.map((area) => (
                    <option key={area} value={area}>
                      {membershipAreaLabels[area]}
                    </option>
                  ))}
                </Select>
              </div>
            </div>

            {addState.error && selected?.id === candidate.id ? (
              <p className="text-sm text-destructive">{addState.error}</p>
            ) : null}

            <div className="flex gap-2">
              <span className="inline-flex items-center gap-1">
                <Button type="submit" size="sm" disabled={addPending}>
                  {addPending ? "Confirmando…" : "Confirmar"}
                </Button>
                <FeatureInfo helpId="admin.usuarios.confirmar-adicao" />
              </span>
              <Button type="button" size="sm" variant="ghost" onClick={onCancel}>
                Cancelar
              </Button>
            </div>
          </form>
        ) : null}

        {searchState.notFound ? (
          <form action={preRegisterAction} className="flex flex-col gap-3 rounded-md border p-3">
            <input type="hidden" name="projectId" value={projectId} />
            <input type="hidden" name="email" value={searchState.searchedEmail ?? ""} />

            <p className="flex items-center gap-1.5 text-sm font-medium">
              Pré-cadastrar {searchState.searchedEmail}
              <FeatureInfo helpId="admin.usuarios.pre-cadastro" />
            </p>
            <p className="text-xs text-muted-foreground">
              Este e-mail ainda não fez login no ACC. Ele fica &quot;Aguardando primeiro login&quot; e só ganha acesso de fato quando
              entrar pela primeira vez com essa conta Google.
            </p>
            <p className="text-xs text-muted-foreground">Projeto atual: {projectLabel}</p>

            <div className="flex flex-col gap-1.5">
              <FieldLabel htmlFor="pre-register-name" helpId="admin.usuarios.pre-cadastro-nome">Nome</FieldLabel>
              <Input id="pre-register-name" name="name" required placeholder="Nome completo" />
            </div>

            <label className="flex flex-col gap-1.5 text-sm font-medium">
              Cargo (opcional)
              <Input name="jobTitle" placeholder="Ex.: Gerente de Engenharia" />
            </label>

            <div className="grid gap-3 md:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <FieldLabel htmlFor="pre-register-permission" helpId="admin.usuarios.permissao-novo">Permissão</FieldLabel>
                <Select id="pre-register-permission" name="permission" defaultValue="COLABORADOR" required>
                  {NEW_MEMBER_PERMISSIONS.map((permission) => (
                    <option key={permission} value={permission}>
                      {permissionLabels[permission]}
                    </option>
                  ))}
                </Select>
              </div>

              <div className="flex flex-col gap-1.5">
                <FieldLabel htmlFor="pre-register-area" helpId="admin.usuarios.area-novo">Área</FieldLabel>
                <Select id="pre-register-area" name="area" defaultValue="" required>
                  <option value="" disabled>
                    Selecione…
                  </option>
                  {AREAS.map((area) => (
                    <option key={area} value={area}>
                      {membershipAreaLabels[area]}
                    </option>
                  ))}
                </Select>
              </div>
            </div>

            {preRegisterState.error ? <p className="text-sm text-destructive">{preRegisterState.error}</p> : null}

            <div className="flex gap-2">
              {/* help-exempt: ação descrita pelo ícone admin.usuarios.pre-cadastro no título deste mesmo formulário */}
              <Button type="submit" size="sm" disabled={preRegisterPending}>
                {preRegisterPending ? "Pré-cadastrando…" : "Pré-cadastrar"}
              </Button>
              <Button type="button" size="sm" variant="ghost" onClick={onCancel}>
                Cancelar
              </Button>
            </div>
          </form>
        ) : null}

        {!candidate && !searchState.notFound ? (
          <Button type="button" size="sm" variant="ghost" onClick={onCancel}>
            Cancelar
          </Button>
        ) : null}
      </CardContent>
    </Card>
  );
}
