import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import * as ImagePicker from 'expo-image-picker';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Avatar } from '../components/Avatar';
import { useAuth } from '../hooks/useAuth';
import { uploadImage } from '../services/apiService';
import { getOwnProfile, readSharedProfile, updateOwnProfile } from '../services/userService';
import type { RootStackParamList } from '../types/navigation';

type Props = NativeStackScreenProps<RootStackParamList, 'Profile'>;
type Profile = { uid: string; name: string; email: string; phoneNumber: string; birthDate: string; photoUrl: string };

export function ProfileScreen({ route }: Props) {
  const { user } = useAuth();
  const { userId, name: routeName } = route.params;
  const isOwn = user?.uid === userId;
  const [profile, setProfile] = useState<Profile | null>(null);
  const [name, setName] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [birthDate, setBirthDate] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  async function refresh() {
    const data = isOwn ? await getOwnProfile(userId) : await readSharedProfile(userId);
    setProfile(data);
    setName(data.name);
    setPhoneNumber(data.phoneNumber);
    setBirthDate(data.birthDate);
  }

  useEffect(() => {
    let active = true;
    (isOwn ? getOwnProfile(userId) : readSharedProfile(userId)).then((data) => {
      if (!active) return;
      setProfile(data);
      setName(data.name);
      setPhoneNumber(data.phoneNumber);
      setBirthDate(data.birthDate);
    }).catch((loadError: unknown) => setError(loadError instanceof Error ? loadError.message : 'Não foi possível abrir o perfil.'))
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [isOwn, userId]);

  async function choosePhoto() {
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 0.75 });
    if (result.canceled || !result.assets[0]) return;
    setBusy(true); setError(''); setNotice('');
    try {
      const photoUrl = await uploadImage(result.assets[0].uri, 'profile');
      await updateOwnProfile(userId, { name: name.trim(), phoneNumber: phoneNumber.trim(), birthDate: birthDate.trim(), photoUrl });
      await refresh();
      setNotice('Foto atualizada.');
    } catch (photoError: unknown) {
      setError(photoError instanceof Error ? photoError.message : 'Não foi possível atualizar a foto.');
    } finally { setBusy(false); }
  }

  async function saveProfile() {
    if (!profile || !isOwn || busy || name.trim().length < 2) return;
    setBusy(true); setError(''); setNotice('');
    try {
      await updateOwnProfile(userId, { name: name.trim(), phoneNumber: phoneNumber.trim(), birthDate: birthDate.trim(), photoUrl: profile.photoUrl });
      await refresh();
      setNotice('Perfil atualizado.');
    } catch { setError('Não foi possível salvar as alterações.'); }
    finally { setBusy(false); }
  }

  if (loading) return <ActivityIndicator style={styles.loading} color="#5865D8" />;
  if (!profile) return <View style={styles.screen}><Text style={styles.error}>{error || routeName || 'Perfil indisponível.'}</Text></View>;
  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <View style={styles.avatar}><Avatar name={profile.name} photoUrl={profile.photoUrl} size={112} /></View>
      {isOwn && <Pressable style={styles.secondaryButton} onPress={choosePhoto} disabled={busy}><Text style={styles.secondaryText}>Alterar foto</Text></Pressable>}
      <Text style={styles.label}>Nome</Text>
      <TextInput style={styles.input} value={name} onChangeText={setName} editable={isOwn} />
      <Text style={styles.label}>E-mail</Text><Text style={styles.readOnly}>{profile.email}</Text>
      <Text style={styles.label}>Celular</Text>
      {isOwn ? <TextInput style={styles.input} value={phoneNumber} onChangeText={setPhoneNumber} keyboardType="phone-pad" /> : <Text style={styles.readOnly}>{profile.phoneNumber}</Text>}
      <Text style={styles.label}>Data de nascimento</Text>
      {isOwn ? <TextInput style={styles.input} value={birthDate} onChangeText={setBirthDate} /> : <Text style={styles.readOnly}>{profile.birthDate}</Text>}
      {error !== '' && <Text style={styles.error}>{error}</Text>}
      {notice !== '' && <Text style={styles.notice}>{notice}</Text>}
      {isOwn && <Pressable style={styles.primaryButton} onPress={saveProfile} disabled={busy}>{busy ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.primaryText}>Salvar perfil</Text>}</Pressable>}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#F5F6FA' }, content: { padding: 22, paddingBottom: 36 }, loading: { flex: 1 },
  avatar: { alignItems: 'center', marginVertical: 18 }, label: { color: '#303443', fontSize: 14, fontWeight: '600', marginBottom: 7, marginTop: 16 },
  input: { backgroundColor: '#FFFFFF', borderColor: '#DDE0E8', borderRadius: 10, borderWidth: 1, color: '#171923', fontSize: 16, minHeight: 48, paddingHorizontal: 14 },
  readOnly: { color: '#171923', fontSize: 16, paddingVertical: 10 }, secondaryButton: { alignSelf: 'center', padding: 10 }, secondaryText: { color: '#5865D8', fontWeight: '700' },
  primaryButton: { alignItems: 'center', backgroundColor: '#5865D8', borderRadius: 10, justifyContent: 'center', marginTop: 24, minHeight: 48 }, primaryText: { color: '#FFFFFF', fontWeight: '700' },
  error: { color: '#B42318', marginTop: 16 }, notice: { color: '#247A46', marginTop: 16 },
});
