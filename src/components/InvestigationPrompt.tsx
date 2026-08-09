import { useEffect, useState } from 'react'

type PromptOption = {
  id: string
  label: string
  correct?: boolean
}

export function InvestigationPrompt({
  number,
  title,
  question,
  options,
  value,
  onChange,
  successText,
  retryText = '再看一眼现场。这个判断还解释不了当前证据。',
  evaluate = true,
}: {
  number: string
  title: string
  question: string
  options: PromptOption[]
  value?: string
  onChange: (id: string) => void
  successText: string
  retryText?: string
  evaluate?: boolean
}) {
  const [draft, setDraft] = useState(value)
  useEffect(() => setDraft(value), [value])
  const selected = options.find((option) => option.id === value)
  const correct = Boolean(selected && (!evaluate || selected.correct))
  const dirty = Boolean(draft && draft !== value)

  return (
    <section className={`investigation-prompt ${correct ? 'correct' : ''}`} aria-label={`调查判断 ${number}`}>
      <span className="prompt-kicker">FIELD QUESTION // {number}</span>
      <h3>{title}</h3>
      <p>{question}</p>
      <div className={`prompt-options ${options.length === 2 ? 'cols-2' : ''}`}>
        {options.map((option) => (
          <button
            type="button"
            key={option.id}
            className={`prompt-option ${draft === option.id ? 'selected' : ''} ${evaluate && value === option.id && !option.correct ? 'wrong' : ''}`}
            aria-pressed={draft === option.id}
            onClick={() => setDraft(option.id)}
          >
            ▶ {option.label}
          </button>
        ))}
      </div>
      <button
        type="button"
        className="prompt-commit"
        disabled={!draft || (!dirty && Boolean(value))}
        onClick={() => draft && onChange(draft)}
      >
        {value ? '▶ 更新并锁定判断' : '▶ 锁定这个判断'}
      </button>
      {selected && <div className={`prompt-feedback ${correct ? 'good' : ''}`}>{correct ? successText : retryText}</div>}
    </section>
  )
}
