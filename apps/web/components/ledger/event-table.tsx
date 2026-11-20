import Link from "next/link";
import type { ContractEvent } from "@axion/types";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { FeatureInfo } from "@/components/shared/feature-info";
import { CategoryBadge, SeverityBadge, StatusBadge } from "@/components/shared/badges";
import { sourceTypeShortLabels, formatDate } from "@/lib/labels";

export function EventTable({ events, projectId }: { events: ContractEvent[]; projectId: string }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
<TableHead><span className="inline-flex items-center gap-1">Data<FeatureInfo helpId="planejamento.ledger.col-data" /></span></TableHead>
          <TableHead><span className="inline-flex items-center gap-1">Evento<FeatureInfo helpId="planejamento.ledger.col-evento" /></span></TableHead>
          <TableHead><span className="inline-flex items-center gap-1">Fonte<FeatureInfo helpId="planejamento.ledger.col-fonte" /></span></TableHead>
          <TableHead><span className="inline-flex items-center gap-1">Categorias<FeatureInfo helpId="planejamento.ledger.col-categorias" /></span></TableHead>
          <TableHead><span className="inline-flex items-center gap-1">Status<FeatureInfo helpId="planejamento.ledger.col-status" /></span></TableHead>
          <TableHead><span className="inline-flex items-center gap-1">Achado IA<FeatureInfo helpId="planejamento.ledger.col-achado-ia" /></span></TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {events.map((event) => (
          <TableRow key={event.id} className="cursor-pointer">
            <TableCell className="whitespace-nowrap text-muted-foreground">
              <Link href={`/${projectId}/ledger/${event.id}`} className="block">
                {formatDate(event.timestamp)}
              </Link>
            </TableCell>
            <TableCell>
              <Link href={`/${projectId}/ledger/${event.id}`} className="font-medium hover:underline">
                {event.title}
              </Link>
            </TableCell>
            <TableCell className="whitespace-nowrap text-muted-foreground">{sourceTypeShortLabels[event.sourceType]}</TableCell>
            <TableCell>
              <div className="flex flex-wrap gap-1">
                {event.categories.map((c) => (
                  <CategoryBadge key={c} category={c} />
                ))}
              </div>
            </TableCell>
            <TableCell>
              <StatusBadge status={event.status} />
            </TableCell>
            <TableCell>{event.aiAssessment ? <SeverityBadge severity={event.aiAssessment.severity} /> : <span className="text-xs text-muted-foreground">—</span>}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
