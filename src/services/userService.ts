import { collection, doc, getDoc, onSnapshot, setDoc, updateDoc } from 'firebase/firestore';
import { auth, db } from '../config/firebase';
import type { PublicUser } from '../types/publicUser';
import { getApiUrl } from './apiService';

export function subscribeToOwnProfile(uid: string, onError: (error: unknown) => void) {
  return onSnapshot(
    doc(db, 'users', uid),
    (snapshot) => {
      if (!snapshot.exists()) return;

      const profile = snapshot.data();
      if (typeof profile.name !== 'string' || typeof profile.photoUrl !== 'string') {
        onError(new Error('Perfil inválido.'));
        return;
      }

      const publicProfile: PublicUser = {
        uid,
        name: profile.name,
        photoUrl: profile.photoUrl,
      };

      void setDoc(doc(db, 'publicProfiles', uid), publicProfile).catch(onError);
    },
    onError,
  );
}

export function subscribeToPublicUsers(
  currentUid: string,
  onUsers: (users: PublicUser[]) => void,
  onError: (error: unknown) => void,
) {
  return onSnapshot(
    collection(db, 'publicProfiles'),
    (snapshot) => {
      const users: PublicUser[] = snapshot.docs.flatMap((document) => {
        const data = document.data();
        if (document.id === currentUid
          || typeof data.name !== 'string'
          || typeof data.photoUrl !== 'string') {
          return [];
        }

        return [{ uid: document.id, name: data.name, photoUrl: data.photoUrl }];
      });

      users.sort((first, second) => first.name.localeCompare(second.name, 'pt-BR'));
      onUsers(users);
    },
    onError,
  );
}

export async function updateOwnProfile(uid: string, updates: { name: string; phoneNumber: string; birthDate: string; photoUrl: string }) {
  await updateDoc(doc(db, 'users', uid), updates);
}

export async function getOwnProfile(uid: string) {
  const snapshot = await getDoc(doc(db, 'users', uid));
  if (!snapshot.exists()) throw new Error('Perfil não encontrado.');
  return snapshot.data() as { uid: string; name: string; email: string; phoneNumber: string; birthDate: string; photoUrl: string };
}

export async function readSharedProfile(uid: string) {
  const token = await auth.currentUser?.getIdToken();
  if (!token) throw new Error('Entre novamente para abrir o perfil.');
  const response = await fetch(`${getApiUrl()}/profiles/${encodeURIComponent(uid)}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) throw new Error(response.status === 403 ? 'Perfil disponível apenas para integrantes de uma conversa ou grupo.' : 'Não foi possível carregar o perfil.');
  return await response.json() as { uid: string; name: string; email: string; phoneNumber: string; birthDate: string; photoUrl: string };
}
