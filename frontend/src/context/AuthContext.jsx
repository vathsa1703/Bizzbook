import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { api } from '../api/client';

const AuthContext = createContext(null);

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(() => localStorage.getItem('token') || null);
  const [loading, setLoading] = useState(true);

  // Restore session
  useEffect(() => {
    async function restoreSession() {
      if (token) {
        try {
          // Set the token globally on the api client before making the call
          api.setToken(token);
          const res = await api.getMe();
          setUser(res.user);
        } catch (err) {
          console.error('Failed to restore auth session:', err);
          // Token expired or invalid
          localStorage.removeItem('token');
          setToken(null);
          setUser(null);
          api.setToken(null);
        }
      }
      setLoading(false);
    }
    restoreSession();
  }, [token]);

  const login = useCallback(async (email, password) => {
    try {
      const res = await api.login({ email, password });
      localStorage.setItem('token', res.token);
      // Store businessType for placeholder system
      if (res.user?.businessType) {
        localStorage.setItem('businessType', res.user.businessType);
      }
      api.setToken(res.token);
      setToken(res.token);
      setUser(res.user);
      return res.user;
    } catch (err) {
      throw err;
    }
  }, []);

  const register = useCallback(async (businessName, businessType, ownerName, email, password, phone) => {
    try {
      const res = await api.register({ businessName, businessType, ownerName, email, password, phone });
      localStorage.setItem('token', res.token);
      if (res.user?.businessType) {
        localStorage.setItem('businessType', res.user.businessType);
      }
      api.setToken(res.token);
      setToken(res.token);
      const userObj = { ...res.user, companyId: res.companyId, role: res.role, setupRequired: !!res.setupRequired };
      setUser(userObj);
      return { user: userObj, setupRequired: !!res.setupRequired };
    } catch (err) {
      throw err;
    }
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem('token');
    api.setToken(null);
    setToken(null);
    setUser(null);
  }, []);

  const value = {
    user,
    token,
    loading,
    login,
    register,
    logout,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
