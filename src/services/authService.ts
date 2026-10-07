import {
  createUserWithEmailAndPassword,
  deleteUser,
  signInWithEmailAndPassword,
  signOut,
  type User,
} from 'firebase/auth';
import { doc, setDoc } from 'firebase/firestore';
import { auth, db } from '../config/firebase';
import type { ChatUser } from '../types/user';
import { uploadImage } from './apiService';

export async function registerUser(input: {
  name: string;
  email: string;
  password: string;
  phoneNumber: string;
  birthDate: string;
  photoUri: string;
}): Promise<User> {
  const result = await createUserWithEmailAndPassword(
    auth,
    input.email.trim(),
    input.password,
  );

  const profile: ChatUser = {
    uid: result.user.uid,
    name: input.name.trim(),
    email: input.email.trim().toLowerCase(),
    phoneNumber: input.phoneNumber.trim(),
    birthDate: input.birthDate.trim(),
    photoUrl: '',
    createdAt: Date.now(),
  };

  try {
    profile.photoUrl = await uploadImage(input.photoUri, 'profile');
    await setDoc(doc(db, 'users', result.user.uid), profile);
  } catch (error: unknown) {
    await deleteUser(result.user);
    throw error;
  }
  return result.user;
}

export async function loginUser(email: string, password: string): Promise<User> {
  const result = await signInWithEmailAndPassword(auth, email.trim(), password);
  return result.user;
}

export async function logoutUser(): Promise<void> {
  await signOut(auth);
}
