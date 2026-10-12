export type DecisionAction =
  | 'onayla'
  | 'reddet'
  | 'durdur'
  | 'etkinlestir'
  | 'tamamla'

export const ADMIN_DECISION_MESSAGES: Record<DecisionAction, string[]> = {
  onayla: [
    'Başvuru bilgileri incelenmiş ve uygun bulunmuştur.',
    'Sunulan bilgiler ve belgeler yeterli bulunarak işlem onaylanmıştır.',
    'Başvuru gerekli koşulları karşıladığı için onaylanmıştır.',
  ],
  reddet: [
    'Başvuru bilgilerinde eksiklik bulunduğu için işlem reddedilmiştir.',
    'Sunulan bilgiler doğrulanamadığı için işlem reddedilmiştir.',
    'Başvuru platform koşullarını karşılamadığı için reddedilmiştir.',
    'Başvuru mükerrer veya hatalı kayıt içerdiği için reddedilmiştir.',
  ],
  durdur: [
    'Kayıt yönetim incelemesi tamamlanana kadar geçici olarak durdurulmuştur.',
    'Güncel bilgilerin doğrulanması gerektiği için kayıt geçici olarak durdurulmuştur.',
  ],
  etkinlestir: [
    'Gerekli kontroller tamamlanmış ve kayıt yeniden etkinleştirilmiştir.',
    'Eksiklikler giderildiği için kayıt yeniden yayımlanmıştır.',
  ],
  tamamla: [
    'İşlem başarıyla tamamlanmış ve kayıt tamamlandı olarak işaretlenmiştir.',
    'Süreç sonuçlandırılmış ve ilgili kayıt kapatılmıştır.',
  ],
}

