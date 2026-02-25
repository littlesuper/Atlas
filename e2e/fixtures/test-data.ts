/** Test user credentials */
export const credentials = {
  admin: { username: 'admin', password: 'admin123' },
  zhangsan: { username: 'zhangsan', password: '123456' },
  lisi: { username: 'lisi', password: '123456' },
};

/** Generate a unique name with timestamp to avoid collisions */
export function uniqueName(prefix: string): string {
  return `${prefix}_${Date.now()}`;
}

/** Chinese text constants for form fields */
export const text = {
  projectName: '自动化测试项目',
  projectDesc: '由E2E测试自动创建的项目',
  activityName: '自动化测试活动',
  activityDesc: '由E2E测试自动创建的活动',
  productName: '自动化测试产品',
  productModel: 'TEST-001',
  productDesc: '由E2E测试自动创建的产品',
  roleName: '自动化测试角色',
  roleDesc: '由E2E测试自动创建的角色',
};
