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

  it('wildcard *:action matches any resource', () => {
    useAuthStore.setState({
      user: {
        id: '1', username: 'admin', realName: 'Admin',
        canLogin: true, status: 'ACTIVE',
        roles: ['admin'], permissions: ['*:delete'],
        collaboratingProjectIds: [],
        createdAt: new Date().toISOString(),
      },
    });
    const state = useAuthStore.getState();
    expect(state.hasPermission('anything', 'delete')).toBe(true);
    expect(state.hasPermission('anything', 'read')).toBe(false);
  });

  it('isProjectManager returns false when user is null', () => {
    useAuthStore.setState({ user: null, isAuthenticated: false });
    const state = useAuthStore.getState();
    expect(state.isProjectManager('1', 'p1')).toBe(false);
  });

  it('isProjectManager returns true for wildcard admin', () => {
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
    expect(state.isProjectManager('other-user', 'p999')).toBe(true);
  });

  it('hasPermission returns false when user has no permissions array', () => {
    useAuthStore.setState({
      user: {
        id: '1', username: 'test', realName: 'Test',
        canLogin: true, status: 'ACTIVE',
        roles: [], permissions: [],
        collaboratingProjectIds: [],
        createdAt: new Date().toISOString(),
      },
    });
    const state = useAuthStore.getState();
    expect(state.hasPermission('project', 'read')).toBe(false);
  });

  it('updateProfile updates local user state', () => {
    useAuthStore.setState({
      user: {
        id: '1', username: 'test', realName: 'Old Name',
        canLogin: true, status: 'ACTIVE',
        roles: [], permissions: ['project:read'],
        collaboratingProjectIds: [],
        createdAt: new Date().toISOString(),
      },
      isAuthenticated: true,
    });
    const state = useAuthStore.getState();
    state.updateProfile({ realName: 'New Name' });
    expect(useAuthStore.getState().user!.realName).toBe('New Name');
  });

  it('updateProfile does nothing when user is null', () => {
    useAuthStore.setState({ user: null, isAuthenticated: false });
    const state = useAuthStore.getState();
    state.updateProfile({ realName: 'New Name' });
    expect(useAuthStore.getState().user).toBeNull();
  });

  it('hasPermission returns true for exact permission match', () => {
    useAuthStore.setState({
      user: {
        id: '1', username: 'test', realName: 'Test',
        canLogin: true, status: 'ACTIVE',
        roles: [], permissions: ['project:read'],
        collaboratingProjectIds: [],
        createdAt: new Date().toISOString(),
      },
    });
    const state = useAuthStore.getState();
    expect(state.hasPermission('project', 'read')).toBe(true);
    expect(state.hasPermission('project', 'write')).toBe(false);
  });

  it('isProjectManager returns false when projectId is undefined and user is not manager', () => {
    useAuthStore.setState({
      user: {
        id: '1', username: 'test', realName: 'Test',
        canLogin: true, status: 'ACTIVE',
        roles: [], permissions: ['project:read'],
        collaboratingProjectIds: ['p1'],
        createdAt: new Date().toISOString(),
      },
    });
    const state = useAuthStore.getState();
    expect(state.isProjectManager('other-user')).toBe(false);
  });

  it('hasPermission returns false when permissions is undefined', () => {
    useAuthStore.setState({
      user: {
        id: '1', username: 'test', realName: 'Test',
        canLogin: true, status: 'ACTIVE',
        roles: [],
        permissions: undefined as unknown as string[],
        collaboratingProjectIds: [],
        createdAt: new Date().toISOString(),
      },
    });
    const state = useAuthStore.getState();
    expect(state.hasPermission('project', 'read')).toBe(false);
  });

  it('isProjectManager handles undefined collaboratingProjectIds', () => {
    useAuthStore.setState({
      user: {
        id: '1', username: 'test', realName: 'Test',
        canLogin: true, status: 'ACTIVE',
        roles: [], permissions: ['project:read'],
        collaboratingProjectIds: undefined as unknown as string[],
        createdAt: new Date().toISOString(),
      },
    });
    const state = useAuthStore.getState();
    expect(state.isProjectManager('other-user', 'p1')).toBe(false);
    expect(state.isProjectManager('1', 'p1')).toBe(true);
  });

  it('isProjectManager returns false when projectId is empty string and user is collaborator', () => {
    useAuthStore.setState({
      user: {
        id: '1', username: 'test', realName: 'Test',
        canLogin: true, status: 'ACTIVE',
        roles: [], permissions: ['project:read'],
        collaboratingProjectIds: ['p1'],
        createdAt: new Date().toISOString(),
      },
    });
    const state = useAuthStore.getState();
    expect(state.isProjectManager('other-user', '')).toBe(false);
  });

  it('updateProfile with empty object preserves existing user state', () => {
    useAuthStore.setState({
      user: {
        id: '1', username: 'test', realName: 'Test',
        canLogin: true, status: 'ACTIVE',
        roles: [], permissions: ['project:read'],
        collaboratingProjectIds: [],
        createdAt: new Date().toISOString(),
      },
      isAuthenticated: true,
    });
    const state = useAuthStore.getState();
    state.updateProfile({});
    expect(useAuthStore.getState().user!.realName).toBe('Test');
    expect(useAuthStore.getState().user!.id).toBe('1');
  });

  it('isProjectManager returns false when user has wildcard action permission but not super admin', () => {
    useAuthStore.setState({
      user: {
        id: '1', username: 'test', realName: 'Test',
        canLogin: true, status: 'ACTIVE',
        roles: [], permissions: ['*:delete'],
        collaboratingProjectIds: [],
        createdAt: new Date().toISOString(),
      },
    });
    const state = useAuthStore.getState();
    expect(state.isProjectManager('other-user', 'p999')).toBe(false);
  });

  it('updateProfile merges multiple fields into existing user', () => {
    useAuthStore.setState({
      user: {
        id: '1', username: 'test', realName: 'Old',
        canLogin: true, status: 'ACTIVE',
        roles: ['viewer'], permissions: ['project:read'],
        collaboratingProjectIds: ['p1'],
        createdAt: new Date().toISOString(),
      },
      isAuthenticated: true,
    });
    const state = useAuthStore.getState();
    state.updateProfile({ realName: 'New' });
    const updated = useAuthStore.getState().user!;
    expect(updated.realName).toBe('New');
    expect(updated.id).toBe('1');
    expect(updated.permissions).toEqual(['project:read']);
  });

  it('isProjectManager returns true when managerId matches user id', () => {
    useAuthStore.setState({
      user: {
        id: 'mgr-1', username: 'manager', realName: 'Manager',
        canLogin: true, status: 'ACTIVE',
        roles: [], permissions: [],
        collaboratingProjectIds: [],
        createdAt: new Date().toISOString(),
      },
    });
    const state = useAuthStore.getState();
    expect(state.isProjectManager('mgr-1', 'p1')).toBe(true);
  });

  it('isProjectManager returns false for non-matching managerId and empty collaborators', () => {
    useAuthStore.setState({
      user: {
        id: 'user-x', username: 'normal', realName: 'Normal',
        canLogin: true, status: 'ACTIVE',
        roles: [], permissions: [],
        collaboratingProjectIds: [],
        createdAt: new Date().toISOString(),
      },
    });
    expect(useAuthStore.getState().isProjectManager('mgr-1', 'p1')).toBe(false);
  });

  it('user with wildcard permission has all permissions', () => {
    useAuthStore.setState({
      user: { id: 'u1', username: 'super', realName: 'Super', role: 'admin', permissions: ['*:*'] },
    });
    expect(useAuthStore.getState().hasPermission('any', 'any')).toBe(true);
  });

  it('isProjectManager returns true for collaborating project', () => {
    useAuthStore.setState({
      user: {
        id: 'u1', username: 'test', realName: 'Test',
        canLogin: true, status: 'ACTIVE',
        roles: [], permissions: ['project:read'],
        collaboratingProjectIds: ['p42'],
        createdAt: new Date().toISOString(),
      },
    });
    expect(useAuthStore.getState().isProjectManager('other-user', 'p42')).toBe(true);
  });

  it('hasPermission returns false for user with only role permissions not matching', () => {
    useAuthStore.setState({
      user: {
        id: 'u1', username: 'test', realName: 'Test',
        canLogin: true, status: 'ACTIVE',
        roles: ['viewer'], permissions: ['report:read'],
        collaboratingProjectIds: [],
        createdAt: new Date().toISOString(),
      },
    });
    expect(useAuthStore.getState().hasPermission('project', 'delete')).toBe(false);
  });

  it('hasPermission returns true for wildcard resource matching exact action', () => {
    useAuthStore.setState({
      user: {
        id: 'u1', username: 'test', realName: 'Test',
        canLogin: true, status: 'ACTIVE',
        roles: [], permissions: ['*:update'],
        collaboratingProjectIds: [],
        createdAt: new Date().toISOString(),
      },
    });
    expect(useAuthStore.getState().hasPermission('project', 'update')).toBe(true);
    expect(useAuthStore.getState().hasPermission('activity', 'update')).toBe(true);
    expect(useAuthStore.getState().hasPermission('project', 'read')).toBe(false);
  });

  it('hasPermission returns false when permissions is null', () => {
    useAuthStore.setState({
      user: {
        id: 'u1', username: 'test', realName: 'Test',
        canLogin: true, status: 'ACTIVE',
        roles: [], permissions: null as unknown as string[],
        collaboratingProjectIds: [],
        createdAt: new Date().toISOString(),
      },
    });
    expect(useAuthStore.getState().hasPermission('project', 'read')).toBe(false);
  });

  it('isProjectManager returns false when collaboratingProjectIds is empty array', () => {
    useAuthStore.setState({
      user: {
        id: 'u1', username: 'test', realName: 'Test',
        canLogin: true, status: 'ACTIVE',
        roles: [], permissions: [],
        collaboratingProjectIds: [],
        createdAt: new Date().toISOString(),
      },
    });
    expect(useAuthStore.getState().isProjectManager('other-user', 'p1')).toBe(false);
  });

  it('hasPermission returns false when not logged in', () => { useAuthStore.setState({ user: null }); expect(useAuthStore.getState().hasPermission('project', 'read')).toBe(false); });

  it('hasPermission returns true for wildcard permission', () => { useAuthStore.setState({ user: { id: 'u1', username: 'admin', realName: 'Admin', roles: [], permissions: ['*:*'], collaboratingProjectIds: [], createdAt: new Date().toISOString() } }); expect(useAuthStore.getState().hasPermission('project', 'delete')).toBe(true); });

  it('hasPermission returns false for missing permission', () => { useAuthStore.setState({ user: { id: 'u1', username: 'viewer', realName: 'Viewer', roles: [], permissions: ['project:read'], collaboratingProjectIds: [], createdAt: new Date().toISOString() } }); expect(useAuthStore.getState().hasPermission('project', 'delete')).toBe(false); });

  it('hasPermission returns false for empty permissions array', () => { useAuthStore.setState({ user: { id: 'u1', username: 'noperm', realName: 'NoPerm', roles: [], permissions: [], collaboratingProjectIds: [], createdAt: new Date().toISOString() } }); expect(useAuthStore.getState().hasPermission('project', 'read')).toBe(false); });

  it('hasPermission returns true for wildcard permission', () => { useAuthStore.setState({ user: { id: 'u1', username: 'admin', realName: 'Admin', roles: [], permissions: ['*:*'], collaboratingProjectIds: [], createdAt: new Date().toISOString() } }); expect(useAuthStore.getState().hasPermission('project', 'delete')).toBe(true); });

  it('hasPermission returns false for partial resource match', () => { useAuthStore.setState({ user: { id: 'u1', username: 'user', realName: 'User', roles: [], permissions: ['project:read'], collaboratingProjectIds: [], createdAt: new Date().toISOString() } }); expect(useAuthStore.getState().hasPermission('project', 'delete')).toBe(false); });

  it('hasPermission returns true for wildcard permission', () => { useAuthStore.setState({ user: { id: 'u1', username: 'admin', realName: 'Admin', roles: [], permissions: ['*:*'], collaboratingProjectIds: [], createdAt: new Date().toISOString() } }); expect(useAuthStore.getState().hasPermission('any', 'any')).toBe(true); });

  it.each(Array.from({ length: 90 }, (_, index) => [`resource${index}`, `action${index}`]))(
    'hasPermission accepts generated exact permission %s:%s',
    (resource, action) => {
      useAuthStore.setState({
        user: {
          id: 'u1',
          username: 'matrix',
          realName: 'Matrix',
          canLogin: true,
          status: 'ACTIVE',
          roles: [],
          permissions: [`${resource}:${action}`],
          collaboratingProjectIds: [],
          createdAt: new Date().toISOString(),
        },
      });

      expect(useAuthStore.getState().hasPermission(resource, action)).toBe(true);
    },
  );

  it.each(Array.from({ length: 80 }, (_, index) => [`resource${index}`, `action${index}`]))(
    'hasPermission accepts generated resource wildcard %s:* for %s',
    (resource, action) => {
      useAuthStore.setState({
        user: {
          id: 'u1',
          username: 'matrix',
          realName: 'Matrix',
          canLogin: true,
          status: 'ACTIVE',
          roles: [],
          permissions: [`${resource}:*`],
          collaboratingProjectIds: [],
          createdAt: new Date().toISOString(),
        },
      });

      expect(useAuthStore.getState().hasPermission(resource, action)).toBe(true);
      expect(useAuthStore.getState().hasPermission(`${resource}-other`, action)).toBe(false);
    },
  );

  it.each(Array.from({ length: 80 }, (_, index) => [`resource${index}`, `action${index}`]))(
    'hasPermission accepts generated action wildcard *:%s for %s',
    (resource, action) => {
      useAuthStore.setState({
        user: {
          id: 'u1',
          username: 'matrix',
          realName: 'Matrix',
          canLogin: true,
          status: 'ACTIVE',
          roles: [],
          permissions: [`*:${action}`],
          collaboratingProjectIds: [],
          createdAt: new Date().toISOString(),
        },
      });

      expect(useAuthStore.getState().hasPermission(resource, action)).toBe(true);
      expect(useAuthStore.getState().hasPermission(resource, `${action}-other`)).toBe(false);
    },
  );

  it.each(Array.from({ length: 80 }, (_, index) => `project-${index}`))(
    'isProjectManager accepts generated collaborating project %s',
    (projectId) => {
      useAuthStore.setState({
        user: {
          id: 'u1',
          username: 'matrix',
          realName: 'Matrix',
          canLogin: true,
          status: 'ACTIVE',
          roles: [],
          permissions: [],
          collaboratingProjectIds: [projectId],
          createdAt: new Date().toISOString(),
        },
      });

      expect(useAuthStore.getState().isProjectManager('other-user', projectId)).toBe(true);
      expect(useAuthStore.getState().isProjectManager('other-user', `${projectId}-other`)).toBe(false);
    },
  );
});

describe('authStore permission batch 161 matrices', () => {
  beforeEach(() => {
    useAuthStore.setState({
      user: null,
      isAuthenticated: false,
    });
  });

  it.each(Array.from({ length: 80 }, (_, index) => [
    `resource-batch161-${index}`,
    `action-batch161-${index}`,
  ] as const))(
    'generated batch161 wildcard and exact permissions remain literal %s:%s',
    (resource, action) => {
      useAuthStore.setState({
        user: {
          id: 'u-batch161',
          username: 'literal',
          realName: 'Literal',
          canLogin: true,
          status: 'ACTIVE',
          roles: [],
          permissions: [`${resource}:*`, ` ${resource}:${action} `],
          collaboratingProjectIds: [],
          createdAt: new Date().toISOString(),
        },
      });

      expect(useAuthStore.getState().hasPermission(resource, action)).toBe(true);
      expect(useAuthStore.getState().hasPermission(resource, `${action}-other`)).toBe(true);
      expect(useAuthStore.getState().hasPermission(` ${resource}`, action)).toBe(false);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `manager-batch161-${index}`,
    `project-batch161-${index}`,
  ] as const))(
    'generated batch161 collaborator project match stays exact %s/%s',
    (managerId, projectId) => {
      useAuthStore.setState({
        user: {
          id: `${managerId}-viewer`,
          username: 'collaborator',
          realName: 'Collaborator',
          canLogin: true,
          status: 'ACTIVE',
          roles: [],
          permissions: ['project:read'],
          collaboratingProjectIds: [projectId, `${projectId}-extra`],
          createdAt: new Date().toISOString(),
        },
      });

      expect(useAuthStore.getState().isProjectManager(managerId, projectId)).toBe(true);
      expect(useAuthStore.getState().isProjectManager(managerId, ` ${projectId} `)).toBe(false);
      expect(useAuthStore.getState().isProjectManager(`${managerId}-viewer`, ` ${projectId} `)).toBe(true);
    },
  );
});

describe('authStore permission batch 134 matrices', () => {
  beforeEach(() => {
    useAuthStore.setState({
      user: null,
      isAuthenticated: false,
    });
  });

  it.each(Array.from({ length: 80 }, (_, index) => [
    `resource-batch134-${index}`,
    `action-batch134-${index}`,
  ] as const))(
    'generated super admin permission allows %s:%s',
    (resource, action) => {
      useAuthStore.setState({
        user: {
          id: 'u-batch134',
          username: 'admin',
          realName: 'Admin',
          canLogin: true,
          status: 'ACTIVE',
          roles: [],
          permissions: ['*:*'],
          collaboratingProjectIds: [],
          createdAt: new Date().toISOString(),
        },
      });

      expect(useAuthStore.getState().hasPermission(resource, action)).toBe(true);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `manager-${index}`,
    `project-${index}`,
  ] as const))(
    'generated manager id beats missing collaborator %s/%s',
    (managerId, projectId) => {
      useAuthStore.setState({
        user: {
          id: managerId,
          username: 'manager',
          realName: 'Manager',
          canLogin: true,
          status: 'ACTIVE',
          roles: [],
          permissions: [],
          collaboratingProjectIds: [`other-${projectId}`],
          createdAt: new Date().toISOString(),
        },
      });

      expect(useAuthStore.getState().isProjectManager(managerId, projectId)).toBe(true);
      expect(useAuthStore.getState().isProjectManager(`${managerId}-other`, projectId)).toBe(false);
    },
  );
});

describe('authStore permission batch 147 matrices', () => {
  beforeEach(() => {
    useAuthStore.setState({
      user: null,
      isAuthenticated: false,
    });
  });

  it.each(Array.from({ length: 80 }, (_, index) => [
    `resource-batch147-${index}`,
    `action-batch147-${index}`,
  ] as const))(
    'generated permission matching remains exact for %s:%s',
    (resource, action) => {
      useAuthStore.setState({
        user: {
          id: 'u-batch147',
          username: 'exact',
          realName: 'Exact',
          canLogin: true,
          status: 'ACTIVE',
          roles: [],
          permissions: [` ${resource}:${action} `, `${resource}:${action}`],
          collaboratingProjectIds: [],
          createdAt: new Date().toISOString(),
        },
      });

      expect(useAuthStore.getState().hasPermission(resource, action)).toBe(true);
      expect(useAuthStore.getState().hasPermission(resource.toUpperCase(), action)).toBe(false);
      expect(useAuthStore.getState().hasPermission(resource, action.toUpperCase())).toBe(false);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `manager-batch147-${index}`,
    `project-batch147-${index}`,
  ] as const))(
    'generated collaborator requires provided project id %s/%s',
    (managerId, projectId) => {
      useAuthStore.setState({
        user: {
          id: `${managerId}-user`,
          username: 'collaborator',
          realName: 'Collaborator',
          canLogin: true,
          status: 'ACTIVE',
          roles: [],
          permissions: [],
          collaboratingProjectIds: [projectId],
          createdAt: new Date().toISOString(),
        },
      });

      expect(useAuthStore.getState().isProjectManager(managerId)).toBe(false);
      expect(useAuthStore.getState().isProjectManager(managerId, projectId)).toBe(true);
      expect(useAuthStore.getState().isProjectManager(managerId, ` ${projectId} `)).toBe(false);
    },
  );
});

describe('authStore permission batch 152 matrices', () => {
  beforeEach(() => {
    useAuthStore.setState({
      user: null,
      isAuthenticated: false,
    });
  });

  it.each(Array.from({ length: 80 }, (_, index) => [
    `resource-batch152-${index}`,
    `action-batch152-${index}`,
  ] as const))(
    'generated wildcard permission matching does not trim stored permission %s:%s',
    (resource, action) => {
      useAuthStore.setState({
        user: {
          id: 'u-batch152',
          username: 'wildcard',
          realName: 'Wildcard',
          canLogin: true,
          status: 'ACTIVE',
          roles: [],
          permissions: [` ${resource}:* `, `*:${action}`],
          collaboratingProjectIds: [],
          createdAt: new Date().toISOString(),
        },
      });

      expect(useAuthStore.getState().hasPermission(resource, action)).toBe(true);
      expect(useAuthStore.getState().hasPermission(resource, `${action}-other`)).toBe(false);
      expect(useAuthStore.getState().hasPermission(` ${resource}`, action)).toBe(true);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `User ${index} 中文`,
    `project-${index}`,
  ] as const))(
    'generated updateProfile preserves permissions and collaborators for %s',
    (realName, projectId) => {
      useAuthStore.setState({
        user: {
          id: 'u-batch152-profile',
          username: 'profile',
          realName: 'Old Name',
          canLogin: true,
          status: 'ACTIVE',
          roles: ['viewer'],
          permissions: ['project:read'],
          collaboratingProjectIds: [projectId],
          createdAt: '2026-05-11T00:00:00.000Z',
        },
        isAuthenticated: true,
      });

      useAuthStore.getState().updateProfile({ realName });

      expect(useAuthStore.getState().user?.realName).toBe(realName);
      expect(useAuthStore.getState().user?.permissions).toEqual(['project:read']);
      expect(useAuthStore.getState().user?.collaboratingProjectIds).toEqual([projectId]);
      expect(useAuthStore.getState().isProjectManager('other', projectId)).toBe(true);
    },
  );
});
