export type ChatMessage = {
  id: string;
  conversationId: string;
  conversationType: 'direct' | 'group';
  senderId: string;
  text: string;
  target: { type: 'conversation' } | { type: 'member'; memberId: string };
  mentionedUserIds: string[];
  createdAt: number;
};
