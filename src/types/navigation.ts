export type RootStackParamList = {
  Conversations: undefined;
  Users: undefined;
  DirectChat: { conversationId: string; otherName: string; otherUid: string };
  CreateGroup: undefined;
  GroupChat: { groupId: string; groupName: string };
  GroupSettings: { groupId: string };
  Profile: { userId: string; name?: string };
};
