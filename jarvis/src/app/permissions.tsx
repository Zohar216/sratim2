import { useEffect } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { hasNativeAgent, openAccessibilitySettings } from '../core/platform/device';
import { refreshServiceState } from '../state/controller';
import { useAppState } from '../state/store';
import { Button, Section, StatusDot } from '../ui/components';
import { colors, common, space } from '../ui/theme';

/** Every permission Jarvis uses, why, and what it is NOT used for. */
const PERMISSIONS: { name: string; why: string; not: string }[] = [
  {
    name: 'שירות נגישות (Accessibility)',
    why: 'קריאת הטקסטים והכפתורים שעל המסך, לחיצה, הקלדה וגלילה — רק בזמן משימה שנתת. מציג גם כפתור "עצור" צף וכרטיס אישור מעל אפליקציות אחרות.',
    not: 'לא פועל ברקע בלי משימה, לא שומר ולא שולח תוכן מסך, לא קורא שדות סיסמה, ולא פועל באפליקציות בנקים/תשלומים/הגדרות מערכת.',
  },
  {
    name: 'מיקרופון (RECORD_AUDIO)',
    why: 'זיהוי דיבור כשאתה לוחץ על כפתור המיקרופון.',
    not: 'אין האזנה ברקע ואין מילת הפעלה.',
  },
  {
    name: 'אנשי קשר (READ_CONTACTS)',
    why: 'למצוא את המספר של מי שביקשת לשלוח לו הודעה או להתקשר אליו.',
    not: 'אנשי הקשר לא מועתקים ל-Jarvis ולא נשלחים לשום מקום. אין הרשאת כתיבה.',
  },
  {
    name: 'שעון מעורר (SET_ALARM)',
    why: 'כיוון שעון מעורר וטיימר באפליקציית השעון.',
    not: '—',
  },
  {
    name: 'אינטרנט (INTERNET)',
    why: 'רק להורדת קובץ המודל (פעם אחת).',
    not: 'הבינה המלאכותית רצה על הטלפון. שום שיחה או תוכן מסך לא נשלחים לשרת.',
  },
];

const RULES = [
  'פעולות רגישות (שליחה, מחיקה, רכישה, אישור, פרסום) תמיד דורשות את האישור שלך, עם הנמען והטקסט המדויקים.',
  'המודל לא יכול להריץ קוד — רק לבחור מתוך רשימת פעולות סגורה, שנבדקת לפני ביצוע.',
  'למודל אין פעולה שמשנה הגדרות או הרשאות, ו-Jarvis לא פועל בתוך מסך ההגדרות.',
  'לא נשלחות הודעות SMS ולא מתבצעות שיחות ישירות — Jarvis פותח את המסך המוכן ולוחץ "שלח" רק אחרי אישור.',
  'כפתור "עצור" זמין תמיד — בצ׳אט ובכפתור הצף מעל כל אפליקציה.',
];

export default function PermissionsScreen() {
  const serviceEnabled = useAppState((s) => s.serviceEnabled);
  useEffect(() => refreshServiceState(), []);

  return (
    <ScrollView style={common.screen} contentContainerStyle={{ paddingBottom: 40 }}>
      <View style={[common.card, { margin: space.md, gap: space.md }]}>
        <View style={styles.statusRow}>
          <StatusDot ok={serviceEnabled} />
          <Text style={common.title}>{serviceEnabled ? 'שירות הנגישות פעיל' : 'שירות הנגישות כבוי'}</Text>
        </View>
        <Text style={common.dim}>
          להפעלה: הגדרות ← נגישות ← אפליקציות מותקנות ← Jarvis ← הפעל. ב-Samsung ייתכן שתצטרך קודם לאשר ״הגדרות מוגבלות״ בפרטי האפליקציה
          (הגדרות ← אפליקציות ← Jarvis ← ⋮ ← אפשר הגדרות מוגבלות) כי האפליקציה הותקנה מחוץ לחנות.
        </Text>
        {hasNativeAgent ? (
          <Button label={serviceEnabled ? 'פתח הגדרות נגישות' : 'הפעל עכשיו'} icon="accessibility" onPress={openAccessibilitySettings} />
        ) : (
          <Text style={[common.dim, { color: colors.warning }]}>זמין רק ב-development build של Android.</Text>
        )}
      </View>

      <Section title="כללי אבטחה">
        <View style={{ padding: space.lg, gap: space.sm }}>
          {RULES.map((r) => (
            <Text key={r} style={common.body}>
              • {r}
            </Text>
          ))}
        </View>
      </Section>

      <Section title="ההרשאות ש-Jarvis מבקש">
        {PERMISSIONS.map((p) => (
          <View key={p.name} style={styles.perm}>
            <Text style={common.title}>{p.name}</Text>
            <Text style={common.body}>למה: {p.why}</Text>
            <Text style={common.dim}>מה לא: {p.not}</Text>
          </View>
        ))}
      </Section>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  perm: { padding: space.lg, gap: 4, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
});
