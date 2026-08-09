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
  const selected = options.find((option) => option.id === value)
  const correct = Boolean(selected && (!evaluate || selected.correct))

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
            className={`prompt-option ${value === option.id ? 'selected' : ''} ${evaluate && value === option.id && !option.correct ? 'wrong' : ''}`}
            aria-pressed={value === option.id}
            onClick={() => onChange(option.id)}
          >
            ▶ {option.label}
          </button>
        ))}
      </div>
      {selected && <div className={`prompt-feedback ${correct ? 'good' : ''}`}>{correct ? successText : retryText}</div>}
    </section>
  )
}
