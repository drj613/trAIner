'use client';

import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { User, AuthContextType } from '@/types/auth';

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Dummy user data for fake authentication
const DUMMY_USERS = [
  { id: '1', email: 'demo@example.com', password: 'password', name: 'Demo User' },
  { id: '2', email: 'test@test.com', password: '123456', name: 'Test User' },
  { id: '3', email: 'user@demo.com', password: 'demo', name: 'Demo Person' },
];

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Check for existing session on mount
  useEffect(() => {
    const savedUser = localStorage.getItem('trainer-app-user');
    if (savedUser) {
      setUser(JSON.parse(savedUser));
    }
    setIsLoading(false);
  }, []);

  const login = async (email: string, password: string): Promise<boolean> => {
    setIsLoading(true);
    
    // Simulate API call delay
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    const foundUser = DUMMY_USERS.find(
      u => u.email === email && u.password === password
    );
    
    if (foundUser) {
      const userSession: User = {
        id: foundUser.id,
        email: foundUser.email,
        name: foundUser.name,
      };
      
      setUser(userSession);
      localStorage.setItem('trainer-app-user', JSON.stringify(userSession));
      setIsLoading(false);
      return true;
    }
    
    setIsLoading(false);
    return false;
  };

  const logout = () => {
    setUser(null);
    localStorage.removeItem('trainer-app-user');
  };

  return (
    <AuthContext.Provider value={{ user, login, logout, isLoading }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}