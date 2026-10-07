import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useEffect, useMemo, useState } from 'react';
import { isRunningInExpoGo } from 'expo';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useAuth } from '../hooks/useAuth';
import { Avatar } from '../components/Avatar';
import { registerPushDevice } from '../services/apiService';
import { subscribeToDirectConversations } from '../services/conversationService';
import { subscribeToMyGroups } from '../services/groupService';
import { subscribeToOwnProfile, subscribeToPublicUsers } from '../services/userService';
import type { DirectConversation } from '../types/conversation';
import type { ChatGroup } from '../types/group';
import type { RootStackParamList } from '../types/navigation';
import type { PublicUser } from '../types/publicUser';
import { getAuthErrorMessage } from '../utils/authError';

type Props = NativeStackScreenProps<RootStackParamList, 'Conversations'>;

export function ConversationsScreen({ navigation }: Props) {
  const { user, logout } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [conversations, setConversations] = useState<DirectConversation[]>([]);
  const [groups, setGroups] = useState<ChatGroup[]>([]);
  const [publicUsers, setPublicUsers] = useState<PublicUser[]>([]);
  const [pushBusy, setPushBusy] = useState(false);
  const [pushMessage, setPushMessage] = useState('');

  useEffect(() => {
    if (!user) return;
    return subscribeToOwnProfile(user.uid, () => {
      setError('Não foi possível atualizar seu perfil público.');
    });
  }, [user]);

  useEffect(() => {
    if (!user) return;
    return subscribeToMyGroups(user.uid, setGroups, () => {
      setError('Não foi possível carregar os grupos.');
    });
  }, [user]);

  useEffect(() => {
    if (!user) return;
    return subscribeToDirectConversations(user.uid, setConversations, () => {
      setError('Não foi possível carregar as conversas.');
    });
  }, [user]);

  useEffect(() => {
    if (!user) return;
    return subscribeToPublicUsers(user.uid, setPublicUsers, () => {
      setError('Não foi possível carregar os nomes dos usuários.');
    });
  }, [user]);

  const userNames = useMemo(() => new Map(publicUsers.map((item) => [item.uid, item.name])), [publicUsers]);

  async function handleLogout() {
    setError('');
    setBusy(true);
    try {
      await logout();
    } catch (logoutError: unknown) {
      setError(getAuthErrorMessage(logoutError));
    } finally {
      setBusy(false);
    }
  }

  async function handleEnablePush() {
    if (!user || pushBusy) return;
    setPushBusy(true); setPushMessage('');
    try {
      await registerPushDevice(user.uid);
      setPushMessage('Notificações ativadas neste aparelho.');
    } catch (pushError: unknown) {
      setPushMessage(pushError instanceof Error ? pushError.message : 'Não foi possível ativar as notificações.');
    } finally { setPushBusy(false); }
  }

  return (
    <View style={styles.screen}>
      <View style={styles.topRow}>
        <Pressable style={styles.profileHeader} onPress={() => user && navigation.navigate('Profile', { userId: user.uid })}>
          <Avatar name={user?.displayName ?? 'Você'} photoUrl="" size={42} />
          <View>
            <Text style={styles.title}>Conversas</Text>
            <Text style={styles.email}>{user?.email ?? ''}</Text>
          </View>
        </Pressable>
        <Pressable onPress={handleLogout} disabled={busy} style={styles.logoutButton}>
          {busy
            ? <ActivityIndicator color="#5865D8" />
            : <Text style={styles.logoutText}>Sair</Text>}
        </Pressable>
      </View>
      {error !== '' && <Text style={styles.error}>{error}</Text>}
      <Pressable style={styles.findButton} onPress={() => navigation.navigate('Users')}>
        <Text style={styles.findButtonText}>Encontrar pessoas</Text>
      </Pressable>
      <Pressable style={styles.groupButton} onPress={() => navigation.navigate('CreateGroup')}>
        <Text style={styles.findButtonText}>Criar grupo</Text>
      </Pressable>
      {!isRunningInExpoGo() && <Pressable style={styles.pushButton} onPress={handleEnablePush} disabled={pushBusy}>
        {pushBusy ? <ActivityIndicator color="#5865D8" /> : <Text style={styles.pushText}>Ativar notificações neste aparelho</Text>}
      </Pressable>}
      {pushMessage !== '' && <Text style={styles.pushMessage}>{pushMessage}</Text>}
      <ScrollView style={styles.list}>
        {conversations.length === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>Nenhuma conversa individual ainda</Text>
            <Text style={styles.emptyText}>Encontre outra pessoa para começar.</Text>
          </View>
        ) : conversations.map((item) => {
            const otherUid = item.participants.find((uid) => uid !== user?.uid) ?? '';
            const otherName = userNames.get(otherUid) ?? 'Usuário';
            return (
              <Pressable
                key={item.id}
                style={styles.conversationRow}
                onPress={() => navigation.navigate('DirectChat', { conversationId: item.id, otherName, otherUid })}
              >
                <Avatar name={otherName} photoUrl={publicUsers.find((entry) => entry.uid === otherUid)?.photoUrl ?? ''} />
                <View style={styles.rowText}>
                  <Text style={styles.conversationName}>{otherName}</Text>
                  <Text style={styles.conversationType}>Conversa individual</Text>
                </View>
              </Pressable>
            );
          })}
        <View style={styles.groupsSection}>
          <Text style={styles.groupsTitle}>Meus grupos</Text>
          {groups.length === 0 && <Text style={styles.emptyText}>Nenhum grupo criado ainda.</Text>}
          {groups.map((group) => (
            <Pressable
              key={group.id}
              style={styles.conversationRow}
              onPress={() => navigation.navigate('GroupChat', { groupId: group.id, groupName: group.name })}
            >
              <Avatar name={group.name} photoUrl={group.photoUrl} />
              <View style={styles.rowText}>
                <Text style={styles.conversationName}>{group.name}</Text>
                <Text style={styles.conversationType}>Grupo · {group.memberIds.length} integrantes · {group.memberLimit - group.memberIds.length} vagas</Text>
              </View>
            </Pressable>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#F5F6FA', padding: 24, paddingTop: 64 },
  topRow: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  profileHeader: { alignItems: 'center', flexDirection: 'row', gap: 10 },
  title: { color: '#171923', fontSize: 28, fontWeight: '700' },
  email: { color: '#666C7A', fontSize: 14, marginTop: 5 },
  logoutButton: { alignItems: 'center', justifyContent: 'center', minHeight: 42, minWidth: 56 },
  logoutText: { color: '#5865D8', fontSize: 15, fontWeight: '700' },
  empty: { alignItems: 'center', flex: 1, justifyContent: 'center' },
  emptyTitle: { color: '#303443', fontSize: 17, fontWeight: '600', marginBottom: 8 },
  emptyText: { color: '#666C7A', fontSize: 14, textAlign: 'center' },
  list: { marginTop: 24 },
  conversationRow: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    flexDirection: 'row',
    gap: 12,
    marginBottom: 10,
    padding: 16,
  },
  rowText: { flex: 1 },
  conversationName: { color: '#171923', fontSize: 16, fontWeight: '600' },
  conversationType: { color: '#666C7A', fontSize: 13, marginTop: 4 },
  findButton: {
    alignItems: 'center',
    backgroundColor: '#5865D8',
    borderRadius: 10,
    marginTop: 24,
    paddingHorizontal: 20,
    paddingVertical: 14,
  },
  groupButton: {
    alignItems: 'center',
    backgroundColor: '#323B73',
    borderRadius: 10,
    marginTop: 10,
    paddingHorizontal: 20,
    paddingVertical: 14,
  },
  pushButton: { alignItems: 'center', marginTop: 10, minHeight: 34, justifyContent: 'center' },
  pushText: { color: '#5865D8', fontSize: 13, fontWeight: '600' },
  pushMessage: { color: '#666C7A', fontSize: 12, marginTop: 2, textAlign: 'center' },
  groupsSection: { marginTop: 20 },
  groupsTitle: { color: '#303443', fontSize: 17, fontWeight: '700', marginBottom: 12 },
  findButtonText: { color: '#FFFFFF', fontSize: 15, fontWeight: '700' },
  error: { color: '#B42318', fontSize: 14, marginTop: 16 },
});
