import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Bell, Loader2 } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { da } from "date-fns/locale";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

type NotificationRow = {
  id: string;
  sender_id: string;
  company_id: string;
  activity_id: string | null;
  message: string;
  is_read: boolean;
  created_at: string;
};

type Enriched = NotificationRow & {
  sender_name: string;
  company_name: string;
};

interface Props {
  userId: string;
  onUnreadCountChange?: (n: number) => void;
}

export function NotificationBell({ userId, onUnreadCountChange }: Props) {
  const navigate = useNavigate();
  const [items, setItems] = useState<Enriched[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const { data: notes } = await supabase
      .from("notifications")
      .select("*")
      .eq("recipient_id", userId)
      .order("created_at", { ascending: false })
      .limit(50);
    const rows = (notes ?? []) as NotificationRow[];

    const senderIds = Array.from(new Set(rows.map((r) => r.sender_id)));
    const companyIds = Array.from(new Set(rows.map((r) => r.company_id)));

    const [profilesRes, companiesRes] = await Promise.all([
      senderIds.length
        ? supabase
            .from("profiles")
            .select("id, full_name")
            .in("id", senderIds)
        : Promise.resolve({ data: [] as any[] }),
      companyIds.length
        ? supabase
            .from("companies")
            .select("id, name")
            .in("id", companyIds)
        : Promise.resolve({ data: [] as any[] }),
    ]);
    const pMap = new Map(
      (profilesRes.data ?? []).map((p: any) => [p.id, p.full_name as string]),
    );
    const cMap = new Map(
      (companiesRes.data ?? []).map((c: any) => [c.id, c.name as string]),
    );

    const enriched: Enriched[] = rows.map((r) => ({
      ...r,
      sender_name: pMap.get(r.sender_id) ?? "Ukendt kollega",
      company_name: cMap.get(r.company_id) ?? "Virksomhed",
    }));
    setItems(enriched);
    setLoading(false);
    const unread = enriched.filter((e) => !e.is_read).length;
    onUnreadCountChange?.(unread);
  }, [userId, onUnreadCountChange]);

  useEffect(() => {
    load();
    const t = setInterval(load, 60_000);
    return () => clearInterval(t);
  }, [load]);

  const unreadCount = items.filter((i) => !i.is_read).length;

  async function markAllRead() {
    const ids = items.filter((i) => !i.is_read).map((i) => i.id);
    if (!ids.length) return;
    await supabase
      .from("notifications")
      .update({ is_read: true })
      .in("id", ids);
    load();
  }

  async function openNotification(n: Enriched) {
    if (!n.is_read) {
      await supabase
        .from("notifications")
        .update({ is_read: true })
        .eq("id", n.id);
    }
    setOpen(false);
    const hash = n.activity_id ? `#activity-${n.activity_id}` : "";
    navigate({
      to: "/virksomheder/$id",
      params: { id: n.company_id },
      hash: hash.slice(1) || undefined,
    });
    load();
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="relative text-primary-foreground hover:bg-primary-foreground/10"
          aria-label="Notifikationer"
        >
          <Bell className="h-5 w-5" />
          {unreadCount > 0 && (
            <Badge
              variant="destructive"
              className="absolute -top-1 -right-1 h-5 min-w-5 px-1 text-[10px] flex items-center justify-center rounded-full"
            >
              {unreadCount > 99 ? "99+" : unreadCount}
            </Badge>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-96 p-0 max-h-[28rem] flex flex-col">
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <div className="font-semibold text-sm">Notifikationer</div>
          {unreadCount > 0 && (
            <button
              onClick={markAllRead}
              className="text-xs text-primary hover:underline"
            >
              Marker alle som læst
            </button>
          )}
        </div>
        <div className="overflow-y-auto divide-y">
          {loading && items.length === 0 ? (
            <div className="p-6 flex items-center justify-center text-muted-foreground text-sm">
              <Loader2 className="h-4 w-4 animate-spin mr-2" /> Indlæser…
            </div>
          ) : items.length === 0 ? (
            <p className="p-6 text-sm text-muted-foreground text-center">
              Ingen notifikationer endnu.
            </p>
          ) : (
            items.map((n) => (
              <button
                key={n.id}
                onClick={() => openNotification(n)}
                className={cn(
                  "w-full text-left px-4 py-3 hover:bg-accent/60 transition-colors flex gap-3",
                  n.is_read ? "bg-muted/40" : "bg-background",
                )}
              >
                <span className="inline-flex flex-shrink-0 items-center justify-center h-9 w-9 rounded-full bg-primary/15 text-primary text-sm font-semibold">
                  {n.sender_name
                    .split(/\s+/)
                    .map((s) => s[0])
                    .slice(0, 2)
                    .join("")
                    .toUpperCase()}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-sm">
                    <span className="font-medium">{n.sender_name}</span>
                    <span className="text-muted-foreground"> · </span>
                    <span className="text-primary">{n.company_name}</span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                    {n.message}
                  </p>
                  <div className="text-[11px] text-muted-foreground mt-1">
                    {formatDistanceToNow(new Date(n.created_at), {
                      locale: da,
                      addSuffix: true,
                    })}
                  </div>
                </div>
                {!n.is_read && (
                  <span className="self-start mt-1.5 h-2 w-2 rounded-full bg-primary flex-shrink-0" />
                )}
              </button>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
