import { describe, it, expect, beforeEach } from 'vitest';
import { useAuthStore } from './authStore';

describe('authStore permission edge cases', () => {
  beforeEach(() => {
    useAuthStore.setState({
      user: {
        id: '1',
        username: 'test',
        realName: 'Test',
        canLogin: true,
        status: 'ACTIVE',
        roles: ['viewer'],
        permissions: ['project:read', 'activity:read'],
        collaboratingProjectIds: ['p1', 'p2'],
        createdAt: new Date().toISOString(),
      },
      isAuthenticated: true,
    });
  });

  it('hasPermission returns false for ungranted permission', () => {
    const state = useAuthStore.getState();
    expect(state.hasPermission('user', 'delete')).toBe(false);
  });

  it('hasPermission returns true for exact match', () => {
    const state = useAuthStore.getState();
    expect(state.hasPermission('project', 'read')).toBe(true);
  });

  it('wildcard resource:* matches any action', () => {
    useAuthStore.setState({
      user: {
        id: '1', username: 'admin', realName: 'Admin',
        canLogin: true, status: 'ACTIVE',
        roles: ['admin'], permissions: ['project:*'],
        collaboratingProjectIds: [],
        createdAt: new Date().toISOString(),
      },
    });
    const state = useAuthStore.getState();
    expect(state.hasPermission('project', 'delete')).toBe(true);
    expect(state.hasPermission('user', 'read')).toBe(false);
  });

  it('wildcard *:* matches everything', () => {
    useAuthStore.setState({
      user: {
        id: '1', username: 'admin', realName: 'Admin',
        canLogin: true, status: 'ACTIVE',
        roles: ['admin'], permissions: ['*:*'],
        collaboratingProjectIds: [],
        createdAt: new Date().toISOString(),
      },
    });
    const state = useAuthStore.getState();
    expect(state.hasPermission('anything', 'whatsoever')).toBe(true);
  });

  it('isProjectManager checks user ID match', () => {
    const state = useAuthStore.getState();
    expect(state.isProjectManager('1', 'p1')).toBe(true);  // is manager by userId
    expect(state.isProjectManager('other-user', 'p1')).toBe(true); // is collaborator
    expect(state.isProjectManager('other-user', 'p999')).toBe(false); // neither
  });

  it('returns false when not authenticated', () => {
    useAuthStore.setState({ user: null, isAuthenticated: false });
    const state = useAuthStore.getState();
    expect(state.hasPermission('project', 'read')).toBe(false);
  });
});
