import { useCallback, useMemo, useState } from 'react';
import * as ImagePicker from 'expo-image-picker';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useAuth } from '../hooks/useAuth';
import { Avatar } from '../components/Avatar';
import { getAuthErrorMessage } from '../utils/authError';

type AuthMode = 'login' | 'register';

type FieldProps = {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder: string;
  secureTextEntry?: boolean;
  keyboardType?: 'default' | 'email-address' | 'phone-pad';
  autoCapitalize?: 'none' | 'sentences';
};

function Field({
  label,
  value,
  onChangeText,
  placeholder,
  secureTextEntry = false,
  keyboardType = 'default',
  autoCapitalize = 'sentences',
}: FieldProps) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        style={styles.input}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor="#8B91A0"
        secureTextEntry={secureTextEntry}
        keyboardType={keyboardType}
        autoCapitalize={autoCapitalize}
        autoCorrect={false}
      />
    </View>
  );
}

export function AuthScreen() {
  const { login, register } = useAuth();
  const [mode, setMode] = useState<AuthMode>('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [passwordConfirmation, setPasswordConfirmation] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [birthDate, setBirthDate] = useState('');
  const [photoUri, setPhotoUri] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const isRegistration = mode === 'register';
  const canSubmit = useMemo(() => {
    const basicFieldsFilled = email.trim() !== '' && password !== '';
    if (!isRegistration) return basicFieldsFilled;
    return basicFieldsFilled
      && name.trim() !== ''
      && passwordConfirmation !== ''
      && phoneNumber.trim() !== ''
      && birthDate.trim() !== ''
      && photoUri !== '';
  }, [birthDate, email, isRegistration, name, password, passwordConfirmation, phoneNumber, photoUri]);

  const choosePhoto = useCallback(async () => {
    setError('');
    try {
      const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 0.75 });
      if (!result.canceled && result.assets[0]) setPhotoUri(result.assets[0].uri);
    } catch {
      setError('Não foi possível abrir suas fotos. Verifique a permissão do aplicativo.');
    }
  }, []);

  const submit = useCallback(async () => {
    setError('');

    if (!canSubmit) {
      setError('Preencha todos os campos.');
      return;
    }
    if (isRegistration && password !== passwordConfirmation) {
      setError('As senhas não são iguais.');
      return;
    }
    if (password.length < 6) {
      setError('A senha precisa ter pelo menos 6 caracteres.');
      return;
    }

    setBusy(true);
    try {
      if (isRegistration) {
        await register({ name, email, password, phoneNumber, birthDate, photoUri });
      } else {
        await login(email, password);
      }
    } catch (submitError: unknown) {
      setError(getAuthErrorMessage(submitError));
    } finally {
      setBusy(false);
    }
  }, [birthDate, canSubmit, email, isRegistration, login, name, password, passwordConfirmation, phoneNumber, photoUri, register]);

  const changeMode = useCallback(() => {
    setMode((currentMode) => currentMode === 'login' ? 'register' : 'login');
    setError('');
  }, []);

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.header}>
          <Text style={styles.eyebrow}>CHAT FIREBASE</Text>
          <Text style={styles.title}>{isRegistration ? 'Criar conta' : 'Entrar'}</Text>
          <Text style={styles.subtitle}>
            {isRegistration ? 'Cadastre-se com seu e-mail e senha.' : 'Entre para continuar suas conversas.'}
          </Text>
        </View>

        {isRegistration && (
          <>
            <Field label="Nome" value={name} onChangeText={setName} placeholder="Seu nome" />
            <Field
              label="Celular"
              value={phoneNumber}
              onChangeText={setPhoneNumber}
              placeholder="(00) 00000-0000"
              keyboardType="phone-pad"
            />
            <Field
              label="Data de nascimento"
              value={birthDate}
              onChangeText={setBirthDate}
              placeholder="DD/MM/AAAA"
            />
            <Text style={styles.label}>Foto de perfil</Text>
            <Pressable style={styles.photoButton} onPress={choosePhoto} disabled={busy}>
              <Avatar name={name.trim() || '?'} photoUrl={photoUri} size={64} />
              <Text style={styles.photoText}>{photoUri ? 'Trocar foto' : 'Selecionar foto'}</Text>
            </Pressable>
          </>
        )}

        <Field
          label="E-mail"
          value={email}
          onChangeText={setEmail}
          placeholder="voce@email.com"
          keyboardType="email-address"
          autoCapitalize="none"
        />
        <Field
          label="Senha"
          value={password}
          onChangeText={setPassword}
          placeholder="Mínimo de 6 caracteres"
          secureTextEntry
          autoCapitalize="none"
        />
        {isRegistration && (
          <Field
            label="Confirmar senha"
            value={passwordConfirmation}
            onChangeText={setPasswordConfirmation}
            placeholder="Digite a senha novamente"
            secureTextEntry
            autoCapitalize="none"
          />
        )}

        {error !== '' && <Text style={styles.error}>{error}</Text>}

        <Pressable
          style={[styles.primaryButton, (!canSubmit || busy) && styles.disabledButton]}
          onPress={submit}
          disabled={!canSubmit || busy}
        >
          {busy
            ? <ActivityIndicator color="#FFFFFF" />
            : <Text style={styles.primaryButtonText}>{isRegistration ? 'Criar conta' : 'Entrar'}</Text>}
        </Pressable>

        <Pressable style={styles.modeButton} onPress={changeMode} disabled={busy}>
          <Text style={styles.modeText}>
            {isRegistration ? 'Já tem uma conta? Entrar' : 'Ainda não tem conta? Cadastre-se'}
          </Text>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#F5F6FA' },
  content: { flexGrow: 1, justifyContent: 'center', padding: 24, paddingVertical: 40 },
  header: { marginBottom: 30 },
  eyebrow: { color: '#5865D8', fontSize: 12, fontWeight: '700', letterSpacing: 1.5, marginBottom: 10 },
  title: { color: '#171923', fontSize: 30, fontWeight: '700', marginBottom: 8 },
  subtitle: { color: '#666C7A', fontSize: 15 },
  field: { marginBottom: 16 },
  photoButton: { alignItems: 'center', alignSelf: 'flex-start', flexDirection: 'row', gap: 12, marginBottom: 16, marginTop: 4 },
  photoText: { color: '#5865D8', fontSize: 14, fontWeight: '600' },
  label: { color: '#303443', fontSize: 14, fontWeight: '600', marginBottom: 7 },
  input: {
    backgroundColor: '#FFFFFF',
    borderColor: '#DDE0E8',
    borderRadius: 10,
    borderWidth: 1,
    color: '#171923',
    fontSize: 16,
    minHeight: 50,
    paddingHorizontal: 14,
  },
  error: { color: '#B42318', fontSize: 14, marginBottom: 14 },
  primaryButton: {
    alignItems: 'center',
    backgroundColor: '#5865D8',
    borderRadius: 10,
    justifyContent: 'center',
    minHeight: 50,
    marginTop: 6,
  },
  disabledButton: { opacity: 0.55 },
  primaryButtonText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
  modeButton: { alignItems: 'center', paddingVertical: 20 },
  modeText: { color: '#5865D8', fontSize: 14, fontWeight: '600' },
});
