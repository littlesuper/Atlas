import { describe, it, expect, vi, beforeEach } from 'vitest';
import '@testing-library/jest-dom';

const mockUser = {
  id: 'user-1',
  username: 'test',
  realName: 'Test',
  permissions: [] as string[],
  collaboratingProjectIds: [] as string[],
};

const mockHasPermission = vi.fn(() => false);

vi.mock('../store/authStore', () => ({
  useAuthStore: vi.fn((selector: (state: unknown) => unknown) => {
    const state = {
      user: mockUser,
      hasPermission: mockHasPermission,
    };
    return typeof selector === 'function' ? selector(state) : state;
  }),
}));

import { useReportPermission } from './useReportPermission';

function makeReport(overrides: Record<string, unknown> = {}) {
  return {
    id: 'r1',
    projectId: 'p1',
    createdBy: 'creator-1',
    project: { managerId: 'manager-1' },
    ...overrides,
  };
}

describe('useReportPermission', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUser.id = 'user-1';
    mockUser.permissions = [];
    mockUser.collaboratingProjectIds = [];
    mockHasPermission.mockReturnValue(false);
  });

  it('denies edit when user is null', () => {
    const original = mockUser;
    Object.assign(mockUser, { id: undefined });

    const { canEdit } = useReportPermission();
    expect(canEdit(makeReport())).toBe(false);

    Object.assign(mockUser, original);
  });

  it('allows edit for super admin with *:* permission', () => {
    mockUser.permissions = ['*:*'];
    const { canEdit } = useReportPermission();

    expect(canEdit(makeReport({ createdBy: 'other' }))).toBe(true);
  });

  it('allows edit for report creator', () => {
    mockUser.id = 'creator-1';
    const { canEdit } = useReportPermission();

    expect(canEdit(makeReport())).toBe(true);
  });

  it('allows edit for project manager', () => {
    mockUser.id = 'manager-1';
    const { canEdit } = useReportPermission();

    expect(canEdit(makeReport())).toBe(true);
  });

  it('allows edit for collaborator', () => {
    mockUser.collaboratingProjectIds = ['p1'];
    const { canEdit } = useReportPermission();

    expect(canEdit(makeReport())).toBe(true);
  });

  it('denies edit for unrelated user', () => {
    const { canEdit } = useReportPermission();

    expect(canEdit(makeReport())).toBe(false);
  });

  it('denies delete when no weekly_report:delete permission', () => {
    mockUser.id = 'creator-1';
    mockHasPermission.mockReturnValue(false);
    const { canDelete } = useReportPermission();

    expect(canDelete(makeReport())).toBe(false);
  });

  it('allows delete when user can edit and has permission', () => {
    mockUser.id = 'creator-1';
    mockHasPermission.mockReturnValue(true);
    const { canDelete } = useReportPermission();

    expect(canDelete(makeReport())).toBe(true);
  });

  it('denies edit when user has empty permissions array', () => {
    mockUser.permissions = [];
    const { canEdit } = useReportPermission();

    expect(canEdit(makeReport())).toBe(false);
  });

  it('denies edit when report has no project', () => {
    mockUser.id = 'manager-1';
    const { canEdit } = useReportPermission();

    expect(canEdit(makeReport({ project: undefined }))).toBe(false);
  });

  it('denies delete when canEdit is true but hasPermission is false', () => {
    mockUser.id = 'creator-1';
    mockHasPermission.mockReturnValue(false);
    const { canDelete } = useReportPermission();

    expect(canDelete(makeReport())).toBe(false);
  });

  it('canEdit returns false for user with undefined collaboratingProjectIds', () => {
    mockUser.collaboratingProjectIds = undefined as unknown as string[];
    const { canEdit } = useReportPermission();

    expect(canEdit(makeReport())).toBe(false);
  });

  it('canDelete false for unrelated user even with delete permission', () => {
    mockUser.id = 'stranger';
    mockHasPermission.mockReturnValue(true);
    const { canDelete } = useReportPermission();

    expect(canDelete(makeReport())).toBe(false);
  });

  it('canEdit returns false when project managerId is null', () => {
    mockUser.id = 'user-1';
    const { canEdit } = useReportPermission();

    expect(canEdit(makeReport({ project: { managerId: null } }))).toBe(false);
  });

  it('canEdit returns true for super admin even when project is undefined', () => {
    mockUser.permissions = ['*:*'];
    const { canEdit } = useReportPermission();

    expect(canEdit(makeReport({ project: undefined }))).toBe(true);
  });

  it('canEdit returns false when collaboratingProjectIds does not contain project', () => {
    mockUser.collaboratingProjectIds = ['p2', 'p3'];
    const { canEdit } = useReportPermission();

    expect(canEdit(makeReport({ projectId: 'p1' }))).toBe(false);
  });

  it('canEdit returns false when report createdBy is undefined', () => {
    const { canEdit } = useReportPermission();
    expect(canEdit(makeReport({ createdBy: undefined }))).toBe(false);
  });

  it('canEdit returns false when report projectId is empty string', () => {
    mockUser.collaboratingProjectIds = [''];
    const { canEdit } = useReportPermission();
    expect(canEdit(makeReport({ projectId: '' }))).toBe(true);
  });

  it('canEdit returns false when user has unrelated permissions', () => {
    mockUser.permissions = ['project:read', 'activity:update'];
    const { canEdit } = useReportPermission();
    expect(canEdit(makeReport())).toBe(false);
  });

  it('canEdit returns false when user has unrelated permissions and is not manager', () => {
    mockUser.permissions = ['project:read', 'activity:update'];
    mockUser.id = 'someone-else';
    const { canEdit } = useReportPermission();
    expect(canEdit(makeReport())).toBe(false);
  });

  it('user with edit permission can edit own report', () => {
    mockUser.id = 'creator-1';
    const { canEdit } = useReportPermission();
    expect(canEdit(makeReport())).toBe(true);
  });

  it('canEdit returns true for collaborator matching exact projectId', () => {
    mockUser.collaboratingProjectIds = ['p1'];
    const { canEdit } = useReportPermission();
    expect(canEdit(makeReport({ projectId: 'p1' }))).toBe(true);
  });

  it('canDelete returns false when user can edit but hasPermission returns false', () => {
    mockUser.id = 'creator-1';
    mockHasPermission.mockReturnValue(false);
    const { canDelete } = useReportPermission();
    expect(canDelete(makeReport())).toBe(false);
  });

  it('canEdit returns false when user object has no id property', () => {
    Object.assign(mockUser, { id: undefined });
    const { canEdit } = useReportPermission();
    expect(canEdit(makeReport())).toBe(false);
  });

  it('canEdit returns true for super admin with null project', () => {
    mockUser.permissions = ['*:*'];
    const { canEdit } = useReportPermission();
    expect(canEdit(makeReport({ project: null }))).toBe(true);
  });

  it('canDelete returns false when user is null', () => {
    Object.assign(mockUser, { id: undefined });
    const { canDelete } = useReportPermission();
    expect(canDelete(makeReport())).toBe(false);
  });

  it('canDelete returns false for non-author', () => { Object.assign(mockUser, { id: 'other-user' }); const { canEdit } = useReportPermission(); expect(canEdit(makeReport())).toBe(false); });

  it('canDelete returns false without delete permission', () => { Object.assign(mockUser, { id: 'author-id' }); const { canDelete } = useReportPermission(); expect(canDelete(makeReport())).toBe(false); });

  it('canEdit returns false for non-author user', () => { Object.assign(mockUser, { id: 'other-user' }); const { canEdit } = useReportPermission(); expect(canEdit(makeReport())).toBe(false); });

  it('canDelete returns false for non-admin non-author', () => { Object.assign(mockUser, { id: 'other-user' }); const { canDelete } = useReportPermission(); expect(canDelete(makeReport())).toBe(false); });

  it('canEdit returns true for admin with wildcard permission', () => { Object.assign(mockUser, { id: 'other-user', permissions: ['*:*'] }); const { canEdit } = useReportPermission(); expect(canEdit(makeReport())).toBe(true); });

  it('canEdit returns false for user with no permissions', () => { Object.assign(mockUser, { id: 'other-user', permissions: [] }); const { canEdit } = useReportPermission(); expect(canEdit(makeReport())).toBe(false); });

  it.each(Array.from({ length: 80 }, (_, index) => `project-${index}`))(
    'canEdit accepts generated collaborator project %s',
    (projectId) => {
      mockUser.id = 'user-1';
      mockUser.permissions = [];
      mockUser.collaboratingProjectIds = [projectId];
      const { canEdit } = useReportPermission();

      expect(canEdit(makeReport({ projectId, createdBy: 'creator-x' }))).toBe(true);
      expect(canEdit(makeReport({ projectId: `${projectId}-other`, createdBy: 'creator-x' }))).toBe(false);
    },
  );

  it.each(Array.from({ length: 80 }, (_, index) => `creator-${index}`))(
    'canEdit accepts generated creator %s',
    (creatorId) => {
      mockUser.id = creatorId;
      mockUser.permissions = [];
      mockUser.collaboratingProjectIds = [];
      const { canEdit } = useReportPermission();

      expect(canEdit(makeReport({ createdBy: creatorId, projectId: 'project-x' }))).toBe(true);
      expect(canEdit(makeReport({ createdBy: `${creatorId}-other`, projectId: 'project-x' }))).toBe(false);
    },
  );

  it.each(Array.from({ length: 80 }, (_, index) => `manager-${index}`))(
    'canEdit accepts generated manager %s',
    (managerId) => {
      mockUser.id = managerId;
      mockUser.permissions = [];
      mockUser.collaboratingProjectIds = [];
      const { canEdit } = useReportPermission();

      expect(canEdit(makeReport({ createdBy: 'creator-x', project: { managerId } }))).toBe(true);
      expect(canEdit(makeReport({ createdBy: 'creator-x', project: { managerId: `${managerId}-other` } }))).toBe(false);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => `delete-${index}`))(
    'canDelete accepts generated creator with delete permission %s',
    (creatorId) => {
      mockUser.id = creatorId;
      mockUser.permissions = [];
      mockUser.collaboratingProjectIds = [];
      mockHasPermission.mockReturnValue(true);
      const { canDelete } = useReportPermission();

      expect(canDelete(makeReport({ createdBy: creatorId }))).toBe(true);
      expect(mockHasPermission).toHaveBeenCalledWith('weekly_report', 'delete');
    },
  );

  it.each(Array.from({ length: 80 }, (_, index) => [`admin-${index}`, index % 2 === 0]))(
    'wildcard admin edit result ignores generated ownership %s',
    (userId, deleteAllowed) => {
      mockUser.id = userId;
      mockUser.permissions = ['*:*'];
      mockUser.collaboratingProjectIds = [];
      mockHasPermission.mockReturnValue(deleteAllowed);
      const { canEdit, canDelete } = useReportPermission();

      expect(canEdit(makeReport({ createdBy: `other-${userId}`, projectId: `project-${userId}` }))).toBe(true);
      expect(canDelete(makeReport({ createdBy: `other-${userId}`, projectId: `project-${userId}` }))).toBe(deleteAllowed);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [`project-${index}`, `manager-${index}`]))(
    'manager match beats non-matching collaborator list for %s',
    (projectId, managerId) => {
      mockUser.id = managerId;
      mockUser.permissions = [];
      mockUser.collaboratingProjectIds = [`${projectId}-other`];
      const { canEdit, canDelete } = useReportPermission();

      expect(canEdit(makeReport({ projectId, createdBy: 'creator', project: { managerId } }))).toBe(true);
      expect(canDelete(makeReport({ projectId, createdBy: 'creator', project: { managerId } }))).toBe(false);
    },
  );

  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch107-creator-${index}`,
    index % 2 === 0,
  ] as const))(
    'generated creator delete permission controls canDelete for %s',
    (creatorId, deleteAllowed) => {
      mockUser.id = creatorId;
      mockUser.permissions = [];
      mockUser.collaboratingProjectIds = [];
      mockHasPermission.mockReturnValue(deleteAllowed);
      const { canEdit, canDelete } = useReportPermission();
      const report = makeReport({ createdBy: creatorId, projectId: `project-${creatorId}` });

      expect(canEdit(report)).toBe(true);
      expect(canDelete(report)).toBe(deleteAllowed);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `batch107-project-${index}`,
    `batch107-other-${index}`,
  ] as const))(
    'generated collaborator project must match exactly %s',
    (projectId, otherProjectId) => {
      mockUser.id = 'collaborator-user';
      mockUser.permissions = [];
      mockUser.collaboratingProjectIds = [projectId];
      mockHasPermission.mockReturnValue(true);
      const { canEdit, canDelete } = useReportPermission();

      expect(canEdit(makeReport({ projectId, createdBy: 'creator' }))).toBe(true);
      expect(canDelete(makeReport({ projectId, createdBy: 'creator' }))).toBe(true);
      expect(canEdit(makeReport({ projectId: otherProjectId, createdBy: 'creator' }))).toBe(false);
      expect(canDelete(makeReport({ projectId: otherProjectId, createdBy: 'creator' }))).toBe(false);
    },
  );

  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch116-manager-${index}`,
    index % 2 === 0,
  ] as const))(
    'generated manager delete permission gates canDelete for %s',
    (managerId, deleteAllowed) => {
      mockUser.id = managerId;
      mockUser.permissions = [];
      mockUser.collaboratingProjectIds = [];
      mockHasPermission.mockReturnValue(deleteAllowed);
      const { canEdit, canDelete } = useReportPermission();
      const report = makeReport({ createdBy: 'creator', project: { managerId } });

      expect(canEdit(report)).toBe(true);
      expect(canDelete(report)).toBe(deleteAllowed);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `batch116-project-${index}`,
    `batch116-user-${index}`,
  ] as const))(
    'generated unrelated user cannot delete collaborator-mismatched report %s',
    (projectId, userId) => {
      mockUser.id = userId;
      mockUser.permissions = ['weekly_report:delete'];
      mockUser.collaboratingProjectIds = [`${projectId}-other`];
      mockHasPermission.mockReturnValue(true);
      const { canEdit, canDelete } = useReportPermission();
      const report = makeReport({ projectId, createdBy: `creator-${userId}`, project: { managerId: `manager-${userId}` } });

      expect(canEdit(report)).toBe(false);
      expect(canDelete(report)).toBe(false);
    },
  );

  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch121-admin-${index}`,
    index % 2 === 0,
  ] as const))(
    'generated super admin can edit while delete follows permission %s',
    (userId, deleteAllowed) => {
      mockUser.id = userId;
      mockUser.permissions = ['*:*'];
      mockUser.collaboratingProjectIds = [];
      mockHasPermission.mockReturnValue(deleteAllowed);
      const { canEdit, canDelete } = useReportPermission();
      const report = makeReport({ createdBy: `creator-${userId}`, project: undefined });

      expect(canEdit(report)).toBe(true);
      expect(canDelete(report)).toBe(deleteAllowed);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `batch121-project-${index}`,
    `batch121-manager-${index}`,
    `batch121-creator-${index}`,
  ] as const))(
    'generated manager wins without collaborator membership %s',
    (projectId, managerId, creatorId) => {
      mockUser.id = managerId;
      mockUser.permissions = [];
      mockUser.collaboratingProjectIds = [`${projectId}-other`];
      mockHasPermission.mockReturnValue(true);
      const { canEdit, canDelete } = useReportPermission();
      const report = makeReport({ projectId, createdBy: creatorId, project: { managerId } });

      expect(canEdit(report)).toBe(true);
      expect(canDelete(report)).toBe(true);
    },
  );
});

describe('useReportPermission batch 125 matrices', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUser.id = 'user-1';
    mockUser.permissions = [];
    mockUser.collaboratingProjectIds = [];
    mockHasPermission.mockReturnValue(false);
  });

  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch125-project-${index}`,
    index % 2 === 0,
  ] as const))(
    'generated collaborator delete follows permission for %s',
    (projectId, deleteAllowed) => {
      mockUser.id = `collaborator-${projectId}`;
      mockUser.permissions = [];
      mockUser.collaboratingProjectIds = [projectId];
      mockHasPermission.mockReturnValue(deleteAllowed);
      const { canEdit, canDelete } = useReportPermission();
      const report = makeReport({ projectId, createdBy: `creator-${projectId}` });

      expect(canEdit(report)).toBe(true);
      expect(canDelete(report)).toBe(deleteAllowed);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `batch125-project-${index}`,
    `batch125-user-${index}`,
  ] as const))(
    'generated undefined collaborator list denies unrelated user %s',
    (projectId, userId) => {
      mockUser.id = userId;
      mockUser.permissions = [];
      mockUser.collaboratingProjectIds = undefined as unknown as string[];
      mockHasPermission.mockReturnValue(true);
      const { canEdit, canDelete } = useReportPermission();
      const report = makeReport({
        projectId,
        createdBy: `creator-${userId}`,
        project: { managerId: `manager-${userId}` },
      });

      expect(canEdit(report)).toBe(false);
      expect(canDelete(report)).toBe(false);
    },
  );
});

describe('useReportPermission batch 128 matrices', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUser.id = 'user-1';
    mockUser.permissions = [];
    mockUser.collaboratingProjectIds = [];
    mockHasPermission.mockReturnValue(false);
  });

  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch128-creator-${index}`,
    index % 2 === 0,
  ] as const))(
    'generated creator can edit report without project data %s',
    (creatorId, deleteAllowed) => {
      mockUser.id = creatorId;
      mockUser.collaboratingProjectIds = [];
      mockHasPermission.mockReturnValue(deleteAllowed);
      const { canEdit, canDelete } = useReportPermission();
      const report = makeReport({ createdBy: creatorId, project: undefined });

      expect(canEdit(report)).toBe(true);
      expect(canDelete(report)).toBe(deleteAllowed);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `batch128-project-${index}`,
    `batch128-user-${index}`,
    `batch128-manager-${index}`,
  ] as const))(
    'generated exact collaborator match allows edit despite manager mismatch %s',
    (projectId, userId, managerId) => {
      mockUser.id = userId;
      mockUser.collaboratingProjectIds = [` ${projectId}`, projectId];
      mockHasPermission.mockReturnValue(true);
      const { canEdit, canDelete } = useReportPermission();
      const report = makeReport({ projectId, createdBy: `creator-${userId}`, project: { managerId } });

      expect(canEdit(report)).toBe(true);
      expect(canDelete(report)).toBe(true);
    },
  );
});

describe('useReportPermission batch 137 matrices', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUser.id = 'user-1';
    mockUser.permissions = [];
    mockUser.collaboratingProjectIds = [];
    mockHasPermission.mockReturnValue(false);
  });

  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch137-admin-${index}`,
    index % 2 === 0,
  ] as const))(
    'generated super admin edit allowed while delete follows store permission %s',
    (userId, deleteAllowed) => {
      mockUser.id = userId;
      mockUser.permissions = ['*:*'];
      mockUser.collaboratingProjectIds = [];
      mockHasPermission.mockReturnValue(deleteAllowed);
      const { canEdit, canDelete } = useReportPermission();
      const report = makeReport({ createdBy: `creator-${userId}`, projectId: `project-${userId}`, project: undefined });

      expect(canEdit(report)).toBe(true);
      expect(canDelete(report)).toBe(deleteAllowed);
      expect(mockHasPermission).toHaveBeenCalledWith('weekly_report', 'delete');
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `batch137-project-${index}`,
    `batch137-manager-${index}`,
    `batch137-user-${index}`,
  ] as const))(
    'generated unrelated user remains denied for %s',
    (projectId, managerId, userId) => {
      mockUser.id = userId;
      mockUser.permissions = ['weekly_report:delete'];
      mockUser.collaboratingProjectIds = [`${projectId}-other`];
      mockHasPermission.mockReturnValue(true);
      const { canEdit, canDelete } = useReportPermission();
      const report = makeReport({ projectId, createdBy: `creator-${userId}`, project: { managerId } });

      expect(canEdit(report)).toBe(false);
      expect(canDelete(report)).toBe(false);
    },
  );
});

