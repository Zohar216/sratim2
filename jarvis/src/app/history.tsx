import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';

import { deleteConversation, listConversations, type Conversation } from '../core/memory/repositories';
import { newConversation, openConversation } from '../state/controller';
import { getState, useAppState } from '../state/store';
import { colors, common, space } from '../ui/theme';

export default function HistoryScreen() {
  const [items, setItems] = useState<Conversation[]>([]);
  const currentId = useAppState((s) => s.conversationId);
  const reload = useCallback(() => void listConversations().then(setItems), []);
  useFocusEffect(reload);

  return (
    <FlatList
      style={common.screen}
      data={items}
      keyExtractor={(c) => String(c.id)}
      ListEmptyComponent={<Text style={[common.dim, { padding: space.xl, textAlign: 'center' }]}>אין שיחות.</Text>}
      renderItem={({ item }) => (
        <Pressable
          style={[styles.row, item.id === currentId && { backgroundColor: colors.surface }]}
          onPress={async () => {
            await openConversation(item.id);
            router.back();
          }}
        >
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={common.body} numberOfLines={1}>
              {item.preview ?? item.title}
            </Text>
            <Text style={common.dim}>{new Date(item.updatedAt).toLocaleString('he-IL')}</Text>
          </View>
          <Pressable
            hitSlop={10}
            accessibilityLabel="מחק שיחה"
            onPress={async () => {
              await deleteConversation(item.id);
              if (getState().conversationId === item.id) await newConversation();
              reload();
            }}
          >
            <Ionicons name="trash-outline" size={18} color={colors.danger} />
          </Pressable>
        </Pressable>
      )}
    />
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
});
