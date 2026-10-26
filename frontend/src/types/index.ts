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

// 单次抽奖记录：种子 + 当时的参与池规模，保证事后可复核
export interface LotteryDrawRecord {
  at: number;
  seed: string;
  count: number;
  poolSize: number;
  winners: string[];
}
