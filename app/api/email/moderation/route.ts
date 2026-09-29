import { createClient } from '@supabase/supabase-js'
import { Resend } from 'resend'

type ModerationEvent = 'approved' | 'rejected' | 'unblocked'

const escapeHtml = (value: string) =>
  value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;')

export async function POST(request: Request) {
  const apiKey = process.env.RESEND_API_KEY
  const from = process.env.EMAIL_FROM
  const testRecipient = process.env.EMAIL_TEST_TO
  const deliveryMode = process.env.EMAIL_DELIVERY_MODE
  const siteUrl = (
    process.env.SITE_URL || 'http://localhost:3000'
  ).replace(/\/$/, '')
  
  const profileUrl = `${siteUrl}/profil`
  const createListingUrl = `${siteUrl}/livestock/new`

  if (!apiKey || !from || !testRecipient) {
    return Response.json(
      { error: 'E-posta ortam değişkenleri eksik.' },
      { status: 500 }
    )
  }

  if (deliveryMode !== 'test') {
    return Response.json(
      {
        error:
          'Gerçek gönderim için doğrulanmış alan adı henüz yapılandırılmadı.'
      },
      { status: 503 }
    )
  }

  const authorization = request.headers.get('authorization')
  const accessToken = authorization?.replace(/^Bearer\s+/i, '')

  if (!accessToken) {
    return Response.json(
      { error: 'Oturum bilgisi bulunamadı.' },
      { status: 401 }
    )
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!supabaseUrl || !supabaseAnonKey) {
    return Response.json(
      { error: 'Supabase ortam değişkenleri eksik.' },
      { status: 500 }
    )
  }

  const supabase = createClient(
    supabaseUrl,
    supabaseAnonKey,
    {
      global: {
        headers: {
          Authorization: `Bearer ${accessToken}`
        }
      },
      auth: {
        persistSession: false,
        autoRefreshToken: false
      }
    }
  )

  const {
    data: { user },
    error: userError
  } = await supabase.auth.getUser(accessToken)

  if (userError || !user) {
    console.error('Supabase kullanıcı doğrulama hatası:', userError)
  
    return Response.json(
      {
        error: userError?.message || 'Oturum doğrulanamadı.',
      },
      { status: 401 }
    )
  }

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('is_admin')
    .eq('id', user.id)
    .single()

  if (profileError || !profile?.is_admin) {
    return Response.json(
      { error: 'Bu işlem için yönetici yetkisi gerekiyor.' },
      { status: 403 }
    )
  }

  let body: {
    companyId?: string
    event?: ModerationEvent
  }

  try {
    body = await request.json()
  } catch {
    return Response.json(
      { error: 'Geçersiz istek.' },
      { status: 400 }
    )
  }

  const { companyId, event } = body

  if (
    !companyId ||
    !event ||
    !['approved', 'rejected', 'unblocked'].includes(event)
  ) {
    return Response.json(
      { error: 'Firma veya işlem türü geçersiz.' },
      { status: 400 }
    )
  }

  const { data: company, error: companyError } = await supabase
    .from('companies')
    .select(
      'id, name, status, rejection_count, last_rejection_reason, blocked_until, is_permanently_blocked'
    )
    .eq('id', companyId)
    .single()

  if (companyError || !company) {
    return Response.json(
      { error: 'Firma bulunamadı.' },
      { status: 404 }
    )
  }

  const safeCompanyName = escapeHtml(company.name)
  const safeReason = escapeHtml(
    company.last_rejection_reason ||
      'Herhangi bir neden belirtilmedi.'
  )

  let subject = ''
  let title = ''
  let message = ''
  let detailHtml = ''
  let primaryActionText = ''
  let primaryActionUrl = ''
  let secondaryActionHtml = ''

  if (event === 'approved') {
    subject = `${company.name} firma başvurusu onaylandı`
    title = 'Firma Başvurunuz Onaylandı'
    message =
      'Firmanız Kanatlı Borsası yönetimi tarafından onaylandı. Artık alım, satım ve ilan işlemlerini kullanabilirsiniz.'
  
    primaryActionText = 'Yeni İlan Oluştur'
    primaryActionUrl = createListingUrl
  
    secondaryActionHtml = `
      <a
        href="${profileUrl}"
        style="display:inline-block;margin-left:10px;color:#047857;font-weight:600;text-decoration:none"
      >
        Firma Bilgilerimi Görüntüle
      </a>
    `
  }

  if (event === 'rejected') {
    subject = `${company.name} firma başvurusu hakkında`
    title = 'Firma Başvurunuz Onaylanmadı'
    message =
      'Firma başvurunuz incelendi ve şu aşamada onaylanmadı.'
  
    primaryActionText = 'Firma Bilgilerini Güncelle'
    primaryActionUrl = profileUrl
  
    detailHtml = `
      <div style="background:#fef2f2;border:1px solid #fecaca;border-radius:12px;padding:16px;margin-top:18px">
        <strong style="color:#991b1b">Ret nedeni:</strong>
        <p style="color:#7f1d1d;margin:8px 0 0">${safeReason}</p>
      </div>
    `
  
    if (company.is_permanently_blocked) {
      detailHtml += `
        <div style="background:#7f1d1d;color:#ffffff;border-radius:12px;padding:16px;margin-top:12px">
          Firma hesabınıza kalıcı engel uygulanmıştır. Platform yönetimiyle iletişime geçebilirsiniz.
        </div>
      `
    } else if (company.blocked_until) {
      const blockedUntil = new Date(
        company.blocked_until
      ).toLocaleString('tr-TR', {
        timeZone: 'Europe/Istanbul',
      })
  
      detailHtml += `
        <div style="background:#fff7ed;border:1px solid #fdba74;color:#9a3412;border-radius:12px;padding:16px;margin-top:12px">
          Geçici engel bitişi: ${escapeHtml(blockedUntil)}
        </div>
      `
    }
  }
  
  if (event === 'unblocked') {
    subject = `${company.name} firma engeli kaldırıldı`
    title = 'Firma Engeliniz Kaldırıldı'
    message =
      'Firma hesabınıza uygulanan engel yönetim tarafından kaldırıldı. Bilgilerinizi kontrol ederek yeniden inceleme talebi gönderebilirsiniz.'
  
    primaryActionText = 'Firma Bilgilerini Kontrol Et'
    primaryActionUrl = profileUrl
  }
  
  const resend = new Resend(apiKey)
  const { data, error } = await resend.emails.send({
    from,
    to: testRecipient,
    subject: `[TEST] ${subject}`,
    html: `
  <div style="background:#f1f5f9;padding:32px 12px;font-family:Arial,sans-serif">
    <div style="max-width:620px;margin:auto;background:#ffffff;border:1px solid #e2e8f0;border-radius:18px;overflow:hidden">

      <div style="background:#064e3b;padding:22px 28px">
        <table role="presentation" cellpadding="0" cellspacing="0">
          <tr>
            <td>
              <div style="width:48px;height:48px;border-radius:14px;background:#10b981;color:#ffffff;font-size:19px;font-weight:bold;line-height:48px;text-align:center">
                KB
              </div>
            </td>

            <td style="padding-left:14px">
              <div style="font-size:20px;font-weight:bold;color:#ffffff">
                Kanatlı Borsası
              </div>

              <div style="font-size:12px;color:#a7f3d0;margin-top:3px">
                Güvenli Tarım ve Hayvancılık Ticaret Ağı
              </div>
            </td>
          </tr>
        </table>
      </div>

      <div style="padding:28px">
        <div style="background:#ecfdf5;border:1px solid #a7f3d0;color:#047857;border-radius:10px;padding:10px 14px;font-size:12px;margin-bottom:22px">
          TEST MODU — Bu mesaj gerçek kullanıcıya gönderilmemiştir.
        </div>

        <h1 style="font-size:24px;color:#0f172a;margin:0 0 20px">
          ${escapeHtml(title)}
        </h1>

        <p style="font-size:16px;line-height:1.7;color:#334155">
          Sayın <strong>${safeCompanyName}</strong>,
        </p>

        <p style="font-size:16px;line-height:1.7;color:#334155">
          ${escapeHtml(message)}
        </p>

        ${detailHtml}

        ${
          primaryActionUrl
            ? `
              <div style="margin-top:26px">
                <a
                  href="${primaryActionUrl}"
                  style="display:inline-block;background:#059669;color:#ffffff;text-decoration:none;font-size:14px;font-weight:bold;padding:13px 20px;border-radius:10px"
                >
                  ${escapeHtml(primaryActionText)}
                </a>

                ${secondaryActionHtml}
              </div>
            `
            : ''
        }

        <p style="font-size:13px;color:#64748b;margin-top:26px">
          Toplam ret sayısı: ${company.rejection_count}
        </p>

        <hr style="border:none;border-top:1px solid #e2e8f0;margin:26px 0">

        <p style="font-size:12px;line-height:1.6;color:#94a3b8;margin:0">
          Bu e-posta Kanatlı Borsası moderasyon sistemi tarafından
          otomatik olarak oluşturulmuştur.
        </p>
      </div>
    </div>
  </div>
`
  })

  if (error) {
    return Response.json(
      { error: error.message },
      { status: 400 }
    )
  }

  return Response.json({
    success: true,
    message: 'Moderasyon test e-postası gönderildi.',
    emailId: data?.id
  })
}