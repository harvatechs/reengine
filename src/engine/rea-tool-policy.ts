import { REA_TOOL_POLICIES, type ReaToolPolicyEntry } from './rea-tool-policy-data.js';

export { REA_TOOL_POLICIES, type ReaToolPolicyEntry };

const POLICY_MAP = new Map<string, ReaToolPolicyEntry>(
  REA_TOOL_POLICIES.map((entry) => [entry.name, entry]),
);

export function getReaToolPolicy(originalName: string): ReaToolPolicyEntry | undefined {
  return POLICY_MAP.get(originalName);
}

export function listReaToolPolicies(): readonly ReaToolPolicyEntry[] {
  return REA_TOOL_POLICIES;
}
