"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@axion/db/browser";
import {
  Camera,
  CheckCircle2,
  ChevronRight,
  ClipboardCheck,
  CloudUpload,
  FileText,
  Send,
  ShieldAlert,
  Siren,
  Truck,
  X,
} from "lucide-react";
import { FieldRecordsApp, type FieldProject } from "@/components/ssma/field-records/field-records-app";
import { SsmaBottomNav, SsmaHeader, type SsmaTab } from "@/components/ssma/ssma-chrome";
import { useFieldQueue } from "@/lib/ssma/field-records/use-field-queue";
import {
  OCCURRENCE_TYPES,
  SSMA_CHECKLISTS,
  SSMA_RISK_LEVELS,
  type SsmaChecklistDefinition,
  type SsmaChecklistState,
  type SsmaFieldDefinition,
  checklistCheckLabel,
  checklistShortTitle,
  checklistTitle,
} from "@/lib/ssma/checklist-definitions";
import { OFFLINE_FORM_MESSAGE, accidentNotificationWarning, friendlySubmitError } from "@/lib/ssma/form-feedback";
import { computeFileSha256Hex } from "@/lib/documents/multi-upload/sha256";
import { sanitizeFileName } from "@/lib/documents/multi-upload/queue-core";
import { cn } from "@/lib/utils";
import { ProjectSelect } from "@/components/ssma/project-select";
import { isAuthorizedProject, resolveInitialProject } from "@/lib/ssma/project-selection";

type SsmaFieldAppProps = {
  projectId: string;
  projectLabel: string;
  technicianLabel: string;
  initialDateTime: string;
  initialCompleted?: string[];
};

type SsmaFieldAppRootProps = SsmaFieldAppProps & {
  /** Usuário autenticado (id) — dono da fila offline deste aparelho. */
  userId: string;
  /** Obra autorizada, com os membros ativos (para escolher responsável) e a permissão de gestão. */
  project: FieldProject;
  /** Obras em que o usuário pode registrar (inclui a atual). Editável no campo "Obra". */
  projects: FieldProject[];
};

type CheckState = Record<string, SsmaChecklistState | undefined>;

type SelectedPhoto = {
  id: string;
  file: File;
  previewUrl: string;
  action: string;
};

const ACCEPTED_PHOTO_TYPES = new Set(["image/jpeg", "image/png"]);
const MAX_PHOTO_SIZE_BYTES = 15 * 1024 * 1024;
const MAX_PHOTOS_PER_FORM = 20;

function formatBytes(bytes: number): string {
  return `${(bytes / 1024 / 1024).toLocaleString("pt-BR", {
    maximumFractionDigits: 1,
  })} MB`;
}

