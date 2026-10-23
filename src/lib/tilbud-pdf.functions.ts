import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { kraevIntern } from "@/lib/kraev-intern";

/** Henter et uploadet tilbuds-PDF som base64. Adgang via brugerens egen RLS (kan se virksomheden), telemarketing afvises af kraevIntern. */
export const hentTilbudPdf = createServerFn({ method: "POST" })
  .middleware([kraevIntern])
  .inputValidator((input: unknown) => z.object({ quote_id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: q } = await context.supabase
      .from("quotes")
      .select("pdf_path, quote_number")
      .eq("id", data.quote_id)
      .maybeSingle();
    if (!q?.pdf_path) throw new Error("Ikke fundet");
    const { data: file, error } = await context.supabase.storage.from("quote-documents").download(q.pdf_path);
    if (error || !file) throw new Error("Kunne ikke hente PDF");
    const buf = new Uint8Array(await file.arrayBuffer());
    let binary = "";
    for (let i = 0; i < buf.length; i += 0x8000) binary += String.fromCharCode(...buf.subarray(i, i + 0x8000));
    return { base64: btoa(binary), filename: `Tilbud ${q.quote_number ?? ""}.pdf`.replace(" .pdf", ".pdf"), content_type: "application/pdf" };
  });
