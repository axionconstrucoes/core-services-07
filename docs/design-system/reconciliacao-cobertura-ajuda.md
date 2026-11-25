# Reconciliação de cobertura do Hover Text

Gerado por `node scripts/help-reconcile.mjs` (heurístico). Cada candidato do inventário automático é itemizado UMA vez (arquivo:linha:tipo) e classificado. **Não se presume que todo candidato exige Hover Text individual.**

- Candidatos únicos: **987** em 210 arquivos de interface alcançados por alguma rota real.
- Classificação: COBERTO **510** · COBERTO_NA_SECAO **90** · COMPARTILHADO **7** · DECORATIVO **221** · ISENTO **149** · DUPLICADO **10** · LACUNA_EFETIVA **0**

## Métricas dos manifestos (lista autoritativa)

- Inventariados: **1020** · com Hover Text: **968** · isentos justificados: **52** · lacunas declaradas: **0**
- **Cobertura bruta** (com hover / inventariados): **94.9%**
- **Cobertura elegível** (com hover / não isentos): **100.0%**

## Candidatos por módulo

| Módulo | Total | COBERTO | COBERTO_NA_SECAO | COMPARTILHADO | DECORATIVO | ISENTO | DUPLICADO | LACUNA_EFETIVA |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| planejamento | 295 | 174 | 7 | 7 | 69 | 34 | 4 | 0 |
| admin | 149 | 57 | 27 | 0 | 31 | 30 | 4 | 0 |
| juridico | 243 | 136 | 35 | 0 | 64 | 8 | 0 | 0 |
| ssma | 142 | 77 | 10 | 0 | 12 | 43 | 0 | 0 |
| comercial | 38 | 22 | 7 | 0 | 8 | 0 | 1 | 0 |
| integracoes | 120 | 44 | 4 | 0 | 37 | 34 | 1 | 0 |

## Lacunas efetivas (precisam de helpId ou isenção justificada)

| Módulo | Arquivo:linha | Tipo | Rótulo |
|---|---|---|---|
