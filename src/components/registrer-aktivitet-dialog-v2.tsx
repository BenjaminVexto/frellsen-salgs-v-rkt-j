import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { MentionTextarea } from "@/components/mention-textarea";
import {
  fetchMentionableUsers,
  createMentionNotifications,
  type MentionableUser,
} from "@/lib/mentions";
import { ACTIVITY_TYPES, type ActivityTypeKey } from "@/lib/activity-types";
import { ArrowLeft, CalendarIcon, Mic } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { da } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { useViewAs } from "@/contexts/view-as-context";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  companyId: string;
  userId: string;
  /** Forvalgt type → spring trin 1 over */
  presetType?: ActivityTypeKey | null;
  /** Valgfri lokation-id at sætte på aktiviteten */
  locationId?: string | null;
  onSaved?: () => void;
}

export function RegistrerAktivitetDialogV2({
  open,
  onOpenChange,
  companyId,
  userId,
  presetType = null,
  locationId = null,
  onSaved,
}: Props) {
  const [step, setStep] = useState<1 | 2>(presetType ? 2 : 1);
  const [type, setType] = useState<ActivityTypeKey | null>(presetType);
  const [note, setNote] = useState("");
  const [followUpDate, setFollowUpDate] = useState<Date | undefined>();
  const [users, setUsers] = useState<MentionableUser[]>([]);
  const [saving, setSaving] = useState(false);
  const { isImpersonating, viewAsName } = useViewAs();

  useEffect(() => {
    if (open && isImpersonating) {
      toast.error(`Read-only — du ser som ${viewAsName ?? "en anden sælger"}. Aktiviteter kan ikke registreres.`);
      onOpenChange(false);
    }
  }, [open, isImpersonating, viewAsName, onOpenChange]);

  useEffect(() => {
    if (open) {
      setType(presetType);
      setStep(presetType ? 2 : 1);
      setNote("");
      setFollowUpDate(undefined);
      fetchMentionableUsers(userId).then(setUsers);
    }
  }, [open, presetType, userId]);

  // Vis dato-vælger automatisk for "opfølgning_aftalt"
  const showFollowUpHint = type === "opfølgning_aftalt";

  function pickType(key: ActivityTypeKey) {
    setType(key);
    setStep(2);
  }

  async function save() {
    if (!type) return;
    if (isImpersonating) {
      toast.error("Read-only — handling ikke tilladt");
      return;
    }
    setSaving(true);
    const trimmed = note.trim();
    const { data: inserted, error } = await supabase
      .from("activities")
      .insert({
        company_id: companyId,
        created_by: userId,
        activity_type: type as any,
        note: trimmed || null,
        next_followup_date: followUpDate ? format(followUpDate, "yyyy-MM-dd") : null,
        location_id: locationId || null,
      } as any)
      .select("id")
      .single();
    if (error) {
      toast.error("Kunne ikke gemme: " + error.message);
      setSaving(false);
      return;
    }
    if (trimmed) {
      const n = await createMentionNotifications({
        note: trimmed,
        users,
        senderId: userId,
        companyId,
        activityId: inserted?.id ?? null,
      });
      if (n > 0) {
        toast.success(`${n} ${n === 1 ? "kollega" : "kolleger"} notificeret`);
      }
    }
    toast.success("Aktivitet registreret");
    setSaving(false);
    onOpenChange(false);
    onSaved?.();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg p-0 gap-0 sm:rounded-lg">
        <DialogHeader className="px-5 pt-5 pb-3 border-b">
          <DialogTitle className="flex items-center gap-2">
            {step === 2 && !presetType && (
              <button
                onClick={() => setStep(1)}
                className="text-muted-foreground hover:text-foreground"
                aria-label="Tilbage"
              >
                <ArrowLeft className="h-4 w-4" />
              </button>
            )}
            {step === 1 ? "Vælg aktivitetstype" : "Registrér aktivitet"}
          </DialogTitle>
        </DialogHeader>

        {step === 1 ? (
          <div className="p-4 grid grid-cols-2 gap-3">
            {ACTIVITY_TYPES.map(({ key, label, Icon, color, bg }) => (
              <button
                key={key}
                onClick={() => pickType(key)}
                className="flex flex-col items-center justify-center gap-2 rounded-lg border bg-card p-4 min-h-[100px] hover:bg-accent active:scale-95 transition-all"
              >
                <div className={cn("h-10 w-10 rounded-full flex items-center justify-center", bg)}>
                  <Icon className={cn("h-5 w-5", color)} />
                </div>
                <span className="text-sm font-medium text-center leading-tight">{label}</span>
              </button>
            ))}
          </div>
        ) : (
          <div className="p-4 space-y-4">
            {type && (() => {
              const def = ACTIVITY_TYPES.find((t) => t.key === type)!;
              const Icon = def.Icon;
              return (
                <div className="flex items-center gap-2 text-sm">
                  <div className={cn("h-8 w-8 rounded-full flex items-center justify-center", def.bg)}>
                    <Icon className={cn("h-4 w-4", def.color)} />
                  </div>
                  <span className="font-medium">{def.label}</span>
                </div>
              );
            })()}
            <div>
              <Label className="mb-1.5 flex items-center gap-2 text-xs text-muted-foreground">
                <Mic className="h-3.5 w-3.5" />
                Note — tryk på mikrofonen på tastaturet for at diktere · @ for at tagge
              </Label>
              <MentionTextarea
                value={note}
                onChange={setNote}
                users={users}
                rows={6}
                placeholder="Hvad skete der?"
              />
            </div>
            {(showFollowUpHint || followUpDate) && (
              <div>
                <Label className="mb-1.5 block">Opfølgningsdato {showFollowUpHint && <span className="text-muted-foreground text-xs">(anbefalet)</span>}</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn(
                        "w-full justify-start text-left font-normal",
                        !followUpDate && "text-muted-foreground",
                      )}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {followUpDate
                        ? format(followUpDate, "d. MMMM yyyy", { locale: da })
                        : "Vælg dato"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={followUpDate}
                      onSelect={setFollowUpDate}
                      initialFocus
                      locale={da}
                      className="p-3 pointer-events-auto"
                    />
                  </PopoverContent>
                </Popover>
              </div>
            )}
            {!showFollowUpHint && !followUpDate && (
              <button
                onClick={() => setFollowUpDate(new Date())}
                className="text-xs text-primary hover:underline"
                type="button"
              >
                + Tilføj opfølgningsdato
              </button>
            )}

            <Button
              onClick={save}
              disabled={saving}
              size="lg"
              className="w-full h-12 text-base"
            >
              {saving ? "Gemmer…" : "Gem aktivitet"}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
