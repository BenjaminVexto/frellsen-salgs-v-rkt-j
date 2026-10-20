import { useState, type ReactNode } from "react";
import { useNavigate } from "@tanstack/react-router";
import { ChevronDown, ChevronRight, ArrowUp, ArrowDown } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CustomerStatusBadge } from "@/components/customer-status-info";
import { SegmentBadge } from "@/components/binding-status-badge";
import { adresseNoegle } from "@/lib/adresse-grupper";
import { kr, CvrStatusMaerke, type CvrGruppeInfo, type ListeItem } from "@/components/cvr-gruppe";
import { parseSegment3 } from "@/lib/customer-segment-mapping";
import type { CompanyRow } from "@/components/company-filter/types";

/** Kun visning: "ROSKILDE" → "Roskilde", "HØJE-TAASTRUP" → "Høje-Taastrup". Blandet skrivemåde bevares. */
export function paenBy(s: string | null | undefined): string {
  const t = (s ?? "").trim();
  if (!t) return "";
  if (t !== t.toUpperCase()) return t;
  return t.toLowerCase().replace(/(^|[\s\-./])(\p{L})/gu, (_, a, b) => a + b.toUpperCase());
}

const RANG: Record<string, number> = { aktiv_kunde: 1, servicekunde: 2, sovende_kunde: 3, tidligere_kunde: 4, nyt_emne: 5 };
export const statusRang = (t: string | null | undefined) => RANG[t ?? ""] ?? 9;

export type SortKey = "navn" | "oms" | "status";
export type Sort = { key: SortKey; dir: 1 | -1 } | null;

const COLS_ADMIN =
  "grid-cols-[1.25rem_minmax(0,1fr)_auto] md:grid-cols-[1.25rem_minmax(0,2.2fr)_minmax(0,1.6fr)_5.5rem_minmax(0,1fr)_7.5rem_13rem]";
const COLS =
  "grid-cols-[minmax(0,1fr)_auto] md:grid-cols-[minmax(0,2.2fr)_minmax(0,1.6fr)_5.5rem_minmax(0,1fr)_7.5rem_13rem]";

const VIS_ANTAL = 25;

type Props = {
  items: ListeItem[];
  isAdmin: boolean;
  selected: Set<string>;
  setSelected: (fn: (s: Set<string>) => Set<string>) => void;
  omsMap: Map<string, number> | undefined;
  saelgerNavn: (r: CompanyRow) => string | null;
  ikkeTildelt: (r: CompanyRow) => boolean;
  ekstraLinje: (r: CompanyRow) => ReactNode;
  grupper: Map<string, CvrGruppeInfo> | undefined;
  aabne: Set<string>;
  toggleGruppe: (cvr: string) => void;
  sort: Sort;
  setSort: (s: Sort) => void;
};

export function kontoOms(r: CompanyRow, omsMap: Map<string, number> | undefined): number | null {
  if (!omsMap) return null;
  const v = omsMap.get(r.id);
  return v == null ? null : v;
}

function OmsTekst({ v, nyt }: { v: number | null; nyt?: boolean }) {
  if (v == null || (nyt && !v)) return <span className="text-muted-foreground">—</span>;
  return <>{kr(v)}</>;
}

function Adresse({ r }: { r: CompanyRow }) {
  const by = [r.zip, paenBy(r.city)].filter(Boolean).join(" ");
  if (!r.address && !by) return <span className="text-muted-foreground">—</span>;
  return (
    <div className="min-w-0 leading-tight">
      <div className="truncate">{r.address?.split(",")[0] || "—"}</div>
      {by && <div className="truncate text-xs text-muted-foreground">{by}</div>}
    </div>
  );
}

