import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const schemaPath = resolve(process.cwd(), 'prisma/schema.prisma');
const schemaContent = readFileSync(schemaPath, 'utf-8');

function extractModels(content: string): Record<string, { fields: string[]; mappings: string[]; indexes: string[]; uniques: string[]; relations: string[] }> {
  const models: Record<string, { fields: string[]; mappings: string[]; indexes: string[]; uniques: string[]; relations: string[] }> = {};
  const lines = content.split('\n');
  let currentModel: string | null = null;
  let braceDepth = 0;
  let bodyLines: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (currentModel === null) {
      const modelStart = trimmed.match(/^model\s+(\w+)\s*\{$/);
      if (modelStart) {
        currentModel = modelStart[1];
        braceDepth = 1;
        bodyLines = [];
      }
    } else {
      for (const ch of trimmed) {
        if (ch === '{') braceDepth++;
        else if (ch === '}') braceDepth--;
      }
      if (braceDepth <= 0) {
        const fields: string[] = [];
        const mappings: string[] = [];
        const indexes: string[] = [];
        const uniques: string[] = [];
        const relations: string[] = [];
        for (const bodyLine of bodyLines) {
          const bt = bodyLine.trim();
          if (bt.startsWith('//') || bt === '') continue;
          if (bt.startsWith('@@index(')) { indexes.push(bt); continue; }
          if (bt.startsWith('@@unique(')) { uniques.push(bt); continue; }
          if (bt.startsWith('@@map(')) {
            const m = bt.match(/@@map\("([^"]+)"\)/);
            if (m) mappings.push(m[1]);
            continue;
          }
          if (bt.startsWith('@@')) continue;
          const fieldMatch = bt.match(/^(\w+)\s+/);
          if (fieldMatch) {
            fields.push(fieldMatch[1]);
            if (bt.includes('@relation')) {
              relations.push(fieldMatch[1]);
            }
          }
        }
        models[currentModel] = { fields, mappings, indexes, uniques, relations };
        currentModel = null;
      } else {
        bodyLines.push(line);
      }
    }
  }
  return models;
}

function extractEnums(content: string): Record<string, string[]> {
  const enums: Record<string, string[]> = {};
  const lines = content.split('\n');
  let currentEnum: string | null = null;
  let braceDepth = 0;
  let values: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (currentEnum === null) {
      const enumStart = trimmed.match(/^enum\s+(\w+)\s*\{$/);
      if (enumStart) {
        currentEnum = enumStart[1];
        braceDepth = 1;
        values = [];
      }
    } else {
      for (const ch of trimmed) {
        if (ch === '{') braceDepth++;
        else if (ch === '}') braceDepth--;
      }
      if (braceDepth <= 0) {
        enums[currentEnum] = values;
        currentEnum = null;
      } else {
        const v = trimmed.replace(/\/\/.*$/, '').trim();
        if (v && !v.startsWith('//')) values.push(v);
      }
    }
  }
  return enums;
}

const models = extractModels(schemaContent);
const enums = extractEnums(schemaContent);

const CORE_MODELS = [
  'User', 'Role', 'Permission', 'UserRole', 'RolePermission',
  'Project', 'ProjectMember', 'Holiday', 'Activity', 'RoleMember',
  'ActivityExecutor', 'CheckItem', 'ProjectArchive', 'ProjectTemplate',
  'TemplateActivity', 'RiskAssessment', 'RiskItem', 'RiskItemLog',
  'WeeklyReport', 'Product', 'ProductChangeLog',
  'AiConfig', 'AiUsageLog', 'WecomConfig',
  'ActivityComment', 'Notification', 'AuditLog',
];

const CORE_ENUMS = [
  'UserStatus', 'ProjectStatus', 'Priority', 'ActivityType',
  'ActivityStatus', 'ExecutorSource', 'HolidaySource',
  'ReportStatus', 'ProgressStatus', 'ProductStatus',
];

