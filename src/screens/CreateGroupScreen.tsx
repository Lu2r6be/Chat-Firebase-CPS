import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useEffect, useMemo, useState } from 'react';
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
import { createGroup } from '../services/groupService';
import { subscribeToPublicUsers } from '../services/userService';
import type { NotificationPolicy } from '../types/group';
import type { RootStackParamList } from '../types/navigation';
import type { PublicUser } from '../types/publicUser';

type Props = NativeStackScreenProps<RootStackParamList, 'CreateGroup'>;

const policies: { value: NotificationPolicy; label: string }[] = [
  { value: 'all_group_messages', label: 'Todas as mensagens do grupo' },
  { value: 'mentioned_members', label: 'Somente quando eu for mencionado' },
  { value: 'direct_messages_only', label: 'Somente conversas individuais' },
  { value: 'disabled', label: 'Desativadas' },
];

export function CreateGroupScreen({ navigation }: Props) {
  const { user } = useAuth();
  const [users, setUsers] = useState<PublicUser[]>([]);
  const [name, setName] = useState('');
  const [limit, setLimit] = useState('10');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [policy, setPolicy] = useState<NotificationPolicy>('all_group_messages');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!user) return;
    return subscribeToPublicUsers(user.uid, (nextUsers) => {
      setUsers(nextUsers);
      setLoading(false);
    }, () => {
      setError('Não foi possível carregar a lista de pessoas.');
      setLoading(false);
    });
  }, [user]);

  const currentCount = selectedIds.length + 1;
  const memberLimit = Number(limit);
  const remainingSlots = Number.isInteger(memberLimit) ? memberLimit - currentCount : 0;
  const canCreate = useMemo(() => name.trim().length >= 3
    && name.trim().length <= 50
    && selectedIds.length > 0
    && Number.isInteger(memberLimit)
    && memberLimit >= currentCount
    && memberLimit <= 100, [currentCount, memberLimit, name, selectedIds.length]);

  function toggleMember(uid: string) {
    setSelectedIds((selected) => selected.includes(uid)
      ? selected.filter((memberId) => memberId !== uid)
      : [...selected, uid]);
  }

  async function handleCreate() {
    if (!user || !canCreate || saving) return;
    setSaving(true);
    setError('');
    try {
      await createGroup(user.uid, name, selectedIds, memberLimit, policy);
      navigation.goBack();
    } catch (createError: unknown) {
      setError(createError instanceof Error ? createError.message : 'Não foi possível criar o grupo.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <Text style={styles.label}>Nome do grupo</Text>
      <TextInput
        style={styles.input}
        value={name}
        onChangeText={setName}
        placeholder="Ex.: Projeto de React Native"
        maxLength={50}
      />

      <Text style={styles.label}>Limite de integrantes (máximo 100)</Text>
      <TextInput
        style={styles.input}
        value={limit}
        onChangeText={setLimit}
        keyboardType="number-pad"
        maxLength={3}
      />

      <Text style={styles.label}>Integrantes: {currentCount} de {Number.isInteger(memberLimit) ? memberLimit : '—'}</Text>
      <Text style={styles.slots}>Vagas disponíveis: {Math.max(remainingSlots, 0)}</Text>

      <Text style={styles.label}>Selecione pelo menos uma pessoa</Text>
      {loading ? <ActivityIndicator style={styles.loading} color="#5865D8" /> : users.map((item) => {
        const selected = selectedIds.includes(item.uid);
        return (
          <Pressable
            key={item.uid}
            style={[styles.memberRow, selected && styles.selectedRow]}
            onPress={() => toggleMember(item.uid)}
            disabled={!selected && currentCount >= memberLimit}
          >
            <Text style={styles.memberName}>{item.name}</Text>
            <Text style={styles.check}>{selected ? '✓' : '+'}</Text>
          </Pressable>
        );
      })}

      <Text style={styles.label}>Notificações</Text>
      {policies.map((item) => (
        <Pressable key={item.value} style={styles.policyRow} onPress={() => setPolicy(item.value)}>
          <View style={[styles.radio, policy === item.value && styles.radioSelected]} />
          <Text style={styles.policyText}>{item.label}</Text>
        </Pressable>
      ))}

      {error !== '' && <Text style={styles.error}>{error}</Text>}
      <Pressable style={[styles.createButton, !canCreate && styles.disabledButton]} onPress={handleCreate} disabled={!canCreate || saving}>
        {saving ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.createText}>Criar grupo</Text>}
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#F5F6FA' },
  content: { padding: 20, paddingBottom: 36 },
  label: { color: '#303443', fontSize: 15, fontWeight: '600', marginBottom: 8, marginTop: 18 },
  input: { backgroundColor: '#FFFFFF', borderColor: '#DDE0E8', borderRadius: 10, borderWidth: 1, color: '#171923', fontSize: 16, minHeight: 48, paddingHorizontal: 14 },
  slots: { color: '#666C7A', fontSize: 13 },
  loading: { marginVertical: 20 },
  memberRow: { alignItems: 'center', backgroundColor: '#FFFFFF', borderRadius: 10, flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8, minHeight: 48, paddingHorizontal: 14 },
  selectedRow: { backgroundColor: '#E8EAFE' },
  memberName: { color: '#171923', fontSize: 15 },
  check: { color: '#5865D8', fontSize: 20, fontWeight: '700' },
  policyRow: { alignItems: 'center', flexDirection: 'row', marginBottom: 10, minHeight: 36 },
  radio: { borderColor: '#8B91A0', borderRadius: 9, borderWidth: 1, height: 18, marginRight: 10, width: 18 },
  radioSelected: { backgroundColor: '#5865D8', borderColor: '#5865D8' },
  policyText: { color: '#303443', fontSize: 14 },
  error: { color: '#B42318', fontSize: 14, marginTop: 14 },
  createButton: { alignItems: 'center', backgroundColor: '#5865D8', borderRadius: 10, marginTop: 20, minHeight: 48, justifyContent: 'center' },
  disabledButton: { opacity: 0.5 },
  createText: { color: '#FFFFFF', fontSize: 15, fontWeight: '700' },
});