export function VirksomhedListe(p: Props) {
  const cols = p.isAdmin ? COLS_ADMIN : COLS;
  const navigate = useNavigate();
  const aaben = (id: string) => navigate({ to: "/virksomheder/$id", params: { id } });

  const Hoved = ({ k, children, right }: { k: SortKey; children: ReactNode; right?: boolean }) => {
    const aktiv = p.sort?.key === k;
    return (
      <button
        type="button"
        className={`inline-flex items-center gap-1 hover:text-foreground ${right ? "justify-end w-full" : ""} ${aktiv ? "text-foreground" : ""}`}
        onClick={() =>
          p.setSort(!aktiv ? { key: k, dir: k === "navn" ? 1 : -1 } : p.sort!.dir === (k === "navn" ? 1 : -1) ? { key: k, dir: (p.sort!.dir * -1) as 1 | -1 } : null)
        }
      >
        {children}
        {aktiv && (p.sort!.dir === 1 ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />)}
      </button>
    );
  };

  const kontoRaekke = (r: CompanyRow, opts: { under?: boolean; skjulSegment?: boolean; hit?: boolean } = {}) => {
    const checked = p.selected.has(r.id);
    const oms = kontoOms(r, p.omsMap);
    const nyt = r.customer_type === "nyt_emne";
    const saelger = p.saelgerNavn(r);
    const primaer = r.name;
    const sekundaer = r.visma_enhed;
    const navnCelle = (
      <div className="min-w-0 leading-tight">
        <div className="line-clamp-2 md:line-clamp-none md:truncate">
          <span className={opts.under ? "font-medium" : "font-semibold"}>{primaer}</span>
          {sekundaer && <span className="text-muted-foreground text-xs"> · {sekundaer}</span>}
        </div>
        {!opts.under && r.cvr && <div className="hidden md:block text-xs text-muted-foreground">CVR {r.cvr}</div>}
        <div className="md:hidden text-xs text-muted-foreground truncate">
          {[r.address?.split(",")[0], [r.zip, paenBy(r.city)].filter(Boolean).join(" ")].filter(Boolean).join(", ")}
        </div>
        {p.ekstraLinje(r)}
      </div>
    );
    return (
      <div
        key={r.id}
        role="link"
        tabIndex={0}
        onClick={() => aaben(r.id)}
        onKeyDown={(e) => e.key === "Enter" && aaben(r.id)}
        className={`grid ${cols} items-center gap-x-3 px-3 md:px-4 py-2 md:py-1.5 min-h-14 md:min-h-0 text-sm cursor-pointer hover:bg-muted/50 ${checked ? "bg-primary/5" : ""} ${opts.hit ? "bg-primary/[0.04]" : ""}`}
      >
        {p.isAdmin && (
          <div onClick={(e) => e.stopPropagation()}>
            <Checkbox
              checked={checked}
              onCheckedChange={() =>
                p.setSelected((prev) => {
                  const n = new Set(prev);
                  n.has(r.id) ? n.delete(r.id) : n.add(r.id);
                  return n;
                })
              }
            />
          </div>
        )}
        {opts.under ? (
          <div className="ml-1.5 pl-4 border-l-2 border-border min-w-0 self-stretch flex items-center">{navnCelle}</div>
        ) : (
          navnCelle
        )}
        <div className="hidden md:block min-w-0"><Adresse r={r} /></div>
        <div className="hidden md:block tabular-nums text-muted-foreground">{r.visma_id ?? "—"}</div>
        <div className="hidden md:block truncate">{saelger ?? <span className="text-muted-foreground">—</span>}</div>
        <div className="hidden md:block text-right tabular-nums"><OmsTekst v={oms} nyt={nyt} /></div>
        <div className="flex flex-nowrap items-center justify-end gap-1 whitespace-nowrap [&>*]:shrink-0">
          {p.ikkeTildelt(r) && (
            <Badge variant="outline" className="border-warning/40 text-warning text-[10px]">Ikke tildelt</Badge>
          )}
          {!opts.skjulSegment && <SegmentBadge segment3={r.customer_segment_3} size="sm" kompakt />}
          <CustomerStatusBadge type={r.customer_type as any} />
        </div>
      </div>
    );
  };

  return (
    <div className="divide-y">
      <div className={`hidden md:grid ${cols} gap-x-3 px-3 md:px-4 py-2 text-xs font-medium text-muted-foreground bg-muted/30`}>
        {p.isAdmin && <span />}
        <Hoved k="navn">Virksomhed</Hoved>
        <span>Adresse</span>
        <span>Kundenr.</span>
        <span>Sælger</span>
        <Hoved k="oms" right>Oms. 12 mdr.</Hoved>
        <div className="text-right"><Hoved k="status" right>Status</Hoved></div>
      </div>
      {p.items.map((it) =>
        it.kind === "en" ? (
          kontoRaekke(it.row)
        ) : (
          <GruppeRaekke
            key={"g" + it.cvr}
            it={it}
            p={p}
            cols={cols}
            udfoldet={it.tvungen || p.aabne.has(it.cvr)}
            kontoRaekke={kontoRaekke}
          />
        ),
      )}
    </div>
  );
}

