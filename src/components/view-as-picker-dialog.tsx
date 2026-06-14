import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { listSellers } from "@/lib/admin-users.functions";
import { useViewAs } from "@/contexts/view-as-context";
import { Loader2 } from "lucide-react";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function ViewAsPickerDialog({ open, onOpenChange }: Props) {
  const { isAdmin, setViewAs, viewAsUserId } = useViewAs();
  const fn = useServerFn(listSellers);
  const qc = useQueryClient();
  const [search, setSearch] = useState("");

  const q = useQuery({
    enabled: open && isAdmin,
    queryKey: ["view-as-sellers"],
    queryFn: () => fn(),
    staleTime: 60_000,
  });

  const items = useMemo(() => q.data?.sellers ?? [], [q.data]);

  if (!isAdmin) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="p-0 max-w-md">
        <DialogHeader className="px-4 pt-4 pb-2">
          <DialogTitle>Se som sælger</DialogTitle>
        </DialogHeader>
        <Command shouldFilter={true}>
          <CommandInput
            placeholder="Søg sælger…"
            value={search}
            onValueChange={setSearch}
          />
          <CommandList>
            {q.isLoading && (
              <div className="flex items-center justify-center py-6 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin mr-2" /> Henter sælgere…
              </div>
            )}
            {!q.isLoading && <CommandEmpty>Ingen sælgere fundet.</CommandEmpty>}
            <CommandGroup>
              {items.map((s) => (
                <CommandItem
                  key={s.id}
                  value={`${s.full_name} ${s.region ?? ""}`}
                  onSelect={() => {
                    setViewAs(s.id, s.full_name || "(Ukendt)");
                    onOpenChange(false);
                    // Refetch seller-scoped queries against the new identity
                    void qc.invalidateQueries();
                  }}
                  className={s.id === viewAsUserId ? "bg-accent/50" : ""}
                >
                  <div className="flex flex-col">
                    <span className="text-sm">{s.full_name || "(Ukendt)"}</span>
                    {s.region && (
                      <span className="text-xs text-muted-foreground">{s.region}</span>
                    )}
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </DialogContent>
    </Dialog>
  );
}