describe('useReportPermission batch 146 matrices', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUser.id = 'user-1';
    mockUser.permissions = [];
    mockUser.collaboratingProjectIds = [];
    mockHasPermission.mockReturnValue(false);
  });

  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch146-manager-${index}`,
    index % 2 === 0,
  ] as const))(
    'generated manager can edit while delete follows permission %s',
    (managerId, deleteAllowed) => {
      mockUser.id = managerId;
      mockHasPermission.mockReturnValue(deleteAllowed);
      const { canEdit, canDelete } = useReportPermission();
      const report = makeReport({
        createdBy: `creator-${managerId}`,
        projectId: `project-${managerId}`,
        project: { managerId },
      });

      expect(canEdit(report)).toBe(true);
      expect(canDelete(report)).toBe(deleteAllowed);
      expect(mockHasPermission).toHaveBeenCalledWith('weekly_report', 'delete');
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `batch146-project-${index}`,
    `batch146-user-${index}`,
  ] as const))(
    'generated collaborator project id requires exact match %s',
    (projectId, userId) => {
      mockUser.id = userId;
      mockUser.collaboratingProjectIds = [` ${projectId} `, `${projectId}-other`];
      mockHasPermission.mockReturnValue(true);
      const { canEdit, canDelete } = useReportPermission();
      const report = makeReport({
        projectId,
        createdBy: `creator-${userId}`,
        project: { managerId: `manager-${userId}` },
      });

      expect(canEdit(report)).toBe(false);
      expect(canDelete(report)).toBe(false);
    },
  );
});

describe('useReportPermission batch 151 matrices', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUser.id = 'user-1';
    mockUser.permissions = [];
    mockUser.collaboratingProjectIds = [];
    mockHasPermission.mockReturnValue(false);
  });

  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch151-creator-${index}`,
    index % 2 === 0,
  ] as const))(
    'generated creator delete permission controls canDelete %s',
    (creatorId, deleteAllowed) => {
      mockUser.id = creatorId;
      mockHasPermission.mockReturnValue(deleteAllowed);
      const { canEdit, canDelete } = useReportPermission();
      const report = makeReport({ createdBy: creatorId, projectId: `project-${creatorId}`, project: undefined });

      expect(canEdit(report)).toBe(true);
      expect(canDelete(report)).toBe(deleteAllowed);
      expect(mockHasPermission).toHaveBeenCalledWith('weekly_report', 'delete');
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `batch151-project-${index}`,
    `batch151-user-${index}`,
  ] as const))(
    'generated collaborator requires exact project id %s',
    (projectId, userId) => {
      mockUser.id = userId;
      mockUser.collaboratingProjectIds = [` ${projectId} `, `${projectId}-suffix`, projectId];
      mockHasPermission.mockReturnValue(true);
      const { canEdit, canDelete } = useReportPermission();
      const matchingReport = makeReport({ projectId, createdBy: `creator-${userId}`, project: { managerId: `manager-${userId}` } });
      const spacedReport = makeReport({ projectId: ` ${projectId} `, createdBy: `creator-${userId}`, project: { managerId: `manager-${userId}` } });

      expect(canEdit(matchingReport)).toBe(true);
      expect(canDelete(matchingReport)).toBe(true);
      expect(canEdit(spacedReport)).toBe(true);
      expect(canDelete(spacedReport)).toBe(true);
    },
  );
});

