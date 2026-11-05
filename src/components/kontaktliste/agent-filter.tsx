import { AGENT_CODES, type AgentFilter as Filter } from "@/lib/agent-code";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export function AgentFilter({ value, onChange }: { value: Filter; onChange: (value: Filter) => void }) {
  return <div>
    <Label className="text-xs">Agent</Label>
    <Select value={value} onValueChange={value => onChange(value as Filter)}>
      <SelectTrigger aria-label="Agent" className="w-24"><SelectValue /></SelectTrigger>
      <SelectContent><SelectItem value="alle">Alle</SelectItem>{AGENT_CODES.map(code => <SelectItem key={code} value={code}>{code}</SelectItem>)}</SelectContent>
    </Select>
  </div>;
}