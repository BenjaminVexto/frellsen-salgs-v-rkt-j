import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import {
  dismissChurningCustomer,
  listCompetitorsForSelect,
} from "@/lib/sales.functions";

type Reason = "lost_competitor" | "lost_tender" | "closed" | "paused";

export function DismissChurnDialog({
  open,
  onOpenChange,
  companyId,
  companyName,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  companyId: string;
  companyName: string;
}) {
  const [reason, setReason] = useState<Reason>("lost_competitor");
  const [competitorId, setCompetitorId] = useState<string>("");
  const [expectedDate, setExpectedDate] = useState<string>("");
  const [snoozeDays, setSnoozeDays] = useState<string>("30");
  const qc = useQueryClient();

  const listFn = useServerFn(listCompetitorsForSelect);
  const competitorsQ = useQuery({
    queryKey: ["competitors-select"],
    queryFn: () => listFn({}),
    enabled: open,
  });

  const dismissFn = useServerFn(dismissChurningCustomer);
  const mut = useMutation({
    mutationFn: () =>
      dismissFn({
        data: {
          company_id: companyId,
          reason,
          competitor_id:
            reason === "lost_competitor" || reason === "lost_tender"
              ? competitorId || null
              : null,
          expected_date:
            (reason === "lost_competitor" || reason === "lost_tender") && expectedDate
              ? expectedDate
              : null,
          snooze_days: reason === "paused" ? Number(snoozeDays) : null,
        },
      }),
    onSuccess: () => {
      toast.success("Kunden er fjernet fra listen");
      qc.invalidateQueries({ queryKey: ["my-churning"] });
      onOpenChange(false);
      setCompetitorId("");
      setExpectedDate("");
      setSnoozeDays("30");
      setReason("lost_competitor");
    },
    onError: (e: any) => toast.error(e?.message ?? "Kunne ikke gemme"),
  });

  const needsCompetitor =
    reason === "lost_competitor" || reason === "lost_tender";
  const canSubmit = !needsCompetitor || !!competitorId;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Fjern fra "Kunder på vej væk"</DialogTitle>
          <DialogDescription>
            Hvorfor køber <span className="font-medium">{companyName}</span> ikke længere?
          </DialogDescription>
        </DialogHeader>

        <RadioGroup value={reason} onValueChange={(v) => setReason(v as Reason)} className="gap-3">
          <label className="flex items-start gap-3 cursor-pointer">
            <RadioGroupItem value="lost_competitor" className="mt-0.5" />
            <div className="text-sm">Tabt til konkurrent</div>
          </label>
          <label className="flex items-start gap-3 cursor-pointer">
            <RadioGroupItem value="lost_tender" className="mt-0.5" />
            <div className="text-sm">Tabt udbud</div>
          </label>
          <label className="flex items-start gap-3 cursor-pointer">
            <RadioGroupItem value="closed" className="mt-0.5" />
            <div className="text-sm">Kunde ophørt / lukket</div>
          </label>
          <label className="flex items-start gap-3 cursor-pointer">
            <RadioGroupItem value="paused" className="mt-0.5" />
            <div className="text-sm">Midlertidig pause (skjul fra min liste)</div>
          </label>
        </RadioGroup>

        {needsCompetitor && (
          <div className="space-y-3 pt-2">
            <div>
              <Label className="text-xs">Konkurrent</Label>
              <Select value={competitorId} onValueChange={setCompetitorId}>
                <SelectTrigger>
                  <SelectValue placeholder="Vælg konkurrent…" />
                </SelectTrigger>
                <SelectContent>
                  {(competitorsQ.data?.competitors ?? []).map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">
                {reason === "lost_tender" ? "Genudbud-dato (valgfri)" : "Udløbsdato (valgfri)"}
              </Label>
              <Input
                type="date"
                value={expectedDate}
                onChange={(e) => setExpectedDate(e.target.value)}
              />
            </div>
          </div>
        )}

        {reason === "paused" && (
          <div className="pt-2">
            <Label className="text-xs">Skjul i</Label>
            <Select value={snoozeDays} onValueChange={setSnoozeDays}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="30">30 dage</SelectItem>
                <SelectItem value="60">60 dage</SelectItem>
                <SelectItem value="90">90 dage</SelectItem>
              </SelectContent>
            </Select>
          </div>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Annullér
          </Button>
          <Button
            onClick={() => mut.mutate()}
            disabled={!canSubmit || mut.isPending}
          >
            {mut.isPending ? "Gemmer…" : "Gem og fjern"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
