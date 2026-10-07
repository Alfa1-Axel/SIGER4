import { useId, useState } from 'react'
import type { ChangeEvent, KeyboardEvent } from 'react'
import { Icon } from './Icon'

interface NumberStepperProps {
  label: string
  value: number
  onChange: (value: number) => void
  min?: number
  max?: number
  disabled?: boolean
}

// Cantidad entera con botones − y +, para cargar números rápido (dotación,
// por ejemplo) sin un cuadro de texto libre:
//   - en el celular abre el teclado numérico (inputMode="numeric");
//   - solo deja dígitos: una letra, un signo o un punto se descarta y se avisa;
//   - nunca baja del mínimo (0) ni pasa del máximo;
//   - con el teclado: flecha arriba/abajo suman o restan 1, y RePág/AvPág 10.
// El valor siempre es un entero válido: el que escribe nunca queda con un
// campo vacío o inválido que después haya que corregir.
export function NumberStepper({ label, value, onChange, min = 0, max = 9999, disabled = false }: NumberStepperProps) {
  const id = useId()
  const [warning, setWarning] = useState<string | null>(null)

  function set(next: number) {
    setWarning(null)
    onChange(Math.min(max, Math.max(min, next)))
  }

  function handleChange(event: ChangeEvent<HTMLInputElement>) {
    const raw = event.target.value
    const digits = raw.replace(/\D/g, '')
    if (digits === '') {
      setWarning(raw === '' ? null : `Solo números enteros, desde ${min}.`)
      onChange(min)
      return
    }
    const parsed = Number(digits.slice(0, 7))
    if (parsed > max) {
      setWarning(`El máximo es ${max}.`)
      onChange(max)
      return
    }
    setWarning(digits === raw ? null : `Solo números enteros, desde ${min}.`)
    onChange(parsed)
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    const steps: Record<string, number> = { ArrowUp: 1, ArrowDown: -1, PageUp: 10, PageDown: -10 }
    const step = steps[event.key]
    if (step === undefined) return
    event.preventDefault()
    set(value + step)
  }

  return (
    <div className="stepper-field">
      <label htmlFor={id} className="stepper-label">
        {label}
      </label>
      <div className="stepper">
        <button type="button" className="stepper-button" aria-label={`Restar uno a ${label}`} disabled={disabled || value <= min} onClick={() => set(value - 1)}>
          <Icon name="minus" size={16} />
        </button>
        <input
          id={id}
          className="stepper-input"
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          autoComplete="off"
          enterKeyHint="next"
          role="spinbutton"
          aria-valuemin={min}
          aria-valuemax={max}
          aria-valuenow={value}
          aria-invalid={warning ? true : undefined}
          aria-describedby={warning ? `${id}-warning` : undefined}
          value={String(value)}
          disabled={disabled}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          onFocus={(event) => event.target.select()}
          onBlur={() => setWarning(null)}
        />
        <button type="button" className="stepper-button" aria-label={`Sumar uno a ${label}`} disabled={disabled || value >= max} onClick={() => set(value + 1)}>
          <Icon name="plus" size={16} />
        </button>
      </div>
      {warning && (
        <p id={`${id}-warning`} className="field-error" role="alert">
          {warning}
        </p>
      )}
    </div>
  )
}
