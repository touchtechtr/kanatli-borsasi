import { NextResponse } from 'next/server'
import { Resend } from 'resend'

export async function POST() {
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json(
      {
        error:
          'Bu test endpointi yalnızca geliştirme ortamında kullanılabilir.',
      },
      { status: 404 }
    )
  }

  const apiKey = process.env.RESEND_API_KEY
  const from = process.env.EMAIL_FROM
  const to = process.env.EMAIL_TEST_TO

  const missing = [
    !apiKey && 'RESEND_API_KEY',
    !from && 'EMAIL_FROM',
    !to && 'EMAIL_TEST_TO',
  ].filter(Boolean)

  if (missing.length > 0) {
    return NextResponse.json(
      {
        error: 'Eksik ortam değişkeni.',
        missing,
      },
      { status: 500 }
    )
  }

  try {
    const resend = new Resend(apiKey)

    const { data, error } = await resend.emails.send({
      from: from!,
      to: [to!],
      subject: 'Kanatlı Borsası e-posta testi',
      html: `
        <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #0f172a;">
          <h2>Kanatlı Borsası</h2>
          <p>E-posta sistemi başarıyla çalışıyor.</p>
          <p style="color: #64748b; font-size: 13px;">
            Bu mesaj yerel geliştirme ortamından gönderilen bir test e-postasıdır.
          </p>
        </div>
      `,
    })

    if (error) {
      return NextResponse.json(
        { error: error.message },
        { status: 400 }
      )
    }

    return NextResponse.json({
      success: true,
      message: 'Test e-postası gönderildi.',
      emailId: data?.id,
    })
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : 'E-posta gönderilirken bilinmeyen bir hata oluştu.',
      },
      { status: 500 }
    )
  }
}