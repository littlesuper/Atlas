import { describe, it, expect, beforeEach } from 'vitest';
import { registerCapability, getCapability, listCapabilitiesForUser, __resetCapabilities } from './registry';
import type { Capability } from './types';
import { z } from 'zod';

const fake = (name: string, resource: string, action: string): Capability =>
  ({
    name,
    description: `desc ${name}`,
    permission: { resource, action },
    mode: 'create',
    inputSchema: z.object({}).passthrough(),
    buildPrompt: () => ({ system: '', user: '' }),
    execute: async () => ({ rows: [], risks: [] }),
  }) as Capability;

describe('capability registry', () => {
  beforeEach(() => __resetCapabilities());

  it('registers and gets by name', () => {
    const c = fake('project.create', 'project', 'create');
    registerCapability(c);
    expect(getCapability('project.create')).toBe(c);
    expect(getCapability('nope')).toBeUndefined();
  });

  it('lists only capabilities the user has permission for', () => {
    registerCapability(fake('project.create', 'project', 'create'));
    registerCapability(fake('risk.delete', 'risk', 'delete'));
    const perms = ['project:create']; // 无 risk:delete
    const visible = listCapabilitiesForUser(perms).map((c) => c.name);
    expect(visible).toEqual(['project.create']);
  });

  it('wildcard *:* sees everything', () => {
    registerCapability(fake('project.create', 'project', 'create'));
    registerCapability(fake('risk.delete', 'risk', 'delete'));
    expect(listCapabilitiesForUser(['*:*']).length).toBe(2);
  });

  it('target 类能力缺 fingerprint → 注册即抛错（保护并发指纹复核）', () => {
    const bad = {
      name: 'bad.update',
      description: 'desc bad',
      permission: { resource: 'x', action: 'update' },
      mode: 'update',
      target: 'project',
      inputSchema: z.object({}).passthrough(),
      buildPrompt: () => ({ system: '', user: '' }),
      loadEntity: async () => null,
      execute: async () => ({ rows: [], risks: [] }),
    } as Capability;
    expect(() => registerCapability(bad)).toThrow(/fingerprint/);
  });
});
