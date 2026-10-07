import { useState } from "react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Printer, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { FRELLSEN_LOGO_BASE64 } from "@/lib/frellsen-logo-base64";
import { aeldreAflaesning, erIkkeMaskine, erUdeladt, maskinAftale, reservedeleStatus, maskinNavn, sorterMaskiner, udloebStatus, visKopper as visKopperVaerdi, type MaskinRaekke } from "@/lib/maskinliste";
import { hentPlaceringer } from "@/components/placering-felt";
import { adresseNoegle, lokAdresse } from "@/lib/adresse-grupper";
const LOGO_SRC = `data:image/png;base64,${FRELLSEN_LOGO_BASE64}`;

const esc = (v: unknown) =>
  String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const fmtDato = (d: string | null) => (d ? new Date(d + (d.length === 10 ? "T00:00:00" : "")).toLocaleDateString("da-DK") : "—");

function taeller(data: any): number | null {
  if (!data || typeof data !== "object") return null;
  for (const k of ["taellerstand", "tællerstand", "taeller", "tæller"]) {
    const v = data[k];
    if (v == null || v === "") continue;
    const n = Number(String(v).replace(/[^\d.,-]/g, "").replace(/\./g, "").replace(",", "."));
    if (Number.isFinite(n)) return n;
  }
  return null;
}

async function hentRaekker(companyId: string, kunLok?: string[]) {
  const { data: alleLocs, error } = await supabase
    .from("locations")
    .select("id, address, zip, city, visma_delivery_no, is_primary, afdeling_nr")
    .eq("company_id", companyId);
  if (error) throw error;
  const locs = kunLok ? (alleLocs ?? []).filter((l) => kunLok.includes(l.id)) : alleLocs;
  const locIds = (locs ?? []).map((l) => l.id);
  const units: any[] = [];
  for (let i = 0; i < locIds.length; i += 200) {
    const { data, error: e } = await (supabase as any)
      .from("location_equipment_units")
      .select("location_id, machine_type, serial_no, sub_location, agreement_type, is_free_loan, has_service_contract, is_filter")
      .in("location_id", locIds.slice(i, i + 200));
    if (e) throw e;
    units.push(...(data ?? []));
  }
  const serials = Array.from(new Set(units.map((u) => (u.serial_no ?? "").trim()).filter(Boolean)));
  const enr = new Map<string, any>();
  const mask = new Map<string, any>();
  for (let i = 0; i < serials.length; i += 200) {
    const del = serials.slice(i, i + 200);
    const [{ data }, { data: m }] = await Promise.all([
      (supabase as any)
        .from("machine_enrichment")
        .select("serienr, taelleraflaesning, binding_ophor, beregnet_slutdato, aftale_type, data")
        .eq("record_status", "aktiv")
        .in("serienr", del),
      (supabase as any).from("machines").select("serienr, udlanstype, beskrivelse").eq("record_status", "aktiv").in("serienr", del),
    ]);
    for (const e of data ?? []) enr.set(String(e.serienr), e);
    // Vandfiltre i maskinregistret står på maskinens serienr. — de må ikke give maskinen filtrets udlånstype.
    for (const x of m ?? []) {
      if (!x.udlanstype) continue;
      const filter = /brita|filter/i.test(x.beskrivelse ?? "");
      const k = String(x.serienr);
      if (!filter || !mask.has(k)) mask.set(k, { ...x, filter });
      else if (mask.get(k).filter && !filter) mask.set(k, { ...x, filter });
    }
  }
  const plac = await hentPlaceringer(serials);
  const { data: lj } = await (supabase as any).rpc("lokationer_med_leje", { _location_ids: locIds });
  const leje = new Set<string>(((lj ?? []) as any[]).map((x) => String(typeof x === "string" ? x : x.lokationer_med_leje ?? x)));
  // Fakturajournalens "Aflæs Tællerstand NNN" har intet serienr. Den bruges kun, hvor
  // kontoen har præcis én maskine med tæller — ellers kan den ikke kobles sikkert.
  const fakturaAflaesning = new Map<string, { n: number; dato: string }>();
  for (const l of locs ?? []) {
    if (!l.visma_delivery_no) continue;
    const medTaeller = units.filter((u) => u.location_id === l.id && (u.serial_no ?? "").trim() && taeller(enr.get(u.serial_no.trim())?.data) != null);
    if (medTaeller.length !== 1) continue;
    let q = (supabase as any).from("invoice_lines").select("faktura_dato, varetekst").eq("visma_delivery_no", l.visma_delivery_no).ilike("varetekst", "Aflæs Tællerstand%").order("faktura_dato", { ascending: false }).limit(1);
    if ((l as any).afdeling_nr != null) q = q.eq("afdeling_nr", (l as any).afdeling_nr);
    const { data: il } = await q;
    const x = (il ?? [])[0];
    const n = x ? Number(String(x.varetekst).replace(/\D/g, "")) : NaN;
    if (x && Number.isFinite(n) && n > 0) fakturaAflaesning.set(medTaeller[0].serial_no.trim(), { n, dato: x.faktura_dato });
  }
  return { locs: locs ?? [], units, enr, mask, plac, leje, fakturaAflaesning };
}

