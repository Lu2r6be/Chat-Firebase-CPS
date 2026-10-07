import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  query,
  setDoc,
  where,
} from 'firebase/firestore';
import { db } from '../config/firebase';
import type { DirectConversation } from '../types/conversation';

export async function createDirectConversation(currentUid: string, otherUid: string) {
  if (currentUid === otherUid) {
    throw new Error('Você não pode criar uma conversa consigo mesmo.');
  }

  const participants = [currentUid, otherUid].sort() as [string, string];
  const id = participants.join('_');
  const conversationRef = doc(db, 'directConversations', id);
  const conversation: DirectConversation = {
    id,
    type: 'direct',
    participants,
    createdAt: Date.now(),
  };

  try {
    await setDoc(conversationRef, conversation);
  } catch (writeError: unknown) {
    const existing = await getDoc(conversationRef);
    if (!existing.exists()) throw writeError;
  }

  return id;
}

export function subscribeToDirectConversations(
  currentUid: string,
  onConversations: (conversations: DirectConversation[]) => void,
  onError: (error: unknown) => void,
) {
  const conversationsQuery = query(
    collection(db, 'directConversations'),
    where('participants', 'array-contains', currentUid),
  );

  return onSnapshot(conversationsQuery, (snapshot) => {
    const conversations: DirectConversation[] = snapshot.docs.flatMap((document) => {
      const data = document.data();
      if (data.type !== 'direct'
        || !Array.isArray(data.participants)
        || data.participants.length !== 2
        || typeof data.participants[0] !== 'string'
        || typeof data.participants[1] !== 'string'
        || typeof data.createdAt !== 'number') {
        return [];
      }

      return [{
        id: document.id,
        type: 'direct' as const,
        participants: [data.participants[0], data.participants[1]],
        createdAt: data.createdAt,
      }];
    });

    conversations.sort((first, second) => second.createdAt - first.createdAt);
    onConversations(conversations);
  }, onError);
}
