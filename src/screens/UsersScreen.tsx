import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useAuth } from '../hooks/useAuth';
import { createDirectConversation } from '../services/conversationService';
import { subscribeToPublicUsers } from '../services/userService';
import type { RootStackParamList } from '../types/navigation';
import type { PublicUser } from '../types/publicUser';

type Props = NativeStackScreenProps<RootStackParamList, 'Users'>;

function Avatar({ name, photoUrl }: Pick<PublicUser, 'name' | 'photoUrl'>) {
  const [imageFailed, setImageFailed] = useState(false);

  useEffect(() => setImageFailed(false), [photoUrl]);

  if (photoUrl === '' || imageFailed) {
    return (
      <View style={styles.avatarFallback}>
        <Text style={styles.avatarInitial}>{name.charAt(0).toUpperCase()}</Text>
      </View>
    );
  }

  return <Image source={{ uri: photoUrl }} style={styles.avatar} onError={() => setImageFailed(true)} />;
}

export function UsersScreen({ navigation }: Props) {
  const { user } = useAuth();
  const [users, setUsers] = useState<PublicUser[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [openingUid, setOpeningUid] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    return subscribeToPublicUsers(user.uid, (nextUsers) => {
      setUsers(nextUsers);
      setLoading(false);
    }, () => {
      setError('Não foi possível carregar os usuários.');
      setLoading(false);
    });
  }, [user]);

  const visibleUsers = useMemo(() => users.filter((item) => (
    item.name.toLocaleLowerCase('pt-BR').includes(search.trim().toLocaleLowerCase('pt-BR'))
  )), [search, users]);

  async function startConversation(otherUid: string, otherName: string) {
    if (!user || openingUid) return;
    setOpeningUid(otherUid);
    setError('');
    try {
      const conversationId = await createDirectConversation(user.uid, otherUid);
      navigation.replace('DirectChat', { conversationId, otherName, otherUid });
    } catch {
      setError('Não foi possível criar a conversa. Tente novamente.');
    } finally {
      setOpeningUid(null);
    }
  }

  return (
    <View style={styles.screen}>
      <TextInput
        style={styles.search}
        value={search}
        onChangeText={setSearch}
        placeholder="Buscar pelo nome"
        placeholderTextColor="#8B91A0"
      />
      {error !== '' && <Text style={styles.error}>{error}</Text>}
      {loading ? (
        <ActivityIndicator style={styles.loading} color="#5865D8" />
      ) : (
        <FlatList
          data={visibleUsers}
          keyExtractor={(item) => item.uid}
          renderItem={({ item }) => (
            <View style={styles.userRow}>
              <Pressable onPress={() => navigation.navigate('Profile', { userId: item.uid, name: item.name })}>
                <Avatar name={item.name} photoUrl={item.photoUrl} />
              </Pressable>
              <Pressable style={styles.userAction} onPress={() => startConversation(item.uid, item.name)} disabled={openingUid !== null}>
                <Text style={styles.userName}>{item.name}</Text>
                <Text style={styles.profileHint}>Conversar · tocar na foto para ver perfil</Text>
              </Pressable>
              {openingUid === item.uid && <ActivityIndicator color="#5865D8" />}
            </View>
          )}
          ListEmptyComponent={(
            <Text style={styles.empty}>
              {users.length === 0 ? 'Nenhum outro usuário cadastrado.' : 'Nenhum usuário encontrado.'}
            </Text>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#F5F6FA', padding: 20 },
  search: {
    backgroundColor: '#FFFFFF',
    borderColor: '#DDE0E8',
    borderRadius: 10,
    borderWidth: 1,
    color: '#171923',
    fontSize: 16,
    minHeight: 50,
    paddingHorizontal: 14,
    marginBottom: 18,
  },
  userRow: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    flexDirection: 'row',
    marginBottom: 10,
    padding: 12,
  },
  userAction: { flex: 1, marginLeft: 12 },
  userName: { color: '#171923', fontSize: 16, fontWeight: '600' },
  profileHint: { color: '#666C7A', fontSize: 12, marginTop: 3 },
  avatar: { borderRadius: 24, height: 48, width: 48 },
  avatarFallback: {
    alignItems: 'center',
    backgroundColor: '#E2E5FB',
    borderRadius: 24,
    height: 48,
    justifyContent: 'center',
    width: 48,
  },
  avatarInitial: { color: '#5865D8', fontSize: 20, fontWeight: '700' },
  loading: { marginTop: 30 },
  empty: { color: '#666C7A', fontSize: 15, textAlign: 'center', marginTop: 36 },
  error: { color: '#B42318', fontSize: 14, marginBottom: 14 },
});
