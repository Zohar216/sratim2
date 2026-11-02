import Ionicons from '@expo/vector-icons/Ionicons';
import { Modal, StyleSheet, Text, View } from 'react-native';

import { answerApproval } from '../state/controller';
import { useAppState } from '../state/store';
import { Button } from './components';
import { colors, common, radius, space } from './theme';

/**
 * In-app approval for sensitive actions. Shows exactly what will happen (recipient, number,
 * full message text). When Jarvis is operating another app, the same request is shown as a
 * native overlay instead (see OverlayController.kt).
 */
export function ApprovalSheet() {
  const pending = useAppState((s) => s.pendingApproval);
  return (
    <Modal visible={pending != null} transparent animationType="slide" onRequestClose={() => answerApproval(false)}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <View style={styles.header}>
            <Ionicons name="shield-checkmark" size={22} color={colors.warning} />
            <Text style={common.title}>{pending?.title}</Text>
          </View>
          <Text style={[common.body, styles.details]} selectable>
            {pending?.details}
          </Text>
          <View style={styles.buttons}>
            <View style={{ flex: 1 }}>
              <Button label="אשר" icon="checkmark" onPress={() => answerApproval(true)} />
            </View>
            <View style={{ flex: 1 }}>
              <Button label="בטל" tone="secondary" onPress={() => answerApproval(false)} />
            </View>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.55)' },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    padding: space.xl,
    paddingBottom: 36,
    gap: space.lg,
  },
  header: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  details: { backgroundColor: colors.surfaceHigh, borderRadius: radius.sm, padding: space.md },
  buttons: { flexDirection: 'row', gap: space.md },
});