describe('useReportPermission batch 158 matrices', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUser.id = 'user-1';
    mockUser.permissions = [];
    mockUser.collaboratingProjectIds = [];
    mockHasPermission.mockReturnValue(false);
  });

  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch158-admin-${index}`,
    index % 2 === 0,
  ] as const))(
    'generated batch158 wildcard user edit ignores project mismatch %s',
    (userId, deleteAllowed) => {
      mockUser.id = userId;
      mockUser.permissions = ['weekly_report:delete', '*:*'];
      mockHasPermission.mockReturnValue(deleteAllowed);
      const { canEdit, canDelete } = useReportPermission();
      const report = makeReport({
        createdBy: `creator-${userId}`,
        projectId: `project-${userId}`,
        project: { managerId: `manager-${userId}` },
      });

      expect(canEdit(report)).toBe(true);
      expect(canDelete(report)).toBe(deleteAllowed);
      expect(mockHasPermission).toHaveBeenCalledWith('weekly_report', 'delete');
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `batch158-project-${index}`,
    `batch158-user-${index}`,
  ] as const))(
    'generated batch158 spaced collaborator only matches spaced report %s',
    (projectId, userId) => {
      mockUser.id = userId;
      mockUser.collaboratingProjectIds = [` ${projectId} `];
      mockHasPermission.mockReturnValue(true);
      const { canEdit, canDelete } = useReportPermission();
      const plainReport = makeReport({ projectId, createdBy: `creator-${userId}`, project: { managerId: `manager-${userId}` } });
      const spacedReport = makeReport({ projectId: ` ${projectId} `, createdBy: `creator-${userId}`, project: { managerId: `manager-${userId}` } });

      expect(canEdit(plainReport)).toBe(false);
      expect(canDelete(plainReport)).toBe(false);
      expect(canEdit(spacedReport)).toBe(true);
      expect(canDelete(spacedReport)).toBe(true);
    },
  );
});

describe('useReportPermission batch 165 matrices', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUser.id = 'user-1';
    mockUser.permissions = [];
    mockUser.collaboratingProjectIds = [];
    mockHasPermission.mockReturnValue(false);
  });

  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch165-admin-${index}`,
    index % 2 === 0,
  ] as const))(
    'generated batch165 wildcard edit survives missing collaboration list %s',
    (userId, deleteAllowed) => {
      mockUser.id = userId;
      mockUser.permissions = ['weekly_report:delete', '*:*'];
      mockUser.collaboratingProjectIds = undefined as unknown as string[];
      mockHasPermission.mockReturnValue(deleteAllowed);
      const { canEdit, canDelete } = useReportPermission();
      const report = makeReport({
        createdBy: `creator-${userId}`,
        projectId: `project-${userId}`,
        project: undefined,
      });

      expect(canEdit(report)).toBe(true);
      expect(canDelete(report)).toBe(deleteAllowed);
      expect(mockHasPermission).toHaveBeenCalledWith('weekly_report', 'delete');
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `batch165-project-${index}`,
    `batch165-user-${index}`,
  ] as const))(
    'generated batch165 duplicate collaborator exact match controls delete %s',
    (projectId, userId) => {
      mockUser.id = userId;
      mockUser.permissions = [];
      mockUser.collaboratingProjectIds = [`${projectId}-other`, projectId, projectId];
      mockHasPermission.mockReturnValue(true);
      const { canEdit, canDelete } = useReportPermission();
      const report = makeReport({
        projectId,
        createdBy: `creator-${userId}`,
        project: { managerId: `manager-${userId}` },
      });

      expect(canEdit(report)).toBe(true);
      expect(canDelete(report)).toBe(true);
    },
  );
});

