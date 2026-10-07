import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useAuth } from '../hooks/useAuth';
import { Avatar } from '../components/Avatar';
import { requestMessageNotification } from '../services/apiService';
import { prepareGroupChat, sendGroupMessage, subscribeToGroupMessages } from '../services/messageService';
import { subscribeToPublicUsers } from '../services/userService';
import type { ChatMessage } from '../types/message';
import type { RootStackParamList } from '../types/navigation';
import type { PublicUser } from '../types/publicUser';

type Props = NativeStackScreenProps<RootStackParamList, 'GroupChat'>;

function getErrorDetails(error: unknown) {
  if (typeof error !== 'object' || error === null) return 'erro desconhecido';
  const details = error as { code?: unknown; message?: unknown };
  const code = typeof details.code === 'string' ? details.code : '';
  const message = typeof details.message === 'string' ? details.message : '';
  return [code, message].filter(Boolean).join(': ') || 'erro desconhecido';
}

export function GroupChatScreen({ route, navigation }: Props) {
  const { user } = useAuth();
  const { groupId } = route.params;
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [users, setUsers] = useState<PublicUser[]>([]);
  const [groupMemberIds, setGroupMemberIds] = useState<string[]>([]);
  const [groupPhotoUrl, setGroupPhotoUrl] = useState('');
  const [selectedRecipient, setSelectedRecipient] = useState('');
  const [showRecipients, setShowRecipients] = useState(false);
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadingMessage, setLoadingMessage] = useState('Verificando integrantes do grupo…');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [sendError, setSendError] = useState('');
  const [notificationError, setNotificationError] = useState('');
  const listRef = useRef<FlatList<ChatMessage>>(null);
  const userNames = useMemo(() => new Map(users.map((item) => [item.uid, item.name])), [users]);

  useEffect(() => {
    if (!user) return;
    let active = true;
    let unsubscribe: (() => void) | undefined;
    const prepareTimeout = setTimeout(() => {
      if (!active) return;
      active = false;
      setError('A conexão com o grupo demorou demais. Confira a rede e as regras do Realtime Database.');
      setLoading(false);
    }, 15000);
    let messageTimeout: ReturnType<typeof setTimeout> | undefined;

    const unsubscribeUsers = subscribeToPublicUsers(user.uid, setUsers, () => {});
    prepareGroupChat(groupId, user.uid).then((group) => {
      if (!active) return;
      setGroupMemberIds(group.memberIds);
      setGroupPhotoUrl(group.photoUrl);
      clearTimeout(prepareTimeout);
      setLoadingMessage('Carregando mensagens…');
      messageTimeout = setTimeout(() => {
        if (!active) return;
        active = false;
        unsubscribe?.();
        setError('O Realtime Database não respondeu. Confira a conexão e as regras publicadas.');
        setLoading(false);
      }, 15000);
      unsubscribe = subscribeToGroupMessages(groupId, (nextMessages) => {
        if (!active) return;
        if (messageTimeout) clearTimeout(messageTimeout);
        setMessages(nextMessages);
        setLoading(false);
      }, (messageError: Error) => {
        if (messageTimeout) clearTimeout(messageTimeout);
        setError(`Falha ao carregar mensagens (${getErrorDetails(messageError)}).`);
        setLoading(false);
        active = false;
      });
    }).catch((prepareError: unknown) => {
      if (!active) return;
      clearTimeout(prepareTimeout);
      if (messageTimeout) clearTimeout(messageTimeout);
      setError(`Não foi possível preparar o grupo (${getErrorDetails(prepareError)}).`);
      setLoading(false);
      active = false;
    });

    return () => {
      active = false;
      clearTimeout(prepareTimeout);
      if (messageTimeout) clearTimeout(messageTimeout);
      unsubscribe?.();
      unsubscribeUsers();
    };
  }, [groupId, user]);

  async function handleSend() {
    if (!user || sending || loading || error !== '') return;
    setSending(true);
    setSendError('');
    setNotificationError('');
    try {
      const messageId = await sendGroupMessage(groupId, user.uid, draft, selectedRecipient || undefined);
      setDraft('');
      void requestMessageNotification(groupId, messageId).then((response) => {
        if (!response.ok) setNotificationError('Mensagem enviada, mas não foi possível enviar a notificação.');
      }).catch(() => setNotificationError('Mensagem enviada, mas a API de notificações não respondeu.'));
    } catch (sendError: unknown) {
      setSendError(`Falha ao enviar (${getErrorDetails(sendError)}).`);
    } finally {
      setSending(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
    >
      <Pressable
        style={styles.detailsButton}
        onPress={() => navigation.navigate('GroupSettings', { groupId })}
      >
        <Avatar name={route.params.groupName} photoUrl={groupPhotoUrl} size={40} />
        <Text style={styles.detailsText}>Integrantes e configurações</Text>
      </Pressable>
      <View style={styles.recipientBar}>
        <Text style={styles.recipientLabel}>Enviar para:</Text>
        <Pressable onPress={() => setShowRecipients((shown) => !shown)}>
          <Text style={styles.detailsText}>
            {selectedRecipient === '' ? 'Todos' : userNames.get(selectedRecipient) ?? 'Integrante'}
          </Text>
        </Pressable>
      </View>
      {showRecipients && (
        <View style={styles.recipientList}>
          <Pressable style={styles.recipientOption} onPress={() => { setSelectedRecipient(''); setShowRecipients(false); }}>
            <Text style={styles.recipientName}>Todos do grupo</Text>
          </Pressable>
          {groupMemberIds.filter((uid) => uid !== user?.uid).map((uid) => (
            <Pressable key={uid} style={styles.recipientOption} onPress={() => { setSelectedRecipient(uid); setShowRecipients(false); }}>
              <Text style={styles.recipientName}>{userNames.get(uid) ?? 'Integrante'}</Text>
            </Pressable>
          ))}
        </View>
      )}
      {error !== '' && <Text style={styles.error}>{error}</Text>}
      {sendError !== '' && <Text style={styles.error}>{sendError}</Text>}
      {notificationError !== '' && <Text style={styles.notificationNotice}>{notificationError}</Text>}
      {loading ? (
        <View style={styles.loading}>
          <ActivityIndicator color="#5865D8" />
          <Text style={styles.loadingText}>{loadingMessage}</Text>
        </View>
      ) : (
        <FlatList
          ref={listRef}
          data={messages}
          keyExtractor={(item) => item.id}
          contentContainerStyle={messages.length === 0 ? styles.emptyList : styles.messageList}
          onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
          renderItem={({ item }) => {
            const own = item.senderId === user?.uid;
            return (
              <View style={[styles.messageRow, own && styles.ownRow]}>
                {!own && <Text style={styles.sender}>{userNames.get(item.senderId) ?? 'Integrante'}</Text>}
                {item.target.type === 'member' && <Text style={styles.recipientCaption}>Para: {userNames.get(item.target.memberId) ?? 'Integrante'}</Text>}
                <View style={[styles.bubble, own ? styles.ownBubble : styles.otherBubble]}>
                  <Text style={[styles.messageText, own && styles.ownText]}>{item.text}</Text>
                </View>
              </View>
            );
          }}
          ListEmptyComponent={<Text style={styles.empty}>Nenhuma mensagem ainda. Envie a primeira.</Text>}
        />
      )}
      <View style={styles.composer}>
        <TextInput
          style={styles.input}
          value={draft}
          onChangeText={setDraft}
          placeholder="Escreva uma mensagem"
          placeholderTextColor="#8B91A0"
          multiline
          maxLength={2000}
          editable={!loading && !sending && error === ''}
        />
        <Pressable
          style={styles.sendButton}
          onPress={handleSend}
          disabled={loading || sending || draft.trim().length === 0 || error !== ''}
        >
          {sending ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.sendText}>Enviar</Text>}
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#F5F6FA' },
  loading: { alignItems: 'center', flex: 1, justifyContent: 'center' },
  loadingText: { color: '#666C7A', fontSize: 14, marginTop: 12 },
  detailsButton: { alignItems: 'center', alignSelf: 'flex-start', flexDirection: 'row', gap: 10, paddingHorizontal: 16, paddingTop: 8, paddingBottom: 4 },
  detailsText: { color: '#5865D8', fontSize: 14, fontWeight: '600' },
  recipientBar: { alignItems: 'center', flexDirection: 'row', paddingHorizontal: 16, paddingVertical: 8 },
  recipientLabel: { color: '#666C7A', fontSize: 14, marginRight: 8 },
  recipientList: { backgroundColor: '#FFFFFF', borderRadius: 10, marginHorizontal: 16, marginBottom: 8, paddingHorizontal: 12, paddingVertical: 4 },
  recipientOption: { borderBottomColor: '#E8EAF0', borderBottomWidth: 1, minHeight: 42, justifyContent: 'center' },
  recipientName: { color: '#303443', fontSize: 14 },
  recipientCaption: { color: '#666C7A', fontSize: 12, marginBottom: 3, marginLeft: 6 },
  messageList: { padding: 16, paddingBottom: 24 },
  emptyList: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  empty: { color: '#666C7A', fontSize: 15, textAlign: 'center' },
  messageRow: { alignSelf: 'flex-start', marginBottom: 10, maxWidth: '82%' },
  ownRow: { alignSelf: 'flex-end' },
  sender: { color: '#666C7A', fontSize: 12, marginBottom: 3, marginLeft: 6 },
  bubble: { borderRadius: 14, paddingHorizontal: 14, paddingVertical: 10 },
  ownBubble: { backgroundColor: '#5865D8' },
  otherBubble: { backgroundColor: '#FFFFFF' },
  messageText: { color: '#171923', fontSize: 16 },
  ownText: { color: '#FFFFFF' },
  composer: { alignItems: 'flex-end', backgroundColor: '#FFFFFF', flexDirection: 'row', padding: 12 },
  input: { borderColor: '#DDE0E8', borderRadius: 10, borderWidth: 1, color: '#171923', flex: 1, fontSize: 16, maxHeight: 120, minHeight: 44, paddingHorizontal: 12, paddingVertical: 10 },
  sendButton: { backgroundColor: '#5865D8', borderRadius: 10, justifyContent: 'center', marginLeft: 8, minHeight: 44, paddingHorizontal: 15 },
  sendText: { color: '#FFFFFF', fontSize: 15, fontWeight: '700' },
  error: { color: '#B42318', fontSize: 14, padding: 12 },
  notificationNotice: { color: '#8A5A00', fontSize: 13, paddingHorizontal: 12, paddingTop: 6 },
});
