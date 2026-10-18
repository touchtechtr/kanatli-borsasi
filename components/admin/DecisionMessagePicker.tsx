'use client'

import { useEffect, useState } from 'react'
import { ADMIN_DECISION_MESSAGES, type DecisionAction } from '@/constants/adminDecisionMessages'

type Props = {
  action: DecisionAction
  value: string
  onChange: (value: string) => void
  disabled?: boolean
}

export default function DecisionMessagePicker({ action, value, onChange, disabled }: Props) {
  const options = ADMIN_DECISION_MESSAGES[action]
  const [customMode, setCustomMode] = useState(Boolean(value && !options.includes(value)))

  useEffect(() => {
    if (value && options.includes(value)) setCustomMode(false)
  }, [options, value])

  const selection = customMode ? '__other__' : options.includes(value) ? value : ''

  return (
    <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
      <label className="block text-sm font-semibold text-slate-700">
        Kullanıcıya iletilecek açıklama
      </label>
      <select
        value={selection}
        disabled={disabled}
        onChange={(event) => {
          if (event.target.value === '__other__') {
            setCustomMode(true)
            onChange('')
            return
          }
          setCustomMode(false)
          onChange(event.target.value)
        }}
        className="ui-input"
      >
        <option value="">Standart açıklama seçin</option>
        {options.map((message) => <option key={message} value={message}>{message}</option>)}
        <option value="__other__">Diğer — kendim yazacağım</option>
      </select>
      {customMode && (
        <textarea
          value={value}
          disabled={disabled}
          onChange={(event) => onChange(event.target.value)}
          rows={3}
          placeholder="Kullanıcıya iletilecek özel açıklamayı yazın."
          className="ui-input"
          autoFocus
        />
      )}
      <p className="text-xs text-slate-500">
        Seçilen açıklama işlem kaydına eklenir ve ilgili kullanıcıya bildirim olarak gönderilir.
      </p>
    </div>
  )
}
