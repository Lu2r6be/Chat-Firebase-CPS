import { NavigationContainer } from '@react-navigation/native';
import { createNavigationContainerRef } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { isRunningInExpoGo } from 'expo';
import type * as NotificationsType from 'expo-notifications';
import { doc, getDoc } from 'firebase/firestore';
import { useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { useRef } from 'react';
import { auth, db } from './src/config/firebase';
import { AuthProvider } from './src/contexts/AuthContext';
import { useAuth } from './src/hooks/useAuth';
import { AuthScreen } from './src/screens/AuthScreen';
import { ConversationsScreen } from './src/screens/ConversationsScreen';
import { DirectChatScreen } from './src/screens/DirectChatScreen';
import { CreateGroupScreen } from './src/screens/CreateGroupScreen';
import { GroupChatScreen } from './src/screens/GroupChatScreen';
import { GroupSettingsScreen } from './src/screens/GroupSettingsScreen';
import { UsersScreen } from './src/screens/UsersScreen';
import { ProfileScreen } from './src/screens/ProfileScreen';
import type { RootStackParamList } from './src/types/navigation';

const Stack = createNativeStackNavigator<RootStackParamList>();
const navigationRef = createNavigationContainerRef<RootStackParamList>();

function AppContent() {
  const { user, loading } = useAuth();
  const pendingResponse = useRef<NotificationsType.NotificationResponse | null>(null);
  const openPendingResponse = useRef<() => void>(() => {});

  useEffect(() => {
    if (isRunningInExpoGo()) return;
    let active = true;
    let subscription: { remove: () => void } | undefined;

    async function openResponse(response: NotificationsType.NotificationResponse | null) {
      if (!response) return;
      if (!navigationRef.isReady()) { pendingResponse.current = response; return; }
      pendingResponse.current = null;
      const data = response.notification.request.content.data;
      if (!data) return;
      const conversationId = data.conversationId;
      const conversationType = data.conversationType;
      if (typeof conversationId !== 'string') return;
      if (conversationType === 'group') {
        try {
          const snapshot = await getDoc(doc(db, 'groups', conversationId));
          const name = snapshot.data()?.name;
          if (snapshot.exists() && typeof name === 'string') navigationRef.navigate('GroupChat', { groupId: conversationId, groupName: name });
        } catch { return; }
      } else if (conversationType === 'direct' && auth.currentUser) {
        try {
          const snapshot = await getDoc(doc(db, 'directConversations', conversationId));
          const participants = snapshot.data()?.participants;
          if (!snapshot.exists() || !Array.isArray(participants)) return;
          const otherUid = participants.find((uid: unknown) => typeof uid === 'string' && uid !== auth.currentUser?.uid);
          if (typeof otherUid !== 'string') return;
          const profile = await getDoc(doc(db, 'publicProfiles', otherUid));
          navigationRef.navigate('DirectChat', { conversationId, otherUid, otherName: profile.data()?.name ?? 'Conversa' });
        } catch { return; }
      }
    }

    openPendingResponse.current = () => {
      if (pendingResponse.current) void openResponse(pendingResponse.current);
    };
    void import('expo-notifications').then((Notifications) => {
      if (!active) return;
      Notifications.setNotificationHandler({
        handleNotification: async () => ({ shouldShowAlert: true, shouldPlaySound: true, shouldSetBadge: false, shouldShowBanner: true, shouldShowList: true }),
      });
      subscription = Notifications.addNotificationResponseReceivedListener((response) => { void openResponse(response); });
      void Notifications.getLastNotificationResponseAsync().then(openResponse);
    });
    return () => { active = false; subscription?.remove(); };
  }, []);

  if (loading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color="#5865D8" />
      </View>
    );
  }

  return (
    <>
      {user ? (
        <NavigationContainer ref={navigationRef} onReady={() => openPendingResponse.current()}>
          <Stack.Navigator screenOptions={{ headerShown: false }}>
            <Stack.Screen name="Conversations" component={ConversationsScreen} />
            <Stack.Screen
              name="Users"
              component={UsersScreen}
              options={{ headerShown: true, title: 'Usuários' }}
            />
            <Stack.Screen
              name="DirectChat"
              component={DirectChatScreen}
              options={({ route }) => ({ headerShown: true, title: route.params.otherName })}
            />
            <Stack.Screen
              name="CreateGroup"
              component={CreateGroupScreen}
              options={{ headerShown: true, title: 'Criar grupo' }}
            />
            <Stack.Screen
              name="GroupChat"
              component={GroupChatScreen}
              options={({ route }) => ({ headerShown: true, title: route.params.groupName })}
            />
            <Stack.Screen
              name="GroupSettings"
              component={GroupSettingsScreen}
              options={{ headerShown: true, title: 'Integrantes e configurações' }}
            />
            <Stack.Screen name="Profile" component={ProfileScreen} options={{ headerShown: true, title: 'Perfil' }} />
          </Stack.Navigator>
        </NavigationContainer>
      ) : <AuthScreen />}
      <StatusBar style="auto" />
    </>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F5F6FA',
  },
});
