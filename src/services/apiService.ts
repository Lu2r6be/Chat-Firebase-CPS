import { auth } from '../config/firebase';
import { collection, doc, setDoc } from 'firebase/firestore';
import { isRunningInExpoGo } from 'expo';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { db } from '../config/firebase';

type UploadKind = 'profile' | 'group';
type GroupMemberAction = 'add' | 'remove';

async function getApiToken() {
  const token = await auth.currentUser?.getIdToken();
  if (!token) throw new Error('Entre novamente para continuar.');
  return token;
}

export function getApiUrl() {
  const url = process.env.EXPO_PUBLIC_API_URL || 'https://chat-firebase-cps.vercel.app';
  return url.replace(/\/$/, '');
}

export async function uploadImage(uri: string, kind: UploadKind, groupId?: string) {
  const token = await getApiToken();
  const signatureResponse = await fetch(`${getApiUrl()}/uploads/signature`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ kind, groupId }),
  });
  const signature = await signatureResponse.json();
  if (!signatureResponse.ok) throw new Error(signature.error ?? 'Não foi possível preparar a foto.');

  const form = new FormData();
  form.append('file', { uri, name: 'photo.jpg', type: 'image/jpeg' } as unknown as Blob);
  form.append('api_key', signature.apiKey);
  form.append('timestamp', String(signature.timestamp));
  form.append('signature', signature.signature);
  form.append('folder', signature.folder);
  form.append('public_id', signature.publicId);
  form.append('overwrite', 'true');
  const uploadResponse = await fetch(`https://api.cloudinary.com/v1_1/${signature.cloudName}/image/upload`, { method: 'POST', body: form });
  const result = await uploadResponse.json();
  if (!uploadResponse.ok || typeof result.secure_url !== 'string') throw new Error('Não foi possível enviar a foto.');
  return result.secure_url as string;
}

export async function registerPushDevice(uid: string) {
  if (isRunningInExpoGo()) throw new Error('Notificações push exigem o build de desenvolvimento.');
  const Notifications = await import('expo-notifications');
  const permission = await Notifications.getPermissionsAsync();
  const status = permission.granted ? permission : await Notifications.requestPermissionsAsync();
  if (!status.granted) throw new Error('Permissão de notificações não concedida.');
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'Mensagens',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#5865D8',
    });
  }
  const projectId = Constants.easConfig?.projectId ?? Constants.expoConfig?.extra?.eas?.projectId;
  if (!projectId) throw new Error('O projeto EAS ainda não está configurado para push.');
  const token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
  const deviceId = `expo_${token.replace(/[^A-Za-z0-9_-]/g, '_')}`;
  await setDoc(doc(collection(db, 'users', uid, 'devices'), deviceId), { token, platform: Platform.OS, enabled: true, updatedAt: Date.now() });
  return token;
}

async function requestGroupApi(groupId: string, path: string, body?: object) {
  const token = await getApiToken();
  const response = await fetch(`${getApiUrl()}/groups/${encodeURIComponent(groupId)}/${path}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const data: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const message = typeof data === 'object' && data !== null && 'error' in data && typeof data.error === 'string'
      ? data.error
      : 'Não foi possível atualizar os integrantes do grupo.';
    throw new Error(message);
  }
  if (typeof data !== 'object' || data === null || !('memberIds' in data)
    || !Array.isArray(data.memberIds) || !data.memberIds.every((uid: unknown) => typeof uid === 'string')) {
    throw new Error('A API retornou dados inválidos do grupo.');
  }
  return {
    memberIds: data.memberIds as string[],
    photoUrl: 'photoUrl' in data && typeof data.photoUrl === 'string' ? data.photoUrl : '',
  };
}

export function syncGroupMembers(groupId: string) {
  return requestGroupApi(groupId, 'sync');
}

export async function updateGroupMember(groupId: string, action: GroupMemberAction, memberId: string) {
  await requestGroupApi(groupId, 'members', { action, memberId });
}

export async function requestMessageNotification(conversationId: string, messageId: string) {
  const token = await getApiToken();
  return fetch(`${getApiUrl()}/notifications/messages`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ conversationId, messageId }),
  });
}
