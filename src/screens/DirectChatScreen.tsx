import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useEffect, useRef, useState } from 'react';
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
import { requestMessageNotification } from '../services/apiService';
import { prepareDirectChat, sendDirectMessage, subscribeToDirectMessages } from '../services/messageService';
import { subscribeToPublicUsers } from '../services/userService';
import { Avatar } from '../components/Avatar';
import type { ChatMessage } from '../types/message';
import type { RootStackParamList } from '../types/navigation';

type Props = NativeStackScreenProps<RootStackParamList, 'DirectChat'>;

export function DirectChatScreen({ route, navigation }: Props) {
  const { user } = useAuth();
  const { conversationId } = route.params;
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [sendError, setSendError] = useState('');
  const [notificationError, setNotificationError] = useState('');
  const [otherPhotoUrl, setOtherPhotoUrl] = useState('');
  const listRef = useRef<FlatList<ChatMessage>>(null);

  useEffect(() => {
    if (!user) return;
    let active = true;
    let unsubscribe: (() => void) | undefined;

    prepareDirectChat(conversationId, user.uid).then(() => {
      if (!active) return;
      unsubscribe = subscribeToDirectMessages(conversationId, (nextMessages) => {
        setMessages(nextMessages);
        setLoading(false);
      }, () => {
        setError('Não foi possível carregar as mensagens.');
        setLoading(false);
      });
    }).catch(() => {
      if (!active) return;
      setError('Não foi possível abrir a conversa.');
      setLoading(false);
    });

    return () => {
      active = false;
      unsubscribe?.();
    };
  }, [conversationId, user]);

  useEffect(() => {
    if (!user) return;
    return subscribeToPublicUsers(user.uid, (users) => {
      setOtherPhotoUrl(users.find((item) => item.uid === route.params.otherUid)?.photoUrl ?? '');
    }, () => {});
  }, [route.params.otherUid, user]);

  async function handleSend() {
    if (!user || sending || loading || error !== '') return;
    setSending(true);
    setSendError('');
    setNotificationError('');
    try {
      const messageId = await sendDirectMessage(conversationId, user.uid, draft);
      setDraft('');
      void requestMessageNotification(conversationId, messageId).then((response) => {
        if (!response.ok) setNotificationError('Mensagem enviada, mas não foi possível enviar a notificação.');
      }).catch(() => setNotificationError('Mensagem enviada, mas a API de notificações não respondeu.'));
    } catch {
      setSendError('Não foi possível enviar a mensagem. Tente novamente.');
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
      {error !== '' && <Text style={styles.error}>{error}</Text>}
      {sendError !== '' && <Text style={styles.error}>{sendError}</Text>}
      {notificationError !== '' && <Text style={styles.notificationNotice}>{notificationError}</Text>}
      <Pressable style={styles.profileRow} onPress={() => navigation.navigate('Profile', { userId: route.params.otherUid, name: route.params.otherName })}>
        <Avatar name={route.params.otherName} photoUrl={otherPhotoUrl} size={36} />
        <Text style={styles.profileText}>Ver perfil de {route.params.otherName}</Text>
      </Pressable>
      {loading ? (
        <ActivityIndicator style={styles.loading} color="#5865D8" />
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
              <View style={[styles.bubble, own ? styles.ownBubble : styles.otherBubble]}>
                <Text style={[styles.messageText, own && styles.ownText]}>{item.text}</Text>
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
  profileRow: { alignItems: 'center', backgroundColor: '#FFFFFF', flexDirection: 'row', padding: 10 },
  profileText: { color: '#303443', fontSize: 14, fontWeight: '600', marginLeft: 10 },
  loading: { flex: 1 },
  messageList: { padding: 16, paddingBottom: 24 },
  emptyList: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  empty: { color: '#666C7A', fontSize: 15, textAlign: 'center' },
  bubble: { borderRadius: 14, marginBottom: 10, maxWidth: '82%', paddingHorizontal: 14, paddingVertical: 10 },
  ownBubble: { alignSelf: 'flex-end', backgroundColor: '#5865D8' },
  otherBubble: { alignSelf: 'flex-start', backgroundColor: '#FFFFFF' },
  messageText: { color: '#171923', fontSize: 16 },
  ownText: { color: '#FFFFFF' },
  composer: { alignItems: 'flex-end', backgroundColor: '#FFFFFF', flexDirection: 'row', padding: 12 },
  input: { borderColor: '#DDE0E8', borderRadius: 10, borderWidth: 1, color: '#171923', flex: 1, fontSize: 16, maxHeight: 120, minHeight: 44, paddingHorizontal: 12, paddingVertical: 10 },
  sendButton: { backgroundColor: '#5865D8', borderRadius: 10, justifyContent: 'center', marginLeft: 8, minHeight: 44, paddingHorizontal: 15 },
  sendText: { color: '#FFFFFF', fontSize: 15, fontWeight: '700' },
  error: { color: '#B42318', fontSize: 14, padding: 12 },
  notificationNotice: { color: '#8A5A00', fontSize: 13, paddingHorizontal: 12, paddingTop: 6 },
});