export type MaskinlisteAdresse = { key: string; label: string; locIds: string[]; egen: boolean };

export function UdskrivMaskinlisteKnap({
  company,
  locationIds,
  adresser,
  label = "Maskinliste til kunde (PDF)",
  lille = false,
}: {
  company: { id: string; name: string; cvr?: string | null };
  /** Fast udvalg af lokationer (fx én adresse). */
  locationIds?: string[];
  /** Når sat, vælger brugeren adresser i en dialog (egne valgt som standard). */
  adresser?: MaskinlisteAdresse[];
  label?: string;
  lille?: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [dlg, setDlg] = useState(false);
  const [valgt, setValgt] = useState<Set<string>>(new Set());

  const aabnDialog = () => {
    const egne = (adresser ?? []).filter((a) => a.egen);
    setValgt(new Set((egne.length ? egne : adresser ?? []).map((a) => a.key)));
    setDlg(true);
  };

  const udskriv = async (kunLok?: string[]) => {
    // Åbn vinduet straks (inden for klikket), så pop-up-blokering ikke slår til.
    const w = window.open("", "_blank");
    if (!w) return toast.error("Tillad pop-up-vinduer for at udskrive");
    w.document.write("<p style='font-family:sans-serif'>Henter maskinliste…</p>");
    setBusy(true);
    try {
      const { locs, units, enr, mask, plac, leje, fakturaAflaesning } = await hentRaekker(company.id, kunLok ?? locationIds);
      const idag = new Date();
      const udeladte = new Map<string, number>();
      const pr = new Map<string, MaskinRaekke[]>();
      const samlet = new Map<string, MaskinRaekke>();
      for (const u of units) {
        if (erUdeladt(u.machine_type)) {
          const k = (u.machine_type ?? "").trim();
          udeladte.set(k, (udeladte.get(k) ?? 0) + 1);
          continue;
        }
        const sn = (u.serial_no ?? "").trim();
        const e = sn ? enr.get(sn) : undefined;
        const tilbehoer = !!u.is_filter || erIkkeMaskine(u.machine_type);
        const navn = maskinNavn(String(u.machine_type ?? "").replace(/,\s*L\s*$/, "").replace(/\s+/g, " "));
        let kopper = visKopperVaerdi(taeller(e?.data));
        let aflaest: string | null = e?.taelleraflaesning ?? null;
        const fa = sn ? fakturaAflaesning.get(sn) : undefined;
        if (fa && (!aflaest || fa.dato > aflaest) && fa.n >= (kopper ?? 0)) {
          kopper = visKopperVaerdi(fa.n);
          aflaest = fa.dato;
        }
        const aftale = u.is_filter
          ? "Gratis udlån"
          : maskinAftale({ g4: e?.aftale_type, udlaanstype: mask.get(sn)?.udlanstype ?? (u.is_free_loan ? "4 [Udlån]" : null), lejelinjer: leje.has(u.location_id), gratisUdlaan: !!u.is_free_loan });
        if (!sn) {
          // Udstyr uden serienr. samles pr. type på én linje med antal.
          const k = `${u.location_id}|${navn}|${aftale}`;
          const fx = samlet.get(k);
          if (fx) { fx.antal = (fx.antal ?? 1) + 1; continue; }
        }
        const r: MaskinRaekke = {
          maskintype: navn,
          tilbehoer,
          antal: 1,
          serienr: u.serial_no ?? "",
          placering: plac.get(sn)?.placering ?? "",
          aftale,
          udloeber: e?.binding_ophor ?? null,
          kopper,
          aflaest,
          service: false,
          reservedele: reservedeleStatus(e?.data?.reservedele, e?.data?.reservedele_efter, idag)?.kort ?? null,
        };
        if (!sn) samlet.set(`${u.location_id}|${navn}|${aftale}`, r);
        const arr = pr.get(u.location_id) ?? [];
        arr.push(r);
        pr.set(u.location_id, arr);
      }
      // Kun maskiner med reelt ukendt aftale og uden aflæsning — aldrig tilbehør/udlånt udstyr.
      const erTom = (r: MaskinRaekke) => !r.tilbehoer && r.aftale === "Ukendt" && r.kopper == null;
      const optael = (rows: MaskinRaekke[]) => {
        const m = rows.filter((r) => !r.tilbehoer).reduce((s, r) => s + (r.antal ?? 1), 0);
        const t = rows.filter((r) => r.tilbehoer).reduce((s, r) => s + (r.antal ?? 1), 0);
        return `${m} ${m === 1 ? "maskine" : "maskiner"}${t ? ` + ${t} stk. tilbehør og filtre` : ""}`;
      };
      type Grp = { adr: string; primaer: boolean; konti: string[]; rows: MaskinRaekke[] };
      const lavGrupper = (medTomme: boolean) => {
        const grupper = new Map<string, Grp>();
        for (const l of locs) {
          const rows = (pr.get(l.id) ?? []).filter((r) => medTomme || !erTom(r));
          if (!rows.length) continue;
          const adr = lokAdresse(l) ?? "Lokation";
          const key = (adresseNoegle(l.address) ?? adr) + "|" + (l.zip ?? "");
          const g = grupper.get(key) ?? { adr, primaer: false, konti: [], rows: [] };
          g.primaer ||= !!l.is_primary;
          if (l.visma_delivery_no && !g.konti.includes(l.visma_delivery_no)) g.konti.push(l.visma_delivery_no);
          g.rows.push(...rows);
          grupper.set(key, g);
        }
        return [...grupper.values()].sort((a, b) =>
          a.primaer === b.primaer ? a.adr.localeCompare(b.adr, "da") : a.primaer ? -1 : 1,
        );
      };
      const render = (medTomme: boolean) => {
        const gl = lavGrupper(medTomme);
        const alle = gl.flatMap((g) => g.rows);
        const visUdloeber = alle.some((r) => r.udloeber);
        const visKopper = alle.some((r) => r.kopper != null);
        const visPlacering = alle.some((r) => r.placering.trim());
        const visAftale = alle.some((r) => r.aftale !== "Ukendt");
        const visRd = alle.some((r) => r.reservedele);
        const status = (r: MaskinRaekke) => udloebStatus(r.udloeber, idag);
        const nogenMarkeret = alle.some((r) => status(r));
        const nogenAeldre = alle.some((r) => r.kopper != null && r.aflaest && aeldreAflaesning(r.aflaest, idag));
        const kol: { navn: string; bredde: string; cls?: string }[] = [
          { navn: "Maskine", bredde: "22.5%" },
          { navn: "Serienr.", bredde: "11.5%" },
          ...(visPlacering ? [{ navn: "Placering i bygningen", bredde: "10%" }] : []),
          ...(visAftale ? [{ navn: "Aftale", bredde: "19%" }] : []),
          ...(visUdloeber ? [{ navn: "Binding ophører", bredde: "12%", cls: "nw" }] : []),
          ...(visRd ? [{ navn: "Reservedele", bredde: "10%", cls: "nw" }] : []),
          ...(visKopper ? [{ navn: "Kopper · aflæst", bredde: "17%", cls: "num nw" }] : []),
        ];
        const sektioner = gl
          .map((g) => {
            const rows = sorterMaskiner(g.rows)
              .map((r) => {
                const st = status(r);
                const etiket = st === "udloebet" ? " <b>· udløbet</b>" : st === "snart" ? " <b>· udløber snart</b>" : "";
                const kop =
                  r.kopper != null
                    ? `${r.kopper.toLocaleString("da-DK")}${r.aflaest ? ` · ${fmtDato(r.aflaest)}${aeldreAflaesning(r.aflaest, idag) ? "*" : ""}` : ""}`
                    : "—";
                const celler = [
                  `<td>${esc(r.maskintype)}${(r.antal ?? 1) > 1 ? ` <b>×${r.antal}</b>` : ""}</td>`,
                  `<td class="nw">${esc(r.serienr || "—")}</td>`,
                  visPlacering ? `<td>${esc(r.placering || "—")}</td>` : "",
                  visAftale ? `<td>${esc(r.aftale)}</td>` : "",
                  visUdloeber ? `<td>${fmtDato(r.udloeber)}${etiket}</td>` : "",
                  visRd ? `<td>${esc(r.reservedele || "—")}</td>` : "",
                  visKopper ? `<td class="num nw">${kop}</td>` : "",
                ].join("");
                return `<tr class="${st ?? ""}">${celler}</tr>`;
              })
              .join("");
            return `<tbody class="grp"><tr class="adr"><th colspan="${kol.length}">${esc(g.adr)}${
              g.konti.length ? `<div class="konti">Kundenr. ${esc(g.konti.join(", "))} · ${optael(g.rows)}</div>` : ""
            }</th></tr>${rows}</tbody>`;
          })
          .join("");
        const tabel = sektioner
          ? `<table><colgroup>${kol.map((k) => `<col style="width:${k.bredde}">`).join("")}</colgroup><thead><tr>${kol
              .map((k) => `<th class="${k.cls ?? ""}">${k.navn}</th>`)
              .join("")}</tr></thead>${sektioner}</table>`
          : "<p>Ingen maskiner registreret på virksomheden.</p>";
        const hoved = `<header><div><h1>${esc(company.name)}</h1><div class="meta">${company.cvr ? `CVR ${esc(company.cvr)} · ` : ""}Maskinliste pr. ${idag.toLocaleDateString("da-DK")} · ${optael(alle)}</div>
${nogenMarkeret ? `<div class="meta">Markeret = bindingen er udløbet eller udløber inden for 6 måneder</div>` : ""}</div>
<img src="${LOGO_SRC}" alt="Frellsen"></header>`;
        const fod = nogenAeldre ? `<p class="fod">* aflæst for over 12 måneder siden</p>` : "";
        return hoved + tabel + fod;
      };
      if (udeladte.size) console.info("Maskinliste: udeladt (ikke maskiner)", Object.fromEntries(udeladte));
      const udenTomme = render(false);
      const medTomme = render(true);
      const html = `<!doctype html><html lang="da"><head><meta charset="utf-8"><title>Maskinliste – ${esc(company.name)}</title>
<style>
@page { size: A4; margin: 14mm; }
body { font-family: Helvetica, Arial, sans-serif; font-size: 9pt; color: #111; margin: 0; padding: 16px; }
header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #111; padding-bottom: 8px; margin-bottom: 12px; }
header img { height: 40px; }
h1 { font-size: 16pt; margin: 0 0 2px; }
table { width: 100%; border-collapse: collapse; table-layout: fixed; }
thead { display: table-header-group; }
th, td { text-align: left; padding: 4px 5px; border-bottom: 1px solid #ccc; vertical-align: top; overflow-wrap: anywhere; }
thead th { background: #eee; font-size: 8pt; }
tr.adr th { font-size: 10.5pt; padding-top: 14px; border-bottom: 1.5px solid #111; break-after: avoid; page-break-after: avoid; }
.konti { font-weight: normal; font-size: 8pt; color: #555; }
.num { text-align: right; }
tr.snart td, tr.udloebet td { background: #fff1d6; }
.nw { white-space: nowrap; overflow-wrap: normal; }
.fod { font-size: 8pt; color: #444; margin-top: 10px; }
tbody.grp { break-inside: auto; }
tr { break-inside: avoid; page-break-inside: avoid; }
.meta { color: #444; font-size: 9pt; }
.noprint { margin-bottom: 12px; }
@media print { .noprint { display: none; } body { padding: 0; } }
</style></head><body>
<div class="noprint"><label><input type="checkbox" id="medtomme"> Medtag maskiner med ukendt aftale og uden aflæsning</label> <button onclick="window.print()">Udskriv</button></div>
<div id="indhold">${udenTomme}</div>
<script>var V={uden:${JSON.stringify(udenTomme).replace(/</g, "\\u003c")},med:${JSON.stringify(medTomme).replace(/</g, "\\u003c")}};document.getElementById("medtomme").onchange=function(e){document.getElementById("indhold").innerHTML=e.target.checked?V.med:V.uden};</script>
</body></html>`;
      w.document.open();
      w.document.write(html);
      w.document.close();
    } catch (e) {
      w.close();
      toast.error("Kunne ikke hente maskinlisten: " + (e instanceof Error ? e.message : ""));
    } finally {
      setBusy(false);
    }
  };

  const ikon = busy ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Printer className="h-4 w-4 mr-2" />;
  if (lille)
    return (
      <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => udskriv()} disabled={busy}>
        {ikon}
        {label}
      </Button>
    );
  return (
    <>
      <Button variant="outline" size="sm" onClick={() => (adresser?.length ? aabnDialog() : udskriv())} disabled={busy}>
        {ikon}
        {label}
      </Button>
      {adresser && (
        <Dialog open={dlg} onOpenChange={setDlg}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Maskinliste til kunde</DialogTitle>
            </DialogHeader>
            <div className="flex gap-3 text-xs">
              <button type="button" className="underline" onClick={() => setValgt(new Set(adresser.map((a) => a.key)))}>Vælg alle</button>
              <button type="button" className="underline" onClick={() => setValgt(new Set(adresser.filter((a) => a.egen).map((a) => a.key)))}>Kun mine</button>
              <button type="button" className="underline" onClick={() => setValgt(new Set())}>Ingen</button>
            </div>
            <div className="max-h-[50vh] overflow-y-auto space-y-1">
              {adresser.map((a) => (
                <label key={a.key} className="flex items-center gap-2 text-sm py-1">
                  <Checkbox
                    checked={valgt.has(a.key)}
                    onCheckedChange={(c) => {
                      const n = new Set(valgt);
                      c ? n.add(a.key) : n.delete(a.key);
                      setValgt(n);
                    }}
                  />
                  <span>{a.label}</span>
                  {a.egen && <span className="text-xs text-muted-foreground">(din)</span>}
                </label>
              ))}
            </div>
            <DialogFooter>
              <Button
                disabled={!valgt.size || busy}
                onClick={() => {
                  const ids = adresser.filter((a) => valgt.has(a.key)).flatMap((a) => a.locIds);
                  setDlg(false);
                  void udskriv(ids);
                }}
              >
                Lav maskinliste ({valgt.size} adresser)
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}
