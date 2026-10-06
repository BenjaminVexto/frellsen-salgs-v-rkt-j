import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Printer, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { FRELLSEN_LOGO_BASE64 } from "@/lib/frellsen-logo-base64";
import { aftaleLabel, sorterMaskiner, udloeberSnart, type MaskinRaekke } from "@/lib/maskinliste";

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

async function hentRaekker(companyId: string) {
  const { data: locs, error } = await supabase
    .from("locations")
    .select("id, address, zip, city, visma_delivery_no, is_primary")
    .eq("company_id", companyId);
  if (error) throw error;
  const locIds = (locs ?? []).map((l) => l.id);
  const units: any[] = [];
  for (let i = 0; i < locIds.length; i += 200) {
    const { data, error: e } = await (supabase as any)
      .from("location_equipment_units")
      .select("location_id, machine_type, serial_no, sub_location, agreement_type, is_free_loan, has_service_contract, is_filter")
      .in("location_id", locIds.slice(i, i + 200))
      .eq("is_filter", false);
    if (e) throw e;
    units.push(...(data ?? []));
  }
  const serials = Array.from(new Set(units.map((u) => (u.serial_no ?? "").trim()).filter(Boolean)));
  const enr = new Map<string, any>();
  for (let i = 0; i < serials.length; i += 200) {
    const { data } = await (supabase as any)
      .from("machine_enrichment")
      .select("serienr, taelleraflaesning, binding_ophor, beregnet_slutdato, aftale_type, data")
      .eq("record_status", "aktiv")
      .in("serienr", serials.slice(i, i + 200));
    for (const e of data ?? []) enr.set(String(e.serienr), e);
  }
  return { locs: locs ?? [], units, enr };
}

export function UdskrivMaskinlisteKnap({
  company,
}: {
  company: { id: string; name: string; cvr?: string | null };
}) {
  const [busy, setBusy] = useState(false);

  const udskriv = async () => {
    // Åbn vinduet straks (inden for klikket), så pop-up-blokering ikke slår til.
    const w = window.open("", "_blank");
    if (!w) return toast.error("Tillad pop-up-vinduer for at udskrive");
    w.document.write("<p style='font-family:sans-serif'>Henter maskinliste…</p>");
    setBusy(true);
    try {
      const { locs, units, enr } = await hentRaekker(company.id);
      const idag = new Date();
      const pr = new Map<string, MaskinRaekke[]>();
      for (const u of units) {
        const e = enr.get((u.serial_no ?? "").trim());
        const r: MaskinRaekke = {
          maskintype: u.machine_type ?? "—",
          serienr: u.serial_no ?? "",
          placering: u.sub_location ?? "",
          aftale: aftaleLabel(u.agreement_type ?? e?.aftale_type, !!u.is_free_loan),
          udloeber: e?.binding_ophor ?? e?.beregnet_slutdato ?? null,
          kopper: taeller(e?.data),
          aflaest: e?.taelleraflaesning ?? null,
          service: !!u.has_service_contract,
        };
        const arr = pr.get(u.location_id) ?? [];
        arr.push(r);
        pr.set(u.location_id, arr);
      }
      const sorteredeLok = [...locs]
        .filter((l) => pr.has(l.id))
        .sort((a, b) => (a.is_primary === b.is_primary ? (a.address ?? "").localeCompare(b.address ?? "", "da") : a.is_primary ? -1 : 1));
      const sektioner = sorteredeLok
        .map((l) => {
          const rows = sorterMaskiner(pr.get(l.id)!)
            .map((r) => {
              const snart = udloeberSnart(r.udloeber, idag);
              return `<tr class="${snart ? "snart" : ""}">
<td>${esc(r.maskintype)}</td><td>${esc(r.serienr || "—")}</td><td>${esc(r.placering || "—")}</td>
<td>${esc(r.aftale)}</td><td>${fmtDato(r.udloeber)}${snart ? " <b>⚠ udløber snart</b>" : ""}</td>
<td class="num">${r.kopper != null ? r.kopper.toLocaleString("da-DK") : "—"}${r.aflaest ? `<br><small>${fmtDato(r.aflaest)}</small>` : ""}</td>
<td>${r.service ? "Ja" : "Nej"}</td></tr>`;
            })
            .join("");
          const adr = [l.address, [l.zip, l.city].filter(Boolean).join(" ")].filter(Boolean).join(", ");
          return `<section><h2>${esc(adr || "Lokation")}${l.visma_delivery_no ? ` <small>· Lev.nr. ${esc(l.visma_delivery_no)}</small>` : ""}</h2>
<table><thead><tr><th>Maskine</th><th>Serienr.</th><th>Placering</th><th>Aftale</th><th>Udløber</th><th class="num">Antal kopper</th><th>Service</th></tr></thead><tbody>${rows}</tbody></table></section>`;
        })
        .join("");
      const html = `<!doctype html><html lang="da"><head><meta charset="utf-8"><title>Maskinliste – ${esc(company.name)}</title>
<style>
@page { size: A4; margin: 14mm; }
body { font-family: Helvetica, Arial, sans-serif; font-size: 10pt; color: #111; margin: 0; padding: 16px; }
header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #111; padding-bottom: 8px; margin-bottom: 12px; }
header img { height: 40px; }
h1 { font-size: 16pt; margin: 0 0 2px; }
h2 { font-size: 11pt; margin: 16px 0 4px; }
h2 small { font-weight: normal; color: #555; }
table { width: 100%; border-collapse: collapse; }
th, td { text-align: left; padding: 4px 6px; border-bottom: 1px solid #ccc; vertical-align: top; }
th { background: #f0f0f0; font-size: 9pt; }
.num { text-align: right; }
tr.snart td { background: #fff1d6; }
section { break-inside: avoid-page; }
tr { break-inside: avoid; }
.meta { color: #444; font-size: 9pt; }
.noprint { margin-bottom: 12px; }
@media print { .noprint { display: none; } body { padding: 0; } }
</style></head><body>
<div class="noprint"><button onclick="window.print()">Udskriv</button></div>
<header><div><h1>${esc(company.name)}</h1><div class="meta">${company.cvr ? `CVR ${esc(company.cvr)} · ` : ""}Maskinliste pr. ${idag.toLocaleDateString("da-DK")} · ${units.length} maskiner</div>
<div class="meta">Markeret = aftalen udløber inden for 6 måneder</div></div>
<img src="data:image/png;base64,${FRELLSEN_LOGO_BASE64}" alt="Frellsen"></header>
${sektioner || "<p>Ingen maskiner registreret på virksomheden.</p>"}
<script>window.onload=function(){setTimeout(function(){window.print()},300)}</script>
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

  return (
    <Button variant="outline" size="sm" onClick={udskriv} disabled={busy}>
      {busy ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Printer className="h-4 w-4 mr-2" />}
      Udskriv maskinliste
    </Button>
  );
}