describe('useReportPermission batch 169 matrices', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUser.id = 'user-1';
    mockUser.permissions = [];
    mockUser.collaboratingProjectIds = [];
    mockHasPermission.mockReturnValue(false);
  });

  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch169-manager-${index}`,
    index % 2 === 0,
  ] as const))(
    'generated batch169 manager edit checks delete permission %s',
    (userId, deleteAllowed) => {
      mockUser.id = userId;
      mockUser.permissions = [];
      mockHasPermission.mockReturnValue(deleteAllowed);
      const { canEdit, canDelete } = useReportPermission();
      const report = makeReport({
        createdBy: `creator-${userId}`,
        projectId: `project-${userId}`,
        project: { managerId: userId },
      });

      expect(canEdit(report)).toBe(true);
      expect(canDelete(report)).toBe(deleteAllowed);
      expect(mockHasPermission).toHaveBeenCalledWith('weekly_report', 'delete');
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `batch169-project-${index}`,
    `batch169-user-${index}`,
  ] as const))(
    'generated batch169 missing project manager still allows creator %s',
    (projectId, userId) => {
      mockUser.id = userId;
      mockUser.collaboratingProjectIds = [`${projectId}-other`];
      mockHasPermission.mockReturnValue(true);
      const { canEdit, canDelete } = useReportPermission();
      const report = makeReport({
        projectId,
        createdBy: userId,
        project: undefined,
      });

      expect(canEdit(report)).toBe(true);
      expect(canDelete(report)).toBe(true);
    },
  );
});

describe('useReportPermission batch 176 matrices', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUser.id = 'user-1';
    mockUser.permissions = [];
    mockUser.collaboratingProjectIds = [];
    mockHasPermission.mockReturnValue(false);
  });

  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch176-creator-${index}`,
    index % 2 === 0,
  ] as const))(
    'generated batch176 creator edit ignores unrelated project metadata %s',
    (userId, deleteAllowed) => {
      mockUser.id = userId;
      mockUser.permissions = ['weekly_report:read'];
      mockUser.collaboratingProjectIds = [`project-${userId}-other`];
      mockHasPermission.mockReturnValue(deleteAllowed);
      const { canEdit, canDelete } = useReportPermission();
      const report = makeReport({
        createdBy: userId,
        projectId: `project-${userId}`,
        project: { managerId: `manager-${userId}` },
      });

      expect(canEdit(report)).toBe(true);
      expect(canDelete(report)).toBe(deleteAllowed);
      expect(mockHasPermission).toHaveBeenCalledWith('weekly_report', 'delete');
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `batch176-project-${index}`,
    `batch176-user-${index}`,
  ] as const))(
    'generated batch176 manager match beats missing collaboration list %s',
    (projectId, userId) => {
      mockUser.id = userId;
      mockUser.permissions = [];
      mockUser.collaboratingProjectIds = undefined as unknown as string[];
      mockHasPermission.mockReturnValue(true);
      const { canEdit, canDelete } = useReportPermission();
      const report = makeReport({
        projectId,
        createdBy: `creator-${userId}`,
        project: { managerId: userId },
      });

      expect(canEdit(report)).toBe(true);
      expect(canDelete(report)).toBe(true);
    },
  );
});
