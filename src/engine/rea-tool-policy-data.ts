import policyData from './rea-tool-policy.json' with { type: 'json' };

export interface ReaToolPolicyEntry {
  name: string;
  risk: 'read' | 'write' | 'exec' | 'network';
  readOnly: boolean;
  longRunning: boolean;
  pathArgs: string[];
  openWorld: boolean;
  surface?: string;
}

export const REA_TOOL_POLICIES = policyData as readonly ReaToolPolicyEntry[];
