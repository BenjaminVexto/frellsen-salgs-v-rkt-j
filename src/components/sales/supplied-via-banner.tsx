import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getCompanyRelations } from "@/lib/relations.functions";
import { Link } from "@tanstack/react-router";
import { Info } from "lucide-react";

export function SuppliedViaBanner({ companyId }: { companyId: string }) {
  const fn = useServerFn(getCompanyRelations);
  const q = useQuery({
    queryKey: ["relations", companyId],
    queryFn: () => fn({ data: { companyId } }),
  });
  const supplied = (q.data?.confirmed ?? []).filter(
    (r) => r.direction === "out" && r.relation_type === "forsynes_af",
  );
  if (!supplied.length) return null;
  return (
    <div className="rounded-md border border-primary/30 bg-primary/5 p-3 flex items-start gap-2 text-sm">
      <Info className="h-4 w-4 mt-0.5 text-primary shrink-0" />
      <div>
        Forbrugsvarer leveres via{" "}
        {supplied.map((r, i) => (
          <span key={r.id}>
            {i > 0 && ", "}
            <Link
              to="/virksomheder/$id"
              params={{ id: r.other_company_id }}
              className="font-medium underline underline-offset-2 hover:text-primary"
            >
              {r.other_company_name}
            </Link>
          </span>
        ))}{" "}
        (kantineoperatør). Kaffeomsætning bogføres på den konto.
      </div>
    </div>
  );
}
