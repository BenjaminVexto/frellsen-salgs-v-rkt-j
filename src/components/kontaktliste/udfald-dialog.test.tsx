// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { UdfaldDialog } from "./udfald-dialog";
import { AGENT_STORAGE_KEY } from "@/lib/agent-code";

const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc } }));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
afterEach(() => { cleanup(); localStorage.clear(); vi.clearAllMocks(); });
const props = { listId: "list", virksomhed: { company_id: "company", navn: "Test", telefon: null, kontakter: [] }, opretKontakt: vi.fn(), onClose: vi.fn(), onDone: vi.fn() };

describe("agent ved registrering", () => {
  it("caller kan ikke gemme uden agent og sender valgt agent på udfaldet", async () => {
    rpc.mockResolvedValue({ data: { id: "call", status: "forsoegt", saelger: null }, error: null });
    render(<UdfaldDialog {...props} caller initial="ingen_svar" />);
    const save = screen.getByRole("button", { name: "Gem" });
    expect((save as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(save); expect(rpc).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "C" }));
    expect((save as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(save);
    await waitFor(() => expect(rpc).toHaveBeenCalledWith("registrer_udfald", { _list: "list", _company: "company", _udfald: "ingen_svar", _note: null, _agent_code: "C" }));
    expect(localStorage.getItem(AGENT_STORAGE_KEY)).toBe("C");
  });
  it("genåbning forudfylder sidste agent", async () => {
    localStorage.setItem(AGENT_STORAGE_KEY, "H");
    render(<UdfaldDialog {...props} caller initial="ingen_svar" />);
    await waitFor(() => expect((screen.getByRole("button", { name: "Gem" }) as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(screen.getByRole("button", { name: "Gem" }));
    await waitFor(() => expect(rpc.mock.calls[0]?.[1]._agent_code).toBe("H"));
  });
  it("intern bruger gemmer uden agent og overtager ikke browserens caller-valg", async () => {
    localStorage.setItem(AGENT_STORAGE_KEY, "H");
    render(<UdfaldDialog {...props} initial="ingen_svar" />);
    fireEvent.click(screen.getByRole("button", { name: "Gem" }));
    await waitFor(() => expect(rpc.mock.calls[0]?.[1]._agent_code).toBeNull());
  });
});