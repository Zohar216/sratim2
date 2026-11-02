import { LAST_CONTACT, parseClock, routeCommand } from '../agent/commandRouter';

describe('routeCommand — Hebrew fast path', () => {
  const cases: [string, object | null][] = [
    // open app
    ['פתח WhatsApp', { action: 'open_app', app: 'WhatsApp' }],
    ['פתח וואטסאפ', { action: 'open_app', app: 'וואטסאפ' }],
    ["ג'רוויס, תפתח את ספוטיפיי בבקשה", { action: 'open_app', app: 'ספוטיפיי' }],
    ['כנס לוואטסאפ', { action: 'open_app', app: 'וואטסאפ' }],
    ['פתח לוח שנה', { action: 'open_app', app: 'לוח שנה' }],
    ['תפתח את האפליקציה של הבנק', { action: 'open_app', app: 'של הבנק' }],
    // open chat
    ['פתח את השיחה עם אמא', { action: 'open_chat', contact: 'אמא' }],
    ["תפתח צ'אט עם יוסי כהן", { action: 'open_chat', contact: 'יוסי כהן' }],
    // messages
    ['שלח לאמא שאני מגיע בעוד חצי שעה', { action: 'send_message', contact: 'אמא', message: 'אני מגיע בעוד חצי שעה', channel: 'whatsapp' }],
    ['תשלח הודעה ליוסי כהן: נפגשים ב-8', { action: 'send_message', contact: 'יוסי כהן', message: 'נפגשים ב-8', channel: 'whatsapp' }],
    ['כתוב לדני שאני מאחר קצת', { action: 'compose_message', contact: 'דני', message: 'אני מאחר קצת', channel: 'whatsapp' }],
    ['תגיד לאבא שאני בדרך', { action: 'send_message', contact: 'אבא', message: 'אני בדרך', channel: 'whatsapp' }],
    ['שלח SMS לרון שהפגישה בוטלה', { action: 'send_message', contact: 'רון', message: 'הפגישה בוטלה', channel: 'sms' }],
    ['תכתוב לו שאני מגיע', { action: 'compose_message', contact: LAST_CONTACT, message: 'אני מגיע', channel: 'whatsapp' }],
    ['שלח בוואטסאפ למשה לוי שהכל בסדר', { action: 'send_message', contact: 'משה לוי', message: 'הכל בסדר', channel: 'whatsapp' }],
    // calls
    ['תתקשר לאמא', { action: 'dial', contact: 'אמא' }],
    ['חייג ללאה', { action: 'dial', contact: 'לאה' }],
    // alarms & timers
    ['תעיר אותי ב-7:30', { action: 'set_alarm', hour: 7, minute: 30 }],
    ['תכוון שעון מעורר לשש וחצי', { action: 'set_alarm', hour: 6, minute: 30 }],
    ['קבע לי התראה ל-8 בערב', { action: 'set_alarm', hour: 20, minute: 0 }],
    ['טיימר 5 דקות', { action: 'set_timer', seconds: 300 }],
    ['שים טיימר של חצי שעה', { action: 'set_timer', seconds: 1800 }],
    ['הפעל טיימר לעשר דקות', { action: 'set_timer', seconds: 600 }],
    // navigation & search
    ['נווט לתל אביב', { action: 'navigate', destination: 'תל אביב' }],
    ['קח אותי לעזריאלי בווייז', { action: 'navigate', destination: 'עזריאלי' }],
    ['חפש בגוגל מזג אוויר מחר', { action: 'web_search', query: 'מזג אוויר מחר', site: 'google' }],
    ['חפש ביוטיוב שירים של עומר אדם', { action: 'web_search', query: 'שירים של עומר אדם', site: 'youtube' }],
    // memory
    ['תזכור שאמא זה 050-1234567', { action: 'remember', alias: 'אמא', value: '050-1234567' }],
    // simple
    ['חזור', { action: 'back' }],
    ['מה יש על המסך?', { action: 'read_screen' }],
    ['גלול למטה', { action: 'scroll', direction: 'down' }],
    // not recognised → LLM
    ['מה דעתך על הסרט החדש?', null],
    ['', null],
  ];

  it.each(cases)('%s', (input, expected) => {
    expect(routeCommand(input)).toEqual(expected);
  });
});

describe('parseClock', () => {
  it.each([
    ['7', { hour: 7, minute: 0 }],
    ['07:05', { hour: 7, minute: 5 }],
    ['שבע ורבע', { hour: 7, minute: 15 }],
    ['רבע לשמונה', { hour: 7, minute: 45 }],
    ['12 בבוקר', { hour: 0, minute: 0 }],
    ['תשע בערב', { hour: 21, minute: 0 }],
  ])('%s', (input, expected) => expect(parseClock(input)).toEqual(expected));

  it('rejects nonsense', () => expect(parseClock('מחרתיים')).toBeNull());
});
