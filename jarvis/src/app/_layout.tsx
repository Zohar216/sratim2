import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { AppState } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { bootstrap, refreshServiceState } from '../state/controller';
import { ApprovalSheet } from '../ui/ApprovalSheet';
import { colors } from '../ui/theme';

export default function RootLayout() {
  useEffect(() => {
    void bootstrap();
    // The user enables the accessibility service in system settings — re-check on return.
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') refreshServiceState();
    });
    return () => sub.remove();
  }, []);

  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: colors.bg },
          headerTintColor: colors.text,
          headerTitleStyle: { fontWeight: '700' },
          headerShadowVisible: false,
          contentStyle: { backgroundColor: colors.bg },
          animation: 'slide_from_left',
        }}
      >
        <Stack.Screen name="index" options={{ title: 'Jarvis' }} />
        <Stack.Screen name="settings" options={{ title: 'הגדרות' }} />
        <Stack.Screen name="model" options={{ title: 'מודל AI מקומי' }} />
        <Stack.Screen name="memory" options={{ title: 'זיכרון' }} />
        <Stack.Screen name="history" options={{ title: 'היסטוריית שיחות' }} />
        <Stack.Screen name="permissions" options={{ title: 'הרשאות ואבטחה' }} />
      </Stack>
      <ApprovalSheet />
    </SafeAreaProvider>
  );
}
