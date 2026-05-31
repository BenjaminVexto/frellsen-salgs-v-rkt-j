import {
  createFileRoute,
  Outlet,
  Link,
  useNavigate,
  useRouterState,
} from "@tanstack/react-router";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { NotificationBell } from "@/components/notification-bell";
import frellsenLogo from "@/assets/frellsen-logo-white.png";
import { toast } from "sonner";
import {
  LayoutDashboard,
  Building2,
  ListChecks,
  Target,
  Upload,
  BarChart3,
  Users,
  History,
  LogOut,
  Loader2,
  ShieldAlert,
  Lightbulb,
  FileText,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { GlobalImportIndicator } from "@/components/global-import-indicator";

export const Route = createFileRoute("/_authenticated")({
  component: AuthenticatedLayout,
});

function AuthenticatedLayout() {
  const auth = useAuth();
  const navigate = useNavigate();
  const { location } = useRouterState();

  useEffect(() => {
    if (!auth.loading && !auth.session) {
      navigate({ to: "/login" });
    }
  }, [auth.loading, auth.session, navigate]);

  const isAdmin = auth.role === "admin";

  useEffect(() => {
    if (!auth.loading && auth.session && !isAdmin && location.pathname.startsWith("/admin")) {
      navigate({ to: "/dashboard" });
    }
  }, [auth.loading, auth.session, isAdmin, location.pathname, navigate]);

  if (auth.loading || !auth.session) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const navItems = [
    { to: "/dashboard", label: "Mit overblik", shortLabel: "Overblik", icon: LayoutDashboard },
    { to: "/virksomheder", label: "Virksomheder", shortLabel: "Firmaer", icon: Building2 },
    { to: "/aftaler", label: "Aftaler", shortLabel: "Aftaler", icon: FileText },
    { to: "/kontaktlister", label: "Kontaktlister", shortLabel: "Lister", icon: ListChecks },
    { to: "/konkurrenter", label: "Konkurrenter", shortLabel: "Konkur.", icon: ShieldAlert },
    { to: "/salgsmuligheder", label: "Salgsmuligheder", shortLabel: "Salg", icon: Target },
  ];

  const adminItems = [
    { to: "/salgsintelligens", label: "Salgsintelligens", icon: BrainCircuit },
    { to: "/admin/import", label: "Import", icon: Upload },
    { to: "/admin/importhistorik", label: "Importhistorik", icon: History },
    { to: "/admin/brugere", label: "Brugerstyring", icon: Users },
    { to: "/admin/overblik", label: "Admin-overblik", icon: BarChart3 },
  ];

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate({ to: "/login" });
  };

  return (
    <div className="min-h-screen flex bg-background">
      <aside className="hidden md:flex w-64 flex-col bg-red-900 text-primary-foreground">
        <div className="px-6 py-5 border-b border-primary-foreground/10 flex items-center justify-center">
          <img src={frellsenLogo} alt="Frellsen siden 1897" className="h-12 w-auto object-contain" />
        </div>
        <nav className="flex-1 px-3 py-4 space-y-1">
          {navItems.map((item) => {
            const active = location.pathname.startsWith(item.to);
            return (
              <Link
                key={item.to}
                to={item.to}
                className={`flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors ${
                  active
                    ? "bg-primary-foreground/15 text-primary-foreground"
                    : "text-primary-foreground/75 hover:bg-primary-foreground/10"
                }`}
              >
                <item.icon className="h-4 w-4" />
                {item.label}
              </Link>
            );
          })}
          {isAdmin && (
            <>
              <div className="pt-4 pb-1 px-3 text-xs uppercase tracking-wider text-primary-foreground/40">
                Admin
              </div>
              {adminItems.map((item) => {
                const active = location.pathname.startsWith(item.to);
                return (
                  <Link
                    key={item.to}
                    to={item.to}
                    className={`flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors ${
                      active
                        ? "bg-primary-foreground/15 text-primary-foreground"
                        : "text-primary-foreground/75 hover:bg-primary-foreground/10"
                    }`}
                  >
                    <item.icon className="h-4 w-4" />
                    {item.label}
                  </Link>
                );
              })}
            </>
          )}
        </nav>
        <div className="px-4 py-4 border-t border-primary-foreground/10">
          <div className="flex items-center justify-between mb-2">
            <div className="min-w-0">
              <div className="text-sm font-medium truncate">{auth.fullName || auth.user?.email}</div>
              <div className="text-xs text-primary-foreground/60">
                {auth.role === "admin" ? "Administrator" : auth.role === "salgssupport" ? "Salgssupport" : "Sælger"}
                {auth.region ? ` · ${auth.region}` : ""}
              </div>
            </div>
            {auth.user?.id && (
              <NotificationBell
                userId={auth.user.id}
                onUnreadCountChange={(n) => {
                  if (typeof window === "undefined") return;
                  const key = `welcome-toast-${auth.user!.id}`;
                  if (sessionStorage.getItem(key)) return;
                  sessionStorage.setItem(key, "1");
                  if (n > 0) {
                    toast.message(
                      n === 1
                        ? "Du har 1 ny besked fra en kollega"
                        : `Du har ${n} nye beskeder fra kolleger`,
                    );
                  }
                }}
              />
            )}
          </div>
          <Button
            variant="secondary"
            size="sm"
            className="w-full"
            onClick={handleLogout}
          >
            <LogOut className="h-4 w-4 mr-2" /> Log ud
          </Button>
        </div>
      </aside>

      {/* Mobile top bar */}
      <div className="md:hidden fixed top-0 inset-x-0 z-20 bg-red-900 text-primary-foreground px-3 py-2 flex items-center justify-between border-b border-primary-foreground/10">
        <img src={frellsenLogo} alt="Frellsen" className="h-8 w-auto object-contain" />
        <div className="flex items-center gap-1">
          {auth.user?.id && <NotificationBell userId={auth.user.id} />}
          <Button variant="ghost" size="sm" onClick={handleLogout} className="text-primary-foreground hover:bg-primary-foreground/10">
            <LogOut className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <main className="flex-1 md:ml-0 pt-12 md:pt-0">
        <Outlet />
        {/* Mobile bottom nav */}
        <nav
          className="md:hidden fixed bottom-0 inset-x-0 bg-card border-t border-border grid grid-cols-6 z-20"
          style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
        >
          {navItems.map((item) => {
            const active = location.pathname.startsWith(item.to);
            return (
              <Link
                key={item.to}
                to={item.to}
                className={`flex flex-col items-center justify-center py-1.5 text-[10px] leading-tight ${
                  active ? "text-primary" : "text-muted-foreground"
                }`}
              >
                <item.icon className="h-5 w-5 mb-0.5" />
                <span className="truncate max-w-full px-1">{item.shortLabel}</span>
              </Link>
            );
          })}
        </nav>
      </main>
      <GlobalImportIndicator />
    </div>
  );
}