function GruppeRaekke({
  it,
  p,
  cols,
  udfoldet,
  kontoRaekke,
}: {
  it: Extract<ListeItem, { kind: "gruppe" }>;
  p: Props;
  cols: string;
  udfoldet: boolean;
  kontoRaekke: (r: CompanyRow, o?: { under?: boolean; skjulSegment?: boolean; hit?: boolean }) => ReactNode;
}) {
  const [vis, setVis] = useState(VIS_ANTAL);
  const info = p.grupper?.get(it.cvr);
  const konti = [...it.konti].sort(
    (a, b) => statusRang(a.customer_type) - statusRang(b.customer_type) || (kontoOms(b, p.omsMap) ?? -1) - (kontoOms(a, p.omsMap) ?? -1),
  );
  const bedste = konti[0]!;
  const gruppeNavn = info?.cvr_navn || bedste.name;
  // Udbud/Offentlig aftale: vises én gang på gruppen, hvis alle konti har samme mærke.
  const segKode = (s: string | null | undefined) => parseSegment3(s).code;
  const fællesSeg = ["40", "45"].includes(segKode(bedste.customer_segment_3) ?? "") && konti.every((k) => segKode(k.customer_segment_3) === segKode(bedste.customer_segment_3))
    ? bedste.customer_segment_3
    : null;
  const antal = info?.antal_konti ?? konti.length;
  const aktive = info?.aktive ?? konti.filter((k) => k.customer_type === "aktiv_kunde").length;
  const adresser = new Set(konti.map((k) => `${k.zip ?? ""}|${adresseNoegle(k.address) ?? k.id}`)).size;
  const saelgere = new Set(konti.map((k) => p.saelgerNavn(k)).filter(Boolean) as string[]);
  const oms = info?.oms_12m ?? konti.reduce((s, k) => s + (kontoOms(k, p.omsMap) ?? 0), 0);
  const alleValgt = konti.every((k) => p.selected.has(k.id));
  return (
    <div>
      <div
        role="button"
        tabIndex={0}
        onClick={() => p.toggleGruppe(it.cvr)}
        onKeyDown={(e) => e.key === "Enter" && p.toggleGruppe(it.cvr)}
        className={`grid ${cols} items-center gap-x-3 px-3 md:px-4 py-2 md:py-1.5 min-h-14 md:min-h-0 text-sm cursor-pointer bg-muted/40 hover:bg-muted/70`}
      >
        {p.isAdmin && (
          <div onClick={(e) => e.stopPropagation()}>
            <Checkbox
              checked={alleValgt}
              aria-label="Vælg alle konti i gruppen"
              onCheckedChange={(v) =>
                p.setSelected((prev) => {
                  const n = new Set(prev);
                  konti.forEach((k) => (v ? n.add(k.id) : n.delete(k.id)));
                  return n;
                })
              }
            />
          </div>
        )}
        <div className="min-w-0 leading-tight">
          <div className="flex items-center gap-1.5 min-w-0">
            {udfoldet ? <ChevronDown className="h-4 w-4 shrink-0" /> : <ChevronRight className="h-4 w-4 shrink-0" />}
            <span className="font-semibold line-clamp-2 md:line-clamp-none md:truncate" title={gruppeNavn}>{gruppeNavn}</span>
          </div>
          <div className="md:hidden text-xs text-muted-foreground pl-5 truncate">
            {antal} konti · {aktive} aktive · {adresser} adresser · {kr(oms)}
          </div>
          <div className="hidden md:flex text-xs text-muted-foreground pl-5 flex-wrap items-center gap-x-1.5">
            <span>CVR {it.cvr}</span>
            <span className="rounded-full border bg-background px-1.5 py-px text-[11px]">{antal} konti · {aktive} aktive</span>
            <CvrStatusMaerke status={info?.cvr_status} />
          </div>
        </div>
        <div className="hidden md:block text-muted-foreground">{adresser} adresser</div>
        <div className="hidden md:block" />
        <div className="hidden md:block truncate">
          {saelgere.size === 0 ? <span className="text-muted-foreground">—</span> : saelgere.size === 1 ? [...saelgere][0] : `${saelgere.size} sælgere`}
        </div>
        <div className="hidden md:block text-right tabular-nums">{kr(oms)}</div>
        <div className="flex flex-nowrap items-center justify-end gap-1 whitespace-nowrap [&>*]:shrink-0">
          {fællesSeg && <SegmentBadge segment3={fællesSeg} size="sm" kompakt />}
          <CustomerStatusBadge type={(info?.bedste_status ?? bedste.customer_type) as any} />
        </div>
      </div>
      {udfoldet && (
        <div className="divide-y divide-border/60">
          {konti.slice(0, vis).map((k) => kontoRaekke(k, { under: true, skjulSegment: !!fællesSeg, hit: it.hits.has(k.id) && it.hits.size < konti.length }))}
          {konti.length > vis && (
            <div className="pl-10 py-1.5">
              <Button size="sm" variant="ghost" onClick={() => setVis((v) => v + VIS_ANTAL * 2)}>
                Vis flere ({konti.length - vis} tilbage)
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