function PhotoUploadPanel({
  actions,
  onPhotosChange,
  disabled,
}: {
  actions: readonly string[];
  onPhotosChange: (photos: SelectedPhoto[]) => void;
  disabled: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const selectedActionRef = useRef(actions[0] ?? "Foto");
  const photosRef = useRef<SelectedPhoto[]>([]);
  const [photos, setPhotos] = useState<SelectedPhoto[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(
    () => () => {
      for (const photo of photosRef.current) URL.revokeObjectURL(photo.previewUrl);
    },
    []
  );

  function addPhotos(files: FileList | null) {
    if (!files) return;

    const incoming = Array.from(files);
    const invalidType = incoming.find((file) => !ACCEPTED_PHOTO_TYPES.has(file.type));
    if (invalidType) {
      setError(`Formato não permitido em “${invalidType.name}”. Use JPG ou PNG.`);
      return;
    }

    const oversized = incoming.find((file) => file.size > MAX_PHOTO_SIZE_BYTES);
    if (oversized) {
      setError(`“${oversized.name}” ultrapassa o limite de 15 MB.`);
      return;
    }

    if (photos.length + incoming.length > MAX_PHOTOS_PER_FORM) {
      setError(`Selecione no máximo ${MAX_PHOTOS_PER_FORM} fotos por formulário.`);
      return;
    }

    const existing = new Set(
      photos.map((photo) => `${photo.file.name}|${photo.file.size}|${photo.file.lastModified}`)
    );
    const additions = incoming
      .filter((file) => !existing.has(`${file.name}|${file.size}|${file.lastModified}`))
      .map((file) => ({
        id: crypto.randomUUID(),
        file,
        previewUrl: URL.createObjectURL(file),
        action: selectedActionRef.current,
      }));

    if (additions.length === 0 && incoming.length > 0) {
      setError("Este arquivo já está na lista (mesmo nome, tamanho e data). Escolha outra foto para este tipo.");
      if (inputRef.current) inputRef.current.value = "";
      return;
    }
    const next = [...photos, ...additions];
    photosRef.current = next;
    setPhotos(next);
    onPhotosChange(next);
    setError(null);
    if (inputRef.current) inputRef.current.value = "";
  }

  function openPhotoPicker(action: string) {
    selectedActionRef.current = action;
    inputRef.current?.click();
  }

  function removePhoto(id: string) {
    const target = photos.find((photo) => photo.id === id);
    if (target) URL.revokeObjectURL(target.previewUrl);
    const next = photos.filter((photo) => photo.id !== id);
    photosRef.current = next;
    setPhotos(next);
    onPhotosChange(next);
    setError(null);
  }

  return (
    <section className="space-y-3 rounded-lg border-2 border-slate-300 bg-slate-50 p-3">
      <input
        ref={inputRef}
        type="file"
        name="photos"
        multiple
        accept="image/jpeg,image/png,.jpg,.jpeg,.png"
        onChange={(event) => addPhotos(event.target.files)}
        className="sr-only"
        aria-label="Selecionar fotos do computador"
      />

      <div className="grid gap-2 sm:grid-cols-2">
        {actions.map((action) => (
          <button
            key={action}
            type="button"
            disabled={disabled}
            onClick={() => openPhotoPicker(action)}
            className="flex min-h-14 items-center justify-center gap-2 rounded-lg border-2 border-black bg-[#f7f3ea] px-4 font-bold uppercase text-black hover:bg-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white disabled:cursor-not-allowed disabled:border-[#475569] disabled:bg-[#cbd5e1] disabled:text-[#1e293b]"
          >
            <Camera className="size-6 text-black" aria-hidden="true" /> {action}
          </button>
        ))}
      </div>

      <button
        type="button"
        disabled={disabled}
        onClick={() => openPhotoPicker(actions[0] ?? "Foto")}
        className="flex min-h-12 w-full items-center justify-center gap-2 rounded-lg bg-[#7f1d1d] px-4 text-sm font-bold uppercase text-white hover:bg-[#6b1717] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white disabled:cursor-not-allowed disabled:bg-[#475569] disabled:text-white"
      >
        <CloudUpload className="size-5 text-white" aria-hidden="true" /> Selecionar fotos do computador
      </button>

      <p className="text-xs font-medium text-slate-600">JPG ou PNG · até 15 MB por foto · máximo de 20 fotos</p>
      {error ? <p role="alert" className="text-sm font-bold text-red-700">{error}</p> : null}

      {photos.length > 0 ? (
        <div className="space-y-2" aria-live="polite">
          <p className="text-sm font-bold text-slate-900">
            {photos.length} {photos.length === 1 ? "foto selecionada" : "fotos selecionadas"}
          </p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {photos.map((photo) => (
              <article key={photo.id} className="relative overflow-hidden rounded-lg border border-slate-300 bg-white">
                <div className="relative aspect-square bg-slate-200">
                  <Image src={photo.previewUrl} alt={`Pré-visualização de ${photo.file.name}`} fill unoptimized className="object-cover" />
                </div>
                <div className="p-2 pr-9">
                  <p className="truncate text-xs font-bold text-slate-900" title={photo.file.name}>{photo.file.name}</p>
                  <p className="truncate text-[11px] font-semibold text-red-700">{photo.action}</p>
                  <p className="text-[11px] text-slate-500">{formatBytes(photo.file.size)}</p>
                </div>
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => removePhoto(photo.id)}
                  className="absolute bottom-2 right-2 flex size-8 items-center justify-center rounded-full bg-red-700 text-white"
                  aria-label={`Remover ${photo.file.name}`}
                >
                  <X className="size-4" />
                </button>
              </article>
            ))}
          </div>
        </div>
      ) : null}
    </section>
  );
}

function SavedContext({
  projects,
  projectId,
  onProjectChange,
  disabled,
  technicianLabel,
  initialDateTime,
}: {
  projects: FieldProject[];
  projectId: string | null;
  onProjectChange: (id: string) => void;
  disabled?: boolean;
  technicianLabel: string;
  initialDateTime: string;
}) {
  return (
    <section className="space-y-3">
      <ProjectSelect projects={projects} value={projectId} onChange={onProjectChange} disabled={disabled} />
      <label className="block text-sm font-bold text-slate-900">
        Técnico responsável
        <span className="mt-1 block rounded-lg border-2 border-slate-300 bg-slate-50 px-3 py-3 text-base font-semibold text-slate-900">
          {technicianLabel}
        </span>
      </label>
      <p className="flex items-center gap-2 text-xs font-semibold text-green-700">
        <CheckCircle2 className="size-5 fill-green-700 text-white" /> Carregado automaticamente do cadastro da obra
      </p>
      <label className="block text-sm font-bold text-slate-900">
        Data e hora
        <input
          name="occurredAt"
          type="datetime-local"
          defaultValue={initialDateTime}
          className="mt-1 block w-full rounded-lg border-2 border-slate-300 bg-white px-3 py-3 text-base font-medium"
        />
      </label>
    </section>
  );
}

function DynamicField({ field }: { field: SsmaFieldDefinition }) {
  const className = "mt-1 block min-h-12 w-full rounded-lg border-2 border-slate-300 bg-white px-3 py-3 text-base outline-none focus:border-[#7f1d1d]";

  if (field.type === "textarea") {
    return <textarea name={field.id} placeholder={field.placeholder} rows={3} required={field.required} className={className} />;
  }

  if (field.type === "select") {
    return (
      <select name={field.id} defaultValue="" required={field.required} className={className}>
        <option value="" disabled>
          Selecione
        </option>
        {field.options?.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    );
  }

  return <input name={field.id} type={field.type} placeholder={field.placeholder} required={field.required} className={className} />;
}

function ChecklistForm({
  definition,
  projectId: contextProjectId,
  projects,
  technicianLabel,
  initialDateTime,
  onBack,
  onComplete,
}: Omit<SsmaFieldAppProps, "projectLabel"> & {
  projects: FieldProject[];
  definition: SsmaChecklistDefinition;
  onBack: () => void;
  onComplete: (slug: string, day?: string) => void;
}) {
  // Confirmação: só existe depois de o servidor confirmar a finalização. Evita reenvio (duplicidade).
  const [confirmation, setConfirmation] = useState<{ warning: string | null; day?: string } | null>(null);
  // Obra: a atual quando há contexto; a única autorizada quando só há uma; senão exige escolha.
  const [projectId, setProjectId] = useState<string | null>(() => resolveInitialProject(projects, contextProjectId).projectId);
  const [checks, setChecks] = useState<CheckState>({});
  const [risk, setRisk] = useState<string>("BAIXA");
  const [photos, setPhotos] = useState<SelectedPhoto[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);

  function mark(check: string, value: SsmaChecklistState) {
    setChecks((current) => ({ ...current, [check]: value }));
  }

  // Formulário 12: o primeiro passo é o TIPO (Acidente ou Near Miss). Near Miss usa campos próprios e é gravado como
  // "Riscos apontados" com classificação estruturada "Quase-acidente" (entra no indicador de Near Misses; nunca conta como acidente).
  const variant = definition.nearMissVariant;
  const [occurrenceType, setOccurrenceType] = useState<string>("");
  const isNearMiss = Boolean(variant) && occurrenceType === OCCURRENCE_TYPES[1];
  const typeChosen = !variant || occurrenceType !== "";
  const formFields = isNearMiss && variant ? variant.fields : definition.fields;
  const formChecks = isNearMiss && variant ? variant.checks : definition.checks;
  const formPhotoActions = isNearMiss && variant ? variant.photoActions : definition.photoActions;
  const formRequiredPhotos = isNearMiss ? [] : (definition.requiredPhotoActions ?? []);
  const allChecksAnswered = typeChosen && formChecks.every((check) => checks[check]);
  const allRequiredPhotosSelected = formRequiredPhotos.every((action) =>
    photos.some((photo) => photo.action === action)
  );
  const showRisk = definition.slug === "fotos-diarias" || definition.slug === "riscos-apontados" || definition.slug === "outros";

  if (confirmation) {
    return (
      <div className="min-h-dvh bg-slate-100">
        <SsmaHeader title={checklistTitle(definition)} onBack={() => onComplete(definition.slug, confirmation.day)} />
        <main className="mx-auto max-w-2xl space-y-4 bg-white p-6 text-center sm:my-4 sm:rounded-xl sm:border" data-testid="form-confirmation">
          <Image src="/ssma/done-icon.png" alt="Enviado" width={64} height={64} className="mx-auto size-16" />
          <h2 className="text-xl font-bold text-slate-900">Enviado e confirmado no ACC</h2>
          <p className="text-sm text-slate-700">O servidor confirmou o recebimento do formulário e dos arquivos. Este envio é online: não há cópia pendente neste aparelho.</p>
          {confirmation.warning ? (
            <p role="alert" className="rounded-lg border-2 border-amber-700 bg-amber-50 p-3 text-left text-sm font-bold text-amber-950">{confirmation.warning}</p>
          ) : null}
          <button type="button" onClick={() => onComplete(definition.slug, confirmation.day)} className="flex min-h-14 w-full items-center justify-center rounded-lg bg-[#7f1d1d] px-4 text-base font-bold uppercase text-white">
            Voltar ao início
          </button>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-dvh bg-slate-100">
      <SsmaHeader title={checklistTitle(definition)} onBack={onBack} />
      <form
        className="mx-auto max-w-2xl space-y-5 bg-white p-4 pb-28 sm:my-4 sm:rounded-xl sm:border sm:p-6"
        onSubmit={async (event) => {
          event.preventDefault();
          if (!allChecksAnswered || !allRequiredPhotosSelected || submitting) return;
          if (!isAuthorizedProject(projects, projectId)) {
            setSubmitError("Selecione uma obra em que você está autorizado a registrar.");
            return;
          }

          if (typeof navigator !== "undefined" && navigator.onLine === false) {
            setSubmitError(OFFLINE_FORM_MESSAGE);
            return;
          }

          const formData = new FormData(event.currentTarget);
          const occurredAtValue = String(formData.get("occurredAt") ?? "");
          const occurredAt = new Date(occurredAtValue);
          if (!occurredAtValue || Number.isNaN(occurredAt.getTime())) {
            setSubmitError("Informe uma data e hora válidas.");
            return;
          }

          setSubmitting(true);
          setSubmitError(null);
          setUploadProgress(0);

          try {
            const supabase = createSupabaseBrowserClient();
            const fieldValues = Object.fromEntries(
              formFields.map((field) => [field.id, String(formData.get(field.id) ?? "").trim()])
            );
            const checklistValues = Object.fromEntries(
              formChecks.map((check) => [check, checks[check]])
            );

            const submissionRequest = isNearMiss && variant
              ? await supabase.rpc("create_ssma_form_submission", {
                  p_project_id: projectId,
                  p_checklist_slug: variant.submitAs.slug,
                  p_checklist_number: variant.submitAs.number,
                  p_checklist_title: variant.submitAs.title,
                  p_drive_folder_name: variant.submitAs.driveFolder,
                  p_occurred_at: occurredAt.toISOString(),
                  p_field_values: { ...fieldValues, ...variant.fixedValues },
                  p_checklist_values: checklistValues,
                  p_risk_level: risk,
                })
              : definition.slug === "ocorrencia-acidente"
              ? await supabase.rpc("create_ssma_accident_submission", {
                  p_project_id: projectId,
                  p_occurred_at: occurredAt.toISOString(),
                  p_field_values: fieldValues,
                  p_checklist_values: checklistValues,
                })
              : await supabase.rpc("create_ssma_form_submission", {
                p_project_id: projectId,
                p_checklist_slug: definition.slug,
                p_checklist_number: definition.number,
                p_checklist_title: definition.title,
                p_drive_folder_name: definition.driveFolder,
                p_occurred_at: occurredAt.toISOString(),
                p_field_values: fieldValues,
                p_checklist_values: checklistValues,
                p_risk_level:
                  definition.slug === "ocorrencia-acidente"
                    ? fieldValues.afastamento === "Com afastamento"
                      ? "CRITICA"
                      : "ALTA"
                    : showRisk
                      ? risk
                      : null,
              });
            const { data: submissionData, error: submissionError } = submissionRequest;
            if (submissionError || !submissionData) {
              throw new Error(submissionError?.message ?? "Não foi possível iniciar o envio.");
            }
            const submissionId = String(submissionData);

            for (let index = 0; index < photos.length; index += 1) {
              const photo = photos[index];
              const photoId = crypto.randomUUID();
              const storagePath = `${projectId}/ssma/${submissionId}/${photoId}-${sanitizeFileName(photo.file.name)}`;
              const sha256Hash = await computeFileSha256Hex(photo.file);
              const { error: uploadError } = await supabase.storage
                .from("project-documents")
                .upload(storagePath, photo.file, {
                  upsert: false,
                  contentType: photo.file.type,
                });
              if (uploadError) throw new Error(`Falha ao enviar “${photo.file.name}”.`);

              const { error: registerError } = await supabase.rpc("register_ssma_submission_photo", {
                p_photo_id: photoId,
                p_submission_id: submissionId,
                p_action_label: photo.action,
                p_storage_path: storagePath,
                p_original_file_name: photo.file.name,
                p_mime_type: photo.file.type,
                p_file_size_bytes: photo.file.size,
                p_sha256_hash: sha256Hash,
              });
              if (registerError) {
                // Limpeza best-effort: o servidor autoriza no banco e remove o arquivo pela API do Storage.
                await fetch("/api/ssma/photos/discard", {
                  method: "POST",
                  headers: { "content-type": "application/json" },
                  body: JSON.stringify({ submissionId, storagePath }),
                }).catch(() => undefined);
                throw new Error(`Falha ao registrar “${photo.file.name}”.`);
              }
              setUploadProgress(Math.round(((index + 1) / Math.max(photos.length, 1)) * 100));
            }

            const { error: finalizeError } = await supabase.rpc("finalize_ssma_form_submission", {
              p_submission_id: submissionId,
            });
            if (finalizeError) throw new Error("Os arquivos foram enviados, mas o formulário não pôde ser finalizado.");
            // A partir daqui o formulário está CONFIRMADO no ACC. A comunicação do acidente é uma etapa à parte:
            // se falhar, o aviso é separado e nunca convida a reenviar (duplicaria o acidente).
            let warning: string | null = null;
            if (definition.slug === "ocorrencia-acidente" && !isNearMiss) {
              let response: Response | null = null;
              let serverError: string | null = null;
              try {
                response = await fetch("/api/ssma/accident-notifications", {
                  method: "POST",
                  headers: { "content-type": "application/json" },
                  body: JSON.stringify({ submissionId }),
                });
                if (!response.ok) serverError = ((await response.json().catch(() => ({}))) as { error?: string }).error ?? null;
              } catch {
                response = null;
              }
              warning = accidentNotificationWarning(response ? { ok: response.ok, status: response.status } : null, serverError);
            }
            setConfirmation({ warning, day: projectId === contextProjectId ? occurredAtValue.slice(0, 10) : undefined }); // só conta para a obra atual e o dia de hoje
            return;

          } catch (error) {
            setSubmitError(friendlySubmitError(error));
          } finally {
            setSubmitting(false);
          }
        }}
      >
        {definition.independent ? (
          <p className="rounded-md bg-[#7f1d1d] px-3 py-2 text-center text-sm font-bold text-white">
            Tarefa independente — pode ser preenchida a qualquer momento
          </p>
        ) : null}

        <SavedContext projects={projects} projectId={projectId} onProjectChange={setProjectId} disabled={submitting} technicianLabel={technicianLabel} initialDateTime={initialDateTime} />

        <div className="h-px bg-slate-300" />

        {variant ? (
          <fieldset className="space-y-2" data-testid="occurrence-type">
            <legend className="mb-1 text-sm font-bold text-slate-900">Tipo de ocorrência *</legend>
            <div className="grid grid-cols-2 gap-2">
              {OCCURRENCE_TYPES.map((type) => (
                <button
                  key={type}
                  type="button"
                  aria-pressed={occurrenceType === type}
                  disabled={submitting}
                  onClick={() => { setOccurrenceType(type); setChecks({}); setPhotos([]); setSubmitError(null); }}
                  className={cn(
                    "min-h-14 rounded-lg border-2 px-2 text-sm font-bold",
                    type === OCCURRENCE_TYPES[0] ? "border-[#7f1d1d] bg-[#b91c1c] text-white" : "border-[#78350f] bg-[#b45309] text-white",
                    occurrenceType === type ? "ring-4 ring-white" : "opacity-80"
                  )}
                >
                  {type}
                </button>
              ))}
            </div>
            {!typeChosen ? <p className="text-center text-sm font-semibold text-amber-700">Escolha o tipo de ocorrência para continuar.</p> : null}
            {isNearMiss ? <p className="text-xs font-medium text-slate-700">Near Miss: evento que poderia ter causado lesão ou dano e não causou. Não é contado como acidente.</p> : null}
          </fieldset>
        ) : null}

        {typeChosen ? (
        <>
        <section className="space-y-4">
          {formFields.map((field) => (
            <label key={field.id} className="block text-sm font-bold text-slate-900">
              {field.label}
              {field.required ? <span aria-hidden="true"> *</span> : null}
              <DynamicField field={field} />
            </label>
          ))}
        </section>

        {showRisk || isNearMiss ? (
          <fieldset>
            <legend className="mb-2 text-sm font-bold text-slate-900">Classificação do risco</legend>
            <div className="grid grid-cols-4 gap-2">
              {SSMA_RISK_LEVELS.map((level) => (
                <button
                  key={level.value}
                  type="button"
                  onClick={() => setRisk(level.value)}
                  className={cn(
                    "min-h-11 rounded-md px-1 text-xs font-bold ring-offset-2",
                    level.className,
                    risk === level.value && "ring-2 ring-slate-900"
                  )}
                >
                  {level.label}
                </button>
              ))}
            </div>
          </fieldset>
        ) : null}

        <fieldset className="overflow-hidden rounded-lg border-2 border-slate-300">
          <legend className="sr-only">Checklist</legend>
          <div className="bg-slate-200 px-3 py-2 text-sm font-bold uppercase text-slate-900">Checklist</div>
          {formChecks.map((check) => (
            <div key={check} className="grid grid-cols-[1fr_auto_auto] items-center gap-3 border-t border-slate-300 px-3 py-3 first:border-t-0">
              <span className="text-sm font-semibold text-slate-900">{checklistCheckLabel(definition, check)}</span>
              {(["FEITO", "NA"] as const).map((value) => (
                <label key={value} className="flex min-h-11 cursor-pointer items-center gap-2 px-1 text-sm font-bold">
                  <input
                    type="checkbox"
                    checked={checks[check] === value}
                    onChange={() => mark(check, value)}
                    className="size-6 accent-[#7f1d1d]"
                  />
                  {value === "FEITO" ? "Feito" : "NA"}
                </label>
              ))}
            </div>
          ))}
        </fieldset>

        <PhotoUploadPanel key={isNearMiss ? "nm" : "std"} actions={formPhotoActions} onPhotosChange={setPhotos} disabled={submitting} />

        {submitting && photos.length > 0 ? (
          <div className="space-y-1" aria-live="polite">
            <div className="h-2 overflow-hidden rounded-full bg-slate-200">
              <div className="h-full bg-[#7f1d1d] transition-all" style={{ width: `${uploadProgress}%` }} />
            </div>
            <p className="text-center text-sm font-bold text-slate-700">Enviando fotos: {uploadProgress}%</p>
          </div>
        ) : null}

        {submitError ? <p role="alert" className="text-center text-sm font-bold text-red-700">{submitError}</p> : null}

        {!allChecksAnswered ? (
          <p className="text-center text-sm font-semibold text-amber-700">Marque Feito ou NA em todos os itens para enviar.</p>
        ) : null}

        {!allRequiredPhotosSelected ? (
          <p className="text-center text-sm font-semibold text-amber-700">
            Inclua uma foto para cada tipo obrigatório antes de enviar.
          </p>
        ) : null}

        <button
          type="submit"
          disabled={!allChecksAnswered || !allRequiredPhotosSelected || submitting || !isAuthorizedProject(projects, projectId)}
          className="flex min-h-14 w-full items-center justify-center gap-2 rounded-lg bg-[#7f1d1d] px-4 text-base font-bold uppercase text-white disabled:cursor-not-allowed disabled:bg-[#475569] disabled:text-white"
        >
          <Send className="size-6" /> {submitting ? "Enviando…" : "Enviar dados"}
        </button>

        </>
        ) : null}

        <p className="text-center text-xs font-medium text-slate-500">
          Tela {definition.number} de 12 · Registro protegido e auditável
        </p>
      </form>
    </div>
  );
}

/** Indicador de conclusão (imagem fornecida, sem alterações). Só aparece quando o envio foi CONFIRMADO pelo servidor. */
function DoneIcon() {
  return (
    <span className="ml-auto flex shrink-0 items-center" title="Concluído">
      <Image src="/ssma/done-icon.png" alt="Concluído" title="Concluído" width={28} height={28} className="size-7" />
    </span>
  );
}

export function SsmaFieldApp({ projectId, projectLabel, technicianLabel, initialDateTime, initialCompleted = [], userId, project, projects }: SsmaFieldAppRootProps) {
  const router = useRouter();
  const queue = useFieldQueue(userId);
  const [view, setView] = useState<"home" | "field">("home");
  const [fieldTab, setFieldTab] = useState<SsmaTab>("registros");
  const [activeSlug, setActiveSlug] = useState<string | null>(null);
  const { ready, rememberContext } = queue;

  // Guarda, neste aparelho e para esta conta, o mínimo para abrir o formulário sem rede.
  useEffect(() => {
    if (!ready) return;
    for (const entry of projects) if (entry.id !== project.id) void rememberContext(technicianLabel, entry);
    void rememberContext(technicianLabel, project);
  }, [ready, rememberContext, technicianLabel, project, projects]);

  const signOut = async () => {
    await createSupabaseBrowserClient().auth.signOut();
    router.push("/login");
    router.refresh();
  };
  const [completed, setCompleted] = useState<Set<string>>(() => new Set(initialCompleted));

  const active = useMemo(
    () => SSMA_CHECKLISTS.find((definition) => definition.slug === activeSlug) ?? null,
    [activeSlug]
  );

  if (view === "field") {
    return (
      <FieldRecordsApp
        queue={queue}
        userId={userId}
        userLabel={technicianLabel}
        project={project}
        projects={projects}
        initialTab={fieldTab}
        onHome={() => setView("home")}
        onSignOut={signOut}
      />
    );
  }

  if (active) {
    return (
      <ChecklistForm
        definition={active}
        projectId={projectId}
        projects={projects}
        technicianLabel={technicianLabel}
        initialDateTime={initialDateTime}
        onBack={() => setActiveSlug(null)}
        onComplete={(slug, day) => {
          // Só conta o envio confirmado pelo servidor para a data de hoje; a obra é sempre a atual.
          if (day === initialDateTime.slice(0, 10)) setCompleted((current) => new Set(current).add(slug));
          setActiveSlug(null);
          router.refresh();
        }}
      />
    );
  }

  // Apenas os quatro relatórios fixos entram no checklist diário.
  const dailySlugs = new Set(["dda", "fotos-diarias", "almoxarifado", "limpeza"]);
  const routine = SSMA_CHECKLISTS.filter((definition) => dailySlugs.has(definition.slug));
  const occasional = SSMA_CHECKLISTS.filter((definition) => !dailySlugs.has(definition.slug));
  const completedRoutine = routine.filter((definition) => completed.has(definition.slug)).length;

  return (
    <div className="min-h-dvh bg-slate-100 pb-20">
      <SsmaHeader title="SSMA/ESG" />
      <main className="mx-auto max-w-4xl space-y-4 p-4">
        <section className="rounded-xl border-2 border-slate-500 bg-white p-3">
          <p className="text-xs font-semibold text-slate-500">Projeto atual</p>
          <p className="mt-1 font-bold text-slate-900">{projectLabel}</p>
        </section>

        <div className="flex items-center justify-between gap-3">
          <p className="text-base font-bold text-slate-900">Olá, {technicianLabel.split(" — ")[0]}</p>
          <span className={cn("flex items-center gap-1 text-xs font-bold", queue.items.some((item) => item.status !== "SYNCED") ? "text-amber-700" : "text-green-700")}>
            <CloudUpload className="size-5" />
            {queue.items.some((item) => item.status !== "SYNCED") ? "Aguardando envio" : "Sincronizado"}
          </span>
        </div>

        <section className="rounded-xl bg-white p-4 shadow-sm">
          <div className="flex items-center gap-3">
            <ClipboardCheck className="size-9 text-red-700" />
            <div className="flex-1">
              <p className="font-bold text-slate-900">Checklist de hoje</p>
              <p className="text-sm text-slate-600">{completedRoutine} de {routine.length} enviados</p>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-200">
                <div className="h-full bg-sky-400 transition-all" style={{ width: `${(completedRoutine / routine.length) * 100}%` }} />
              </div>
            </div>
          </div>
        </section>

        <h2 className="text-base font-bold text-slate-900">1. Relatórios diários — obrigatórios</h2>
        <section className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {routine.map((definition) => {
            const done = completed.has(definition.slug);
            return (
              <button
                key={definition.slug}
                type="button"
                onClick={() => setActiveSlug(definition.slug)}
                className="flex min-h-24 items-center gap-3 rounded-xl border border-slate-300 bg-white p-4 text-left text-slate-900 shadow-sm transition hover:border-[#7f1d1d] hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7f1d1d]"
              >
                {definition.slug === "riscos-apontados" ? (
                  <ShieldAlert className="size-7 shrink-0 text-slate-900" aria-hidden="true" />
                ) : (
                  <FileText className="size-7 shrink-0 text-slate-900" aria-hidden="true" />
                )}
                <span className="min-w-0 flex-1">
                  <span className="block font-bold text-slate-900">
                    {String(definition.number).padStart(2, "0")} {checklistShortTitle(definition)}
                  </span>
                  {done ? null : <span className="mt-1 block text-xs font-bold text-amber-800">Pendente</span>}
                </span>
                {done ? <DoneIcon /> : null}
                <ChevronRight className="size-5 shrink-0 text-slate-600" aria-hidden="true" />
              </button>
            );
          })}
        </section>

        <h2 className="text-base font-bold text-slate-900">2. Relatórios avulsos — conforme necessidade</h2>
        <section className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {occasional.map((definition) => {
          const Icon = definition.slug === "ocorrencia-acidente" ? Siren : definition.slug === "remessa-bota-fora" ? Truck : FileText;
          // Tons conforme a referência visual: avulsos verdes, 11 Remessa marrom bem escuro #4E342E, 12 Ocorrências vermelho. Texto/ícones brancos.
          const tone =
            definition.slug === "ocorrencia-acidente"
              ? "border-[#7f1d1d] bg-[#b91c1c] hover:bg-[#991b1b]"
              : definition.slug === "remessa-bota-fora"
                ? "border-[#3e2723] bg-[#4E342E] hover:bg-[#3e2723]"
                : "border-[#052e16] bg-[#14532d] hover:bg-[#0f3f22]";
          return (
            <button
              key={definition.slug}
              type="button"
              onClick={() => setActiveSlug(definition.slug)}
              className={cn(
                "flex min-h-20 w-full items-center gap-3 rounded-xl border-2 p-4 text-left text-white shadow-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white",
                tone
              )}
            >
              <Icon className="size-7 shrink-0 text-white" aria-hidden="true" />
              <span className="min-w-0 flex-1">
                <span className="block font-bold text-white">
                  {String(definition.number).padStart(2, "0")} {definition.slug === "ocorrencia-acidente" ? "Ocorrências / Near Misses" : definition.shortTitle}
                </span>
                <span className="block text-xs font-semibold text-white">Avulso · conforme necessidade</span>
              </span>
              <span className="text-sm font-bold text-white">Registrar</span>
              <ChevronRight className="size-5 shrink-0 text-white" aria-hidden="true" />
            </button>
          );
        })}
        </section>
      </main>

      <SsmaBottomNav
        active="home"
        pendingCount={queue.items.filter((item) => item.status !== "SYNCED").length}
        onChange={(tab) => {
          if (tab === "home") return;
          setFieldTab(tab);
          setView("field");
        }}
      />
    </div>
  );
}