describe('Prisma Schema Validation', () => {
  describe('Core models exist', () => {
    it.each(CORE_MODELS)('model %s exists', (modelName) => {
      expect(models).toHaveProperty(modelName);
    });

    it('has exactly 27 models', () => {
      expect(Object.keys(models)).toHaveLength(CORE_MODELS.length);
    });
  });

  describe('Core enums exist', () => {
    it.each(CORE_ENUMS)('enum %s exists', (enumName) => {
      expect(enums).toHaveProperty(enumName);
    });

    it('has exactly 10 enums', () => {
      expect(Object.keys(enums)).toHaveLength(CORE_ENUMS.length);
    });
  });

  describe('Table name mapping (@@map)', () => {
    it('User maps to users', () => {
      expect(models.User.mappings).toContain('users');
    });

    it('Role maps to roles', () => {
      expect(models.Role.mappings).toContain('roles');
    });

    it('Permission maps to permissions', () => {
      expect(models.Permission.mappings).toContain('permissions');
    });

    it('UserRole maps to user_roles', () => {
      expect(models.UserRole.mappings).toContain('user_roles');
    });

    it('RolePermission maps to role_permissions', () => {
      expect(models.RolePermission.mappings).toContain('role_permissions');
    });

    it('Project maps to projects', () => {
      expect(models.Project.mappings).toContain('projects');
    });

    it('ProjectMember maps to project_members', () => {
      expect(models.ProjectMember.mappings).toContain('project_members');
    });

    it('Holiday maps to holidays', () => {
      expect(models.Holiday.mappings).toContain('holidays');
    });

    it('Activity maps to activities', () => {
      expect(models.Activity.mappings).toContain('activities');
    });

    it('ActivityExecutor maps to activity_executors', () => {
      expect(models.ActivityExecutor.mappings).toContain('activity_executors');
    });

    it('CheckItem maps to check_items', () => {
      expect(models.CheckItem.mappings).toContain('check_items');
    });

    it('WeeklyReport maps to weekly_reports', () => {
      expect(models.WeeklyReport.mappings).toContain('weekly_reports');
    });

    it('AuditLog maps to audit_logs', () => {
      expect(models.AuditLog.mappings).toContain('audit_logs');
    });
  });

  describe('Unique constraints', () => {
    it('User has unique username', () => {
      expect(models.User.fields).toContain('username');
      expect(schemaContent).toMatch(/username\s+String\?\s+@unique/);
    });

    it('User has unique wecomUserId', () => {
      expect(models.User.fields).toContain('wecomUserId');
      expect(schemaContent).toMatch(/wecomUserId\s+String\?\s+@unique/);
    });

    it('Role has unique name', () => {
      expect(schemaContent).toMatch(/model Role[\s\S]*?name\s+String\s+@unique/);
    });

    it('Permission has composite unique on [resource, action]', () => {
      expect(models.Permission.uniques).toHaveLength(1);
      expect(models.Permission.uniques[0]).toContain('resource');
      expect(models.Permission.uniques[0]).toContain('action');
    });

    it('Holiday has unique date', () => {
      expect(schemaContent).toMatch(/model Holiday[\s\S]*?date\s+DateTime\s+@unique/);
    });

    it('RoleMember has composite unique on [roleId, userId]', () => {
      expect(models.RoleMember.uniques).toHaveLength(1);
      expect(models.RoleMember.uniques[0]).toContain('roleId');
      expect(models.RoleMember.uniques[0]).toContain('userId');
    });

    it('ActivityExecutor has composite unique on [activityId, userId]', () => {
      expect(models.ActivityExecutor.uniques).toHaveLength(1);
      expect(models.ActivityExecutor.uniques[0]).toContain('activityId');
      expect(models.ActivityExecutor.uniques[0]).toContain('userId');
    });

    it('WeeklyReport has composite unique on [projectId, year, weekNumber]', () => {
      expect(models.WeeklyReport.uniques).toHaveLength(1);
      expect(models.WeeklyReport.uniques[0]).toContain('projectId');
      expect(models.WeeklyReport.uniques[0]).toContain('year');
      expect(models.WeeklyReport.uniques[0]).toContain('weekNumber');
    });

    it('Product has composite unique on [model, revision]', () => {
      expect(models.Product.uniques).toHaveLength(1);
      expect(models.Product.uniques[0]).toContain('model');
      expect(models.Product.uniques[0]).toContain('revision');
    });
  });

  describe('Required fields', () => {
    it('User has required realName (no ?)', () => {
      const userBlock = schemaContent.match(/model User\s*\{([\s\S]*?)\}/)?.[1] ?? '';
      expect(userBlock).toMatch(/realName\s+String\b/);
      expect(userBlock).not.toMatch(/realName\s+String\?/);
    });

    it('Project has required name and managerId', () => {
      const projectBlock = schemaContent.match(/model Project\s*\{([\s\S]*?)\}/)?.[1] ?? '';
      expect(projectBlock).toMatch(/name\s+String\b/);
      expect(projectBlock).not.toMatch(/name\s+String\?/);
      expect(projectBlock).toMatch(/managerId\s+String\b/);
      expect(projectBlock).not.toMatch(/managerId\s+String\?/);
    });

    it('Activity has required projectId and name', () => {
      const activityBlock = schemaContent.match(/model Activity\s*\{([\s\S]*?)\}/)?.[1] ?? '';
      expect(activityBlock).toMatch(/projectId\s+String\b/);
      expect(activityBlock).not.toMatch(/projectId\s+String\?/);
      expect(activityBlock).toMatch(/name\s+String\b/);
      expect(activityBlock).not.toMatch(/name\s+String\?/);
    });

    it('WeeklyReport has required projectId, year, weekNumber', () => {
      const reportBlock = schemaContent.match(/model WeeklyReport\s*\{([\s\S]*?)\}/)?.[1] ?? '';
      expect(reportBlock).toMatch(/projectId\s+String\b[^?]/);
      expect(reportBlock).toMatch(/year\s+Int\b/);
      expect(reportBlock).not.toMatch(/year\s+Int\?/);
      expect(reportBlock).toMatch(/weekNumber\s+Int\b/);
      expect(reportBlock).not.toMatch(/weekNumber\s+Int\?/);
    });

    it('RiskItem has required title and severity', () => {
      const riskBlock = schemaContent.match(/model RiskItem\s*\{([\s\S]*?)\}/)?.[1] ?? '';
      expect(riskBlock).toMatch(/title\s+String\b/);
      expect(riskBlock).not.toMatch(/title\s+String\?/);
      expect(riskBlock).toMatch(/severity\s+String\b/);
      expect(riskBlock).not.toMatch(/severity\s+String\?/);
    });
  });

  describe('Cascade delete on critical relations', () => {
    it('UserRole cascades on user delete', () => {
      expect(schemaContent).toMatch(/user User @relation\(fields: \[userId\][^)]*onDelete: Cascade/);
    });

    it('Activity cascades on project delete', () => {
      expect(schemaContent).toMatch(/project\s+Project\s+@relation\(fields: \[projectId\][^)]*onDelete: Cascade/);
    });

    it('ActivityExecutor cascades on activity delete', () => {
      expect(schemaContent).toMatch(/activity Activity @relation\(fields: \[activityId\][^)]*onDelete: Cascade/);
    });

    it('Activity.role uses SetNull on delete', () => {
      expect(schemaContent).toMatch(/role\s+Role\?\s+@relation\("ActivityRole"[^)]*onDelete: SetNull/);
    });

    it('RiskItem.assessment uses SetNull on delete', () => {
      expect(schemaContent).toMatch(/assessment RiskAssessment\?\s+@relation\(fields: \[assessmentId\][^)]*onDelete: SetNull/);
    });

    it('Notification cascades on user delete', () => {
      expect(schemaContent).toMatch(/user User @relation\(fields: \[userId\][^)]*onDelete: Cascade/);
    });
  });

  describe('Performance indexes', () => {
    it('Activity has projectId index', () => {
      expect(models.Activity.indexes.length).toBeGreaterThanOrEqual(1);
      expect(models.Activity.indexes.some(i => i.includes('projectId'))).toBe(true);
    });

    it('AuditLog has createdAt index', () => {
      expect(models.AuditLog.indexes.some(i => i.includes('createdAt'))).toBe(true);
    });

    it('AuditLog has resourceType index', () => {
      expect(models.AuditLog.indexes.some(i => i.includes('resourceType'))).toBe(true);
    });

    it('Holiday has year index', () => {
      expect(models.Holiday.indexes.some(i => i.includes('year'))).toBe(true);
    });

    it('RoleMember has composite index on [roleId, isActive, sortOrder]', () => {
      const idx = models.RoleMember.indexes.find(i => i.includes('roleId') && i.includes('isActive'));
      expect(idx).toBeDefined();
    });

    it('Notification has composite index on [userId, isRead]', () => {
      const idx = models.Notification.indexes.find(i => i.includes('userId') && i.includes('isRead'));
      expect(idx).toBeDefined();
    });
  });

  describe('Enum values', () => {
    it('UserStatus has ACTIVE and DISABLED', () => {
      expect(enums.UserStatus).toContain('ACTIVE');
      expect(enums.UserStatus).toContain('DISABLED');
    });

    it('ActivityStatus has all 4 states', () => {
      expect(enums.ActivityStatus).toEqual(expect.arrayContaining(['NOT_STARTED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED']));
      expect(enums.ActivityStatus).toHaveLength(4);
    });

    it('ExecutorSource has ROLE_AUTO, MANUAL_KEEP, MANUAL_ADD', () => {
      expect(enums.ExecutorSource).toEqual(expect.arrayContaining(['ROLE_AUTO', 'MANUAL_KEEP', 'MANUAL_ADD']));
    });

    it('Priority has LOW, MEDIUM, HIGH, CRITICAL', () => {
      expect(enums.Priority).toEqual(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']);
    });

    it('ProjectStatus has expected values', () => {
      expect(enums.ProjectStatus).toEqual(expect.arrayContaining(['IN_PROGRESS', 'COMPLETED', 'ON_HOLD', 'ARCHIVED']));
    });

    it('HolidaySource has expected values', () => {
      expect(enums.HolidaySource).toEqual(expect.arrayContaining(['OFFICIAL_API', 'BUILT_IN', 'ALGORITHM', 'MANUAL_INPUT']));
    });

    it('ReportStatus has DRAFT, SUBMITTED, ARCHIVED', () => {
      expect(enums.ReportStatus).toEqual(['DRAFT', 'SUBMITTED', 'ARCHIVED']);
    });
  });

  describe('Relation integrity', () => {
    it('User has field for UserRole', () => {
      expect(models.User.fields).toContain('userRoles');
    });

    it('User has field for ActivityExecutor', () => {
      expect(models.User.fields).toContain('activityExecutors');
    });

    it('User has explicit relation to managed projects', () => {
      expect(models.User.relations).toContain('managedProjects');
    });

    it('Activity has explicit relation to project and role', () => {
      expect(models.Activity.relations).toContain('project');
      expect(models.Activity.relations).toContain('role');
    });

    it('Project has explicit relation to manager (User)', () => {
      expect(models.Project.relations).toContain('manager');
    });

    it('RiskItem has explicit relations to project, assessment, owner', () => {
      expect(models.RiskItem.relations).toContain('project');
      expect(models.RiskItem.relations).toContain('assessment');
      expect(models.RiskItem.relations).toContain('owner');
    });

    it('WeeklyReport has explicit relations to project and creator', () => {
      expect(models.WeeklyReport.relations).toContain('project');
      expect(models.WeeklyReport.relations).toContain('creator');
    });

    it('Product has explicit relation to project', () => {
      expect(models.Product.relations).toContain('project');
    });
  });

  describe('Default values', () => {
    it('User.canLogin defaults to true', () => {
      expect(schemaContent).toMatch(/model User[\s\S]*?canLogin\s+Boolean\s+@default\(true\)/);
    });

    it('User.status defaults to ACTIVE', () => {
      expect(schemaContent).toMatch(/model User[\s\S]*?status\s+UserStatus\s+@default\(ACTIVE\)/);
    });

    it('Activity.status defaults to NOT_STARTED', () => {
      expect(schemaContent).toMatch(/model Activity[\s\S]*?status\s+ActivityStatus\s+@default\(NOT_STARTED\)/);
    });

    it('Project.status defaults to IN_PROGRESS', () => {
      expect(schemaContent).toMatch(/model Project[\s\S]*?status\s+ProjectStatus\s+@default\(IN_PROGRESS\)/);
    });

    it('ActivityExecutor.source defaults to ROLE_AUTO', () => {
      expect(schemaContent).toMatch(/model ActivityExecutor[\s\S]*?source\s+ExecutorSource\s+@default\(ROLE_AUTO\)/);
    });

    it('Holiday.type defaults to HOLIDAY', () => {
      expect(schemaContent).toMatch(/model Holiday[\s\S]*?type\s+String\s+@default\("HOLIDAY"\)/);
    });

    it('Activity has planStartDate field', () => {
      expect(schemaContent).toMatch(/model Activity[\s\S]*?planStartDate/);
    });
  });

  it('schema contains User model', () => {
    expect(schemaContent).toMatch(/model User/);
  });
});
