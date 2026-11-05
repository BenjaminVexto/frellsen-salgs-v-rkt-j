export const AGENT_CODES = ["A", "B", "C", "D", "E", "F", "G", "H"] as const;
export type AgentCode = typeof AGENT_CODES[number];
export type AgentFilter = "alle" | AgentCode;
export const AGENT_STORAGE_KEY = "frellsen-kontaktliste-agent";

export function erAgentCode(value: unknown): value is AgentCode {
  return typeof value === "string" && AGENT_CODES.some(code => code === value);
}

export function hentAgent(): AgentCode | null {
  try {
    const value = localStorage.getItem(AGENT_STORAGE_KEY);
    return erAgentCode(value) ? value : null;
  } catch { return null; }
}

export function gemAgent(code: AgentCode): void {
  try { localStorage.setItem(AGENT_STORAGE_KEY, code); } catch { /* Browser storage can be disabled. */ }
}

export function agentKravOpfyldt(caller: boolean, code: unknown): boolean {
  return !caller || erAgentCode(code);
}

/** Notes do not change the latest outcome, just like contact-list status. */
export function senesteAgent(opkald: { at: string; id?: string; udfald: string; agent_code?: string | null }[]): AgentCode | null {
  const latest = opkald.filter(o => o.udfald !== "note").sort((a, b) => b.at.localeCompare(a.at) || (b.id ?? "").localeCompare(a.id ?? ""))[0];
  return erAgentCode(latest?.agent_code) ? latest.agent_code : null;
}

export function matcherAgent(code: string | null | undefined, filter: AgentFilter): boolean {
  return filter === "alle" || code === filter;
}