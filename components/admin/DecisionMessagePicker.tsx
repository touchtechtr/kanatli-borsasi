'use client'

import { ADMIN_DECISION_MESSAGES, type DecisionAction } from '@/constants/adminDecisionMessages'

type Props = {
  action: DecisionAction
  value: string
  onChange: (value: string) => void
  disabled?: boolean
}

export default function DecisionMessagePicker({ action, value, onChange, disabled }: Props) {
  const options = ADMIN_DECISION_MESSAGES[action]
  const isPreset = options.includes(value)
  const selection = isPreset ? value : value ? '__other__' : ''

  return (
    <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
      <label className="block text-sm font-semibold text-slate-700">
        Kullanıcıya iletilecek açıklama
      </label>
      <select
        value={selection}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value === '__other__' ? '' : event.target.value)}
        className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800"
      >
        <option value="">Standart açıklama seçin</option>
        {options.map((message) => <option key={message} value={message}>{message}</option>)}
        <option value="__other__">Diğer — kendim yazacağım</option>
      </select>
      {selection === '__other__' && (
        <textarea
          value={value}
          disabled={disabled}
          onChange={(event) => onChange(event.target.value)}
          rows={3}
          placeholder="Kullanıcıya iletilecek özel açıklamayı yazın."
          className="w-full rounded-xl border border-slate-200 bg-white p-3 text-sm"
        />
      )}
      <p className="text-xs text-slate-500">
        Seçilen açıklama işlem kaydına eklenir ve ilgili kullanıcıya bildirim olarak gönderilir.
      </p>
    </div>
  )
}
