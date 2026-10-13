import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/admin/salgskort")({
  beforeLoad: () => {
    throw redirect({ to: "/min-portefoelje", search: { fane: "salgskort" } });
  },
});
