import { create } from 'zustand';
import { authApi } from '../api';
import { User } from '../types';
import { Message } from '@arco-design/web-react';

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  loading: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => void;
  fetchUser: () => Promise<void>;
  hasPermission: (resource: string, action: string) => boolean;
  isProjectManager: (managerId: string, projectId?: string) => boolean;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  isAuthenticated: false,
  loading: true, // 初始为 true，等待 fetchUser() 验证 token 后再决定是否跳转登录

  // 登录
  login: async (username: string, password: string) => {
    set({ loading: true });
    try {
      const response = await authApi.login({ username, password });
      const { accessToken, refreshToken, user } = response.data;

      // 存储token到localStorage
      localStorage.setItem('accessToken', accessToken);
      localStorage.setItem('refreshToken', refreshToken);

      // 更新状态
      set({
        user,
        isAuthenticated: true,
        loading: false,
      });

      Message.success('登录成功');
    } catch (error) {
      set({ loading: false });
      throw error;
    }
  },

  // 退出登录
  logout: () => {
    // 清除token
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');

    // 清除状态
    set({
      user: null,
      isAuthenticated: false,
    });

    Message.success('已退出登录');

    // 跳转到登录页
    window.location.href = '/login';
  },

  // 获取用户信息
  fetchUser: async () => {
    const accessToken = localStorage.getItem('accessToken');
    if (!accessToken) {
      set({ isAuthenticated: false, user: null, loading: false });
      return;
    }

    set({ loading: true });
    try {
      const response = await authApi.getMe();
      const user = response.data;

      set({
        user,
        isAuthenticated: true,
        loading: false,
      });
    } catch (error) {
      // 获取用户信息失败，清除token
      localStorage.removeItem('accessToken');
      localStorage.removeItem('refreshToken');
      set({
        user: null,
        isAuthenticated: false,
        loading: false,
      });
    }
  },

  // 权限检查（支持通配符）
  hasPermission: (resource: string, action: string) => {
    const { user } = get();
    if (!user || !user.permissions) {
      return false;
    }

    // 检查是否有超级管理员权限 *:*
    if (user.permissions.includes('*:*')) {
      return true;
    }

    // 检查是否有资源的所有权限 resource:*
    if (user.permissions.includes(`${resource}:*`)) {
      return true;
    }

    // 检查是否有所有资源的指定操作权限 *:action
    if (user.permissions.includes(`*:${action}`)) {
      return true;
    }

    // 检查是否有精确匹配的权限 resource:action
    if (user.permissions.includes(`${resource}:${action}`)) {
      return true;
    }

    return false;
  },

  // 检查当前用户是否可以修改指定项目（管理员、项目经理或协作者）
  isProjectManager: (managerId: string, projectId?: string) => {
    const { user } = get();
    if (!user) return false;
    // 管理员拥有所有权限
    if (user.permissions?.includes('*:*')) return true;
    // 项目经理
    if (user.id === managerId) return true;
    // 协作者
    if (projectId && user.collaboratingProjectIds?.includes(projectId)) return true;
    return false;
  },
}));
