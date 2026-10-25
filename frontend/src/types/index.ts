export interface Agent {
  AgentName: string;
  AgentFaction: string;
  APdiff: number | string;
  PV: string;
  [key: string]: any;
}

export interface Log {
  timestamp: string;
  message: string;
}
