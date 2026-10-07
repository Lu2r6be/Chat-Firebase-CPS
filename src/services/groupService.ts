import { collection, doc, getDoc, onSnapshot, query, runTransaction, setDoc, where } from 'firebase/firestore';
import { db } from '../config/firebase';
import type { ChatGroup, NotificationPolicy } from '../types/group';
import { syncGroupMembers, updateGroupMember } from './apiService';

const notificationPolicies: NotificationPolicy[] = [
  'all_group_messages',
  'mentioned_members',
  'direct_messages_only',
  'disabled',
];

function readGroup(id: string, data: Record<string, unknown>): ChatGroup | null {
  if (data.id !== id
    || typeof data.name !== 'string'
    || typeof data.photoUrl !== 'string'
    || typeof data.ownerId !== 'string'
    || !Array.isArray(data.memberIds)
    || !data.memberIds.every((uid: unknown) => typeof uid === 'string')
    || typeof data.memberLimit !== 'number'
    || !notificationPolicies.includes(data.notificationPolicy as NotificationPolicy)
    || typeof data.createdAt !== 'number'
    || typeof data.updatedAt !== 'number') return null;

  return {
    id,
    name: data.name,
    photoUrl: data.photoUrl,
    ownerId: data.ownerId,
    memberIds: data.memberIds,
    memberLimit: data.memberLimit,
    notificationPolicy: data.notificationPolicy as NotificationPolicy,
    createdAt: data.createdAt,
    updatedAt: data.updatedAt,
  };
}

export async function createGroup(
  ownerId: string,
  name: string,
  selectedMemberIds: string[],
  memberLimit: number,
  notificationPolicy: NotificationPolicy,
) {
  const cleanName = name.trim();
  const memberIds = [...new Set([ownerId, ...selectedMemberIds])];
  if (cleanName.length < 3 || cleanName.length > 50) throw new Error('O nome deve ter de 3 a 50 caracteres.');
  if (memberIds.length < 2) throw new Error('Selecione pelo menos mais uma pessoa.');
  if (!Number.isInteger(memberLimit) || memberLimit < memberIds.length || memberLimit > 100) {
    throw new Error('O limite deve ser um número entre os integrantes atuais e 100.');
  }
  if (!notificationPolicies.includes(notificationPolicy)) throw new Error('Política de notificação inválida.');

  const now = Date.now();
  const group: Omit<ChatGroup, 'id'> = {
    name: cleanName,
    photoUrl: '',
    ownerId,
    memberIds,
    memberLimit,
    notificationPolicy,
    createdAt: now,
    updatedAt: now,
  };
  const groupRef = doc(collection(db, 'groups'));
  await setDoc(groupRef, { ...group, id: groupRef.id });
  await syncGroupMembers(groupRef.id);
  return groupRef.id;
}

export async function getGroup(groupId: string) {
  const snapshot = await getDoc(doc(db, 'groups', groupId));
  if (!snapshot.exists()) throw new Error('O grupo não foi encontrado.');
  const group = readGroup(snapshot.id, snapshot.data());
  if (!group) throw new Error('Os dados do grupo estão inválidos.');
  return group;
}

export async function addGroupMember(groupId: string, memberId: string) {
  await updateGroupMember(groupId, 'add', memberId);
}

export async function removeGroupMember(groupId: string, memberId: string) {
  await updateGroupMember(groupId, 'remove', memberId);
}

export async function updateGroupSettings(
  groupId: string,
  ownerId: string,
  memberLimit: number,
  notificationPolicy: NotificationPolicy,
) {
  if (!Number.isInteger(memberLimit) || memberLimit < 2 || memberLimit > 100) {
    throw new Error('O limite deve ser um número inteiro entre 2 e 100.');
  }
  if (!notificationPolicies.includes(notificationPolicy)) throw new Error('Política de notificação inválida.');

  const groupRef = doc(db, 'groups', groupId);
  await runTransaction(db, async (transaction) => {
    const snapshot = await transaction.get(groupRef);
    if (!snapshot.exists()) throw new Error('O grupo não foi encontrado.');
    const group = readGroup(snapshot.id, snapshot.data());
    if (!group || group.ownerId !== ownerId) throw new Error('Somente o proprietário pode alterar as configurações.');
    if (memberLimit < group.memberIds.length) throw new Error('O limite não pode ficar abaixo dos integrantes atuais.');
    transaction.update(groupRef, { memberLimit, notificationPolicy, updatedAt: Date.now() });
  });
}

export async function updateGroupPhoto(groupId: string, ownerId: string, photoUrl: string) {
  const groupRef = doc(db, 'groups', groupId);
  await runTransaction(db, async (transaction) => {
    const snapshot = await transaction.get(groupRef);
    const group = snapshot.exists() ? readGroup(snapshot.id, snapshot.data()) : null;
    if (!group || group.ownerId !== ownerId) throw new Error('Somente o proprietário pode alterar a foto do grupo.');
    transaction.update(groupRef, { photoUrl, updatedAt: Date.now() });
  });
}

export function subscribeToMyGroups(
  currentUid: string,
  onGroups: (groups: ChatGroup[]) => void,
  onError: (error: unknown) => void,
) {
  const groupsQuery = query(collection(db, 'groups'), where('memberIds', 'array-contains', currentUid));
  return onSnapshot(groupsQuery, (snapshot) => {
    const groups: ChatGroup[] = snapshot.docs.flatMap((document) => {
      const group = readGroup(document.id, document.data());
      return group ? [group] : [];
    });
    groups.sort((first, second) => second.updatedAt - first.updatedAt);
    onGroups(groups);
  }, onError);
}
