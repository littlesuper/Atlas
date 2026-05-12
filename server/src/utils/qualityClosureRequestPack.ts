import { ClosureCheckStatus } from './week8ClosureGate';
import { QualityClosureRemainingWork, buildDefaultQualityClosureRemainingWork } from './qualityClosureRemainingWork';

export type QualityClosureRequest = {
  item: string;
  owner: string;
  dueDate: string;
  status: ClosureCheckStatus;
  evidenceRequired: string;
  nextCommand: string;
  requestText: string;
};

export type QualityClosureRequestPack = {
  mode: 'QUALITY_CLOSURE_REQUEST_PACK';
  status: 'READY' | 'ACTION_REQUIRED' | 'BLOCKED';
  generatedAt: string;
  summary: {
    requestCount: number;
    blockedRequestCount: number;
  };
  requests: QualityClosureRequest[];
  nextCommands: string[];
};

export function buildQualityClosureRequestPack(input: {
  remainingWork: QualityClosureRemainingWork;
  generatedAt?: Date;
}): QualityClosureRequestPack {
  const requests = input.remainingWork.remainingItems.map((item): QualityClosureRequest => ({
    item: item.name,
    owner: item.owner,
    dueDate: item.dueDate,
    status: item.status,
    evidenceRequired: item.evidenceRequired,
    nextCommand: item.nextCommand,
    requestText: buildRequestText(item.name, item.dueDate, item.evidenceRequired, item.nextCommand),
  }));
  const blockedRequestCount = requests.filter((request) => request.status === 'BLOCKED').length;

  return {
    mode: 'QUALITY_CLOSURE_REQUEST_PACK',
    status: blockedRequestCount > 0 ? 'BLOCKED' : requests.length > 0 ? 'ACTION_REQUIRED' : 'READY',
    generatedAt: (input.generatedAt ?? new Date()).toISOString(),
    summary: {
      requestCount: requests.length,
      blockedRequestCount,
    },
    requests,
    nextCommands: requests.map((request) => request.nextCommand).filter(Boolean),
  };
}

export function buildDefaultQualityClosureRequestPack(input: {
  generatedAt?: Date;
} = {}): QualityClosureRequestPack {
  const generatedAt = input.generatedAt ?? new Date();

  return buildQualityClosureRequestPack({
    generatedAt,
    remainingWork: buildDefaultQualityClosureRemainingWork({ generatedAt }),
  });
}

function buildRequestText(item: string, dueDate: string, evidenceRequired: string, nextCommand: string): string {
  return `请在 ${dueDate} 前提供 ${item} 的收口证据：${evidenceRequired}。下一步命令：${nextCommand}。`;
}
