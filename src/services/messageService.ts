import { doc, getDoc } from 'firebase/firestore';
import { get, onValue, push, ref, set } from 'firebase/database';
import { db, realtimeDb } from '../config/firebase';
import { syncGroupMembers } from './apiService';
import type { ChatMessage } from '../types/message';

type DirectMembers = { firstUid: string; secondUid: string };
type StoredDirectMessage = Omit<ChatMessage, 'mentionedUserIds'>;

export async function prepareDirectChat(conversationId: string, currentUid: string) {
  const conversation = await getDoc(doc(db, 'directConversations', conversationId));
  const data = conversation.data();
  if (!conversation.exists() || data?.type !== 'direct'
    || !Array.isArray(data.participants)
    || data.participants.length !== 2
    || typeof data.participants[0] !== 'string'
    || typeof data.participants[1] !== 'string'
    || !data.participants.includes(currentUid)
    || data.participants[0] === data.participants[1]
    || [...data.participants].sort().join('_') !== conversationId) {
    throw new Error('Conversa individual inválida.');
  }

  const members: DirectMembers = {
    firstUid: data.participants[0],
    secondUid: data.participants[1],
  };
  const membersRef = ref(realtimeDb, `directMembers/${conversationId}`);
  try {
    await set(membersRef, members);
  } catch (writeError: unknown) {
    const existing = (await get(membersRef)).val() as DirectMembers | null;
    if (existing?.firstUid !== members.firstUid || existing.secondUid !== members.secondUid) {
      throw writeError;
    }
  }
}

export async function prepareGroupChat(groupId: string, currentUid: string) {
  const group = await syncGroupMembers(groupId);
  if (!group.memberIds.includes(currentUid)) throw new Error('Você não é integrante deste grupo.');
  return group;
}

function readMessage(value: unknown, expectedType: ChatMessage['conversationType']): ChatMessage | null {
  if (typeof value !== 'object' || value === null) return null;
  const message = value as Partial<StoredDirectMessage>;
  if (typeof message.id !== 'string'
    || typeof message.conversationId !== 'string'
    || message.conversationType !== expectedType
    || typeof message.senderId !== 'string'
    || typeof message.text !== 'string'
    || typeof message.createdAt !== 'number'
    || (message.target?.type !== 'conversation'
      && !(message.target?.type === 'member' && typeof message.target.memberId === 'string'))) return null;

  return {
    id: message.id,
    conversationId: message.conversationId,
    conversationType: expectedType,
    senderId: message.senderId,
    text: message.text,
    target: message.target,
    mentionedUserIds: message.target.type === 'member' ? [message.target.memberId] : [],
    createdAt: message.createdAt,
  };
}

export function subscribeToDirectMessages(
  conversationId: string,
  onMessages: (messages: ChatMessage[]) => void,
  onError: (error: Error) => void,
) {
  return onValue(ref(realtimeDb, `messages/${conversationId}`), (snapshot) => {
    const messages: ChatMessage[] = [];
    snapshot.forEach((child) => {
      const message = readMessage(child.val(), 'direct');
      if (message?.id === child.key && message.conversationId === conversationId) {
        messages.push(message);
      }
    });
    messages.sort((first, second) => first.createdAt - second.createdAt || first.id.localeCompare(second.id));
    onMessages(messages);
  }, onError);
}

export function subscribeToGroupMessages(
  groupId: string,
  onMessages: (messages: ChatMessage[]) => void,
  onError: (error: Error) => void,
) {
  return onValue(ref(realtimeDb, `messages/${groupId}`), (snapshot) => {
    const messages: ChatMessage[] = [];
    snapshot.forEach((child) => {
      const message = readMessage(child.val(), 'group');
      if (message?.id === child.key && message.conversationId === groupId) messages.push(message);
    });
    messages.sort((first, second) => first.createdAt - second.createdAt || first.id.localeCompare(second.id));
    onMessages(messages);
  }, onError);
}

export async function sendDirectMessage(conversationId: string, senderId: string, text: string) {
  const trimmedText = text.trim();
  if (trimmedText.length === 0 || trimmedText.length > 2000) {
    throw new Error('A mensagem deve ter entre 1 e 2000 caracteres.');
  }

  const messageRef = push(ref(realtimeDb, `messages/${conversationId}`));
  if (!messageRef.key) throw new Error('Não foi possível criar a mensagem.');

  const message: StoredDirectMessage = {
    id: messageRef.key,
    conversationId,
    conversationType: 'direct',
    senderId,
    text: trimmedText,
    target: { type: 'conversation' },
    createdAt: Date.now(),
  };
  await set(messageRef, message);
  return messageRef.key;
}

export async function sendGroupMessage(groupId: string, senderId: string, text: string, targetMemberId?: string) {
  const trimmedText = text.trim();
  if (trimmedText.length === 0 || trimmedText.length > 2000) {
    throw new Error('A mensagem deve ter entre 1 e 2000 caracteres.');
  }

  const messageRef = push(ref(realtimeDb, `messages/${groupId}`));
  if (!messageRef.key) throw new Error('Não foi possível criar a mensagem.');

  const target: ChatMessage['target'] = targetMemberId
    ? { type: 'member', memberId: targetMemberId }
    : { type: 'conversation' };
  const message: StoredDirectMessage = {
    id: messageRef.key,
    conversationId: groupId,
    conversationType: 'group',
    senderId,
    text: trimmedText,
    target,
    createdAt: Date.now(),
  };
  await set(messageRef, message);
  return messageRef.key;
}
