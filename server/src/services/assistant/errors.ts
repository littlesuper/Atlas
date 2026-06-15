export class UnknownDomainError extends Error {
  constructor(public readonly domain: string) { super(`未知助手领域：${domain}`); this.name = 'UnknownDomainError'; }
}
export class ProposalNotFoundError extends Error {
  constructor() { super('提议不存在或已过期'); this.name = 'ProposalNotFoundError'; }
}
export class TargetNotFoundError extends Error {
  constructor() { super('目标对象不存在'); this.name = 'TargetNotFoundError'; }
}
export class VersionMismatchError extends Error {
  constructor() { super('数据在此期间已被改动，请重新发起'); this.name = 'VersionMismatchError'; }
}
/** 项目/通用字段校验失败（如日期区间非法）→ 上层 400 */
export class CapabilityValidationError extends Error {
  constructor(message: string) { super(message); this.name = 'CapabilityValidationError'; }
}
