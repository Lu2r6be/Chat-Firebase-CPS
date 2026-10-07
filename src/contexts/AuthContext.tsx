import { onAuthStateChanged, type User } from 'firebase/auth';
import {
  createContext,
  useCallback,
  useEffect,
  useMemo,
  useState,
  type PropsWithChildren,
} from 'react';
import { auth } from '../config/firebase';
import {
  loginUser,
  logoutUser,
  registerUser,
} from '../services/authService';

type RegistrationData = {
  name: string;
  email: string;
  password: string;
  phoneNumber: string;
  birthDate: string;
  photoUri: string;
};

type AuthContextValue = {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (data: RegistrationData) => Promise<void>;
  logout: () => Promise<void>;
};

export const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: PropsWithChildren) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => onAuthStateChanged(auth, (nextUser) => {
    setUser(nextUser);
    setLoading(false);
  }), []);

  const login = useCallback(async (email: string, password: string) => {
    await loginUser(email, password);
  }, []);

  const register = useCallback(async (data: RegistrationData) => {
    await registerUser(data);
  }, []);

  const logout = useCallback(async () => {
    await logoutUser();
  }, []);

  const value = useMemo(() => ({ user, loading, login, register, logout }), [
    user,
    loading,
    login,
    register,
    logout,
  ]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
