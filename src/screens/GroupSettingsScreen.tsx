import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import * as ImagePicker from 'expo-image-picker';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useAuth } from '../hooks/useAuth';
import { Avatar } from '../components/Avatar';
import { uploadImage } from '../services/apiService';
import { addGroupMember, getGroup, removeGroupMember, updateGroupPhoto, updateGroupSettings } from '../services/groupService';
import { subscribeToPublicUsers } from '../services/userService';
import type { ChatGroup, NotificationPolicy } from '../types/group';
import type { RootStackParamList } from '../types/navigation';
import type { PublicUser } from '../types/publicUser';

type Props = NativeStackScreenProps<RootStackParamList, 'GroupSettings'>;

const policies: { value: NotificationPolicy; label: string }[] = [
  { value: 'all_group_messages', label: 'Todas as mensagens do grupo' },
  { value: 'mentioned_members', label: 'Somente quando eu for mencionado' },
  { value: 'direct_messages_only', label: 'Somente conversas individuais' },
  { value: 'disabled', label: 'Desativadas' },
];

export function GroupSettingsScreen({ route, navigation }: Props) {
  const { user } = useAuth();
  const { groupId } = route.params;
  const [group, setGroup] = useState<ChatGroup | null>(null);
  const [users, setUsers] = useState<PublicUser[]>([]);
  const [limit, setLimit] = useState('');
  const [policy, setPolicy] = useState<NotificationPolicy>('all_group_messages');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [busyUid, setBusyUid] = useState<string | null>(null);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [error, setError] = useState('');

  async function refreshGroup() {
    const nextGroup = await getGroup(groupId);
    setGroup(nextGroup);
    setLimit(String(nextGroup.memberLimit));
    setPolicy(nextGroup.notificationPolicy);
  }

  useEffect(() => {
    if (!user) return;
    let active = true;
    const unsubscribeUsers = subscribeToPublicUsers(user.uid, setUsers, () => {});
    getGroup(groupId).then((nextGroup) => {
      if (!active) return;
      setGroup(nextGroup);
      setLimit(String(nextGroup.memberLimit));
      setPolicy(nextGroup.notificationPolicy);
    }).catch(() => {
      if (active) setError('Não foi possível carregar os dados do grupo.');
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => {
      active = false;
      unsubscribeUsers();
    };
  }, [groupId, user]);

  const isOwner = !!user && group?.ownerId === user.uid;
  const availableUsers = users.filter((item) => !group?.memberIds.includes(item.uid));
  const remainingSlots = group ? group.memberLimit - group.memberIds.length : 0;

  async function handleAdd(uid: string) {
    if (!user || !group || !isOwner || remainingSlots <= 0 || busyUid) return;
    setBusyUid(uid);
    setError('');
    try {
      await addGroupMember(groupId, uid);
      await refreshGroup();
    } catch (actionError: unknown) {
      setError(actionError instanceof Error ? actionError.message : 'Não foi possível adicionar o integrante.');
      await refreshGroup().catch(() => {});
    } finally {
      setBusyUid(null);
    }
  }

  async function handleRemove(uid: string) {
    if (!user || !group || !isOwner || group.memberIds.length <= 2 || busyUid) return;
    setBusyUid(uid);
    setError('');
    try {
      await removeGroupMember(groupId, uid);
      await refreshGroup();
    } catch (actionError: unknown) {
      setError(actionError instanceof Error ? actionError.message : 'Não foi possível remover o integrante.');
      await refreshGroup().catch(() => {});
    } finally {
      setBusyUid(null);
    }
  }

  async function handleSave() {
    if (!user || !group || !isOwner || saving) return;
    setSaving(true);
    setError('');
    try {
      await updateGroupSettings(groupId, user.uid, Number(limit), policy);
      await refreshGroup();
    } catch (saveError: unknown) {
      setError(saveError instanceof Error ? saveError.message : 'Não foi possível salvar as configurações.');
    } finally {
      setSaving(false);
    }
  }

  async function handleGroupPhoto() {
    if (!user || !group || !isOwner || photoBusy) return;
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 0.75 });
    if (result.canceled || !result.assets[0]) return;
    setPhotoBusy(true); setError('');
    try {
      const photoUrl = await uploadImage(result.assets[0].uri, 'group', groupId);
      await updateGroupPhoto(groupId, user.uid, photoUrl);
      await refreshGroup();
    } catch (photoError: unknown) {
      setError(photoError instanceof Error ? photoError.message : 'Não foi possível alterar a foto do grupo.');
    } finally { setPhotoBusy(false); }
  }

  if (loading) return <ActivityIndicator style={styles.loading} color="#5865D8" />;
  if (!group) return <Text style={styles.error}>{error || 'Grupo indisponível.'}</Text>;

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <Pressable style={styles.groupPhoto} onPress={handleGroupPhoto} disabled={!isOwner || photoBusy}>
        {photoBusy ? <ActivityIndicator color="#5865D8" /> : <Avatar name={group.name} photoUrl={group.photoUrl} size={92} />}
        {isOwner && <Text style={styles.photoHint}>Toque para trocar a foto</Text>}
      </Pressable>
      <Text style={styles.groupName}>{group.name}</Text>
      <Text style={styles.count}>Integrantes: {group.memberIds.length} de {group.memberLimit}</Text>
      <Text style={styles.count}>Vagas disponíveis: {remainingSlots}</Text>
      {error !== '' && <Text style={styles.error}>{error}</Text>}

      <Text style={styles.sectionTitle}>Integrantes</Text>
      {group.memberIds.map((uid) => {
        const member = users.find((item) => item.uid === uid);
        const owner = uid === group.ownerId;
        return (
          <View key={uid} style={styles.memberRow}>
            <Pressable style={styles.memberInfo} onPress={() => uid !== user?.uid && navigation.navigate('Profile', { userId: uid, name: member?.name })}>
              <Text style={styles.memberName}>{uid === user?.uid ? 'Você' : member?.name ?? 'Integrante'}</Text>
              {owner && <Text style={styles.ownerLabel}>Proprietário</Text>}
            </Pressable>
            {isOwner && !owner && (
              <Pressable onPress={() => handleRemove(uid)} disabled={busyUid !== null || group.memberIds.length <= 2}>
                {busyUid === uid ? <ActivityIndicator color="#B42318" /> : <Text style={styles.removeText}>Remover</Text>}
              </Pressable>
            )}
          </View>
        );
      })}
      {isOwner && group.memberIds.length <= 2 && (
        <Text style={styles.info}>
          O grupo precisa manter pelo menos duas pessoas. Adicione mais um integrante antes de remover alguém.
        </Text>
      )}

      {isOwner && (
        <>
          <Text style={styles.sectionTitle}>Adicionar integrante</Text>
          {remainingSlots === 0 && <Text style={styles.full}>O grupo atingiu o limite.</Text>}
          {availableUsers.map((item) => (
            <Pressable key={item.uid} style={styles.addRow} onPress={() => handleAdd(item.uid)} disabled={busyUid !== null || remainingSlots <= 0}>
              <Text style={styles.memberName}>{item.name}</Text>
              {busyUid === item.uid ? <ActivityIndicator color="#5865D8" /> : <Text style={styles.addText}>Adicionar</Text>}
            </Pressable>
          ))}

          <Text style={styles.sectionTitle}>Configurações</Text>
          <Text style={styles.label}>Limite de integrantes</Text>
          <TextInput style={styles.input} value={limit} onChangeText={setLimit} keyboardType="number-pad" maxLength={3} />
          <Text style={styles.label}>Política de notificações</Text>
          {policies.map((item) => (
            <Pressable key={item.value} style={styles.policyRow} onPress={() => setPolicy(item.value)}>
              <View style={[styles.radio, policy === item.value && styles.radioSelected]} />
              <Text style={styles.policyText}>{item.label}</Text>
            </Pressable>
          ))}
          <Pressable style={styles.saveButton} onPress={handleSave} disabled={saving}>
            {saving ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.saveText}>Salvar configurações</Text>}
          </Pressable>
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#F5F6FA' },
  content: { padding: 20, paddingBottom: 36 },
  loading: { flex: 1 },
  groupPhoto: { alignItems: 'center', marginBottom: 12 },
  photoHint: { color: '#5865D8', fontSize: 12, marginTop: 5 },
  groupName: { color: '#171923', fontSize: 23, fontWeight: '700', marginBottom: 8, textAlign: 'center' },
  count: { color: '#666C7A', fontSize: 14, marginBottom: 4 },
  sectionTitle: { color: '#303443', fontSize: 17, fontWeight: '700', marginBottom: 10, marginTop: 24 },
  memberRow: { alignItems: 'center', backgroundColor: '#FFFFFF', borderRadius: 10, flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8, minHeight: 54, paddingHorizontal: 14 },
  memberInfo: { flex: 1 },
  memberName: { color: '#171923', fontSize: 15 },
  ownerLabel: { color: '#666C7A', fontSize: 12, marginTop: 3 },
  removeText: { color: '#B42318', fontSize: 14, fontWeight: '600' },
  addRow: { alignItems: 'center', backgroundColor: '#FFFFFF', borderRadius: 10, flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8, minHeight: 48, paddingHorizontal: 14 },
  addText: { color: '#5865D8', fontSize: 14, fontWeight: '600' },
  full: { color: '#B42318', fontSize: 14, marginBottom: 10 },
  info: { color: '#666C7A', fontSize: 13, marginTop: 4 },
  label: { color: '#303443', fontSize: 14, fontWeight: '600', marginBottom: 8, marginTop: 14 },
  input: { backgroundColor: '#FFFFFF', borderColor: '#DDE0E8', borderRadius: 10, borderWidth: 1, color: '#171923', fontSize: 16, minHeight: 48, paddingHorizontal: 14 },
  policyRow: { alignItems: 'center', flexDirection: 'row', marginBottom: 10, minHeight: 36 },
  radio: { borderColor: '#8B91A0', borderRadius: 9, borderWidth: 1, height: 18, marginRight: 10, width: 18 },
  radioSelected: { backgroundColor: '#5865D8', borderColor: '#5865D8' },
  policyText: { color: '#303443', fontSize: 14 },
  saveButton: { alignItems: 'center', backgroundColor: '#5865D8', borderRadius: 10, justifyContent: 'center', marginTop: 18, minHeight: 48 },
  saveText: { color: '#FFFFFF', fontSize: 15, fontWeight: '700' },
  error: { color: '#B42318', fontSize: 14, marginTop: 12 },
});
