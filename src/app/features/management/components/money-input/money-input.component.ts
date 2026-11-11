import {
  Component,
  forwardRef,
  Input,
  signal,
} from '@angular/core';
import {
  ControlValueAccessor,
  NG_VALUE_ACCESSOR,
} from '@angular/forms';

const digitsOnly = (value: unknown): string =>
  String(value ?? '')
    .replace(/\D/g, '')
    .replace(/^0+(?=\d)/, '');

const addThousandsSeparators = (digits: string): string =>
  digits.replace(/\B(?=(\d{3})+(?!\d))/g, '.');

@Component({
  selector: 'app-money-input',
  templateUrl: './money-input.component.html',
  styleUrls: ['./money-input.component.scss'],
  standalone: false,
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => MoneyInputComponent),
      multi: true,
    },
  ],
})
export class MoneyInputComponent implements ControlValueAccessor {
  @Input() label = '';
  @Input() placeholder = '';
  @Input() helperText = '';
  @Input() errorText = '';
  @Input() invalid = false;

  readonly displayValue = signal('');
  readonly disabled = signal(false);

  private value = '';
  private onChange: (value: string) => void = () => undefined;
  private onTouched: () => void = () => undefined;

  writeValue(value: unknown): void {
    this.value = digitsOnly(value);
    this.displayValue.set(addThousandsSeparators(this.value));
  }

  registerOnChange(fn: (value: string) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState(isDisabled: boolean): void {
    this.disabled.set(isDisabled);
  }

  handleBeforeInput(event: Event): void {
    const inputEvent = event as InputEvent;
    const insertedText =
      inputEvent.data ?? inputEvent.dataTransfer?.getData('text/plain');

    if (insertedText && /\D/.test(insertedText)) {
      event.preventDefault();
    }
  }

  handleInput(
    event: CustomEvent<{ value?: string | number | null }>,
  ): void {
    const rawValue = String(event.detail.value ?? '');
    const inputElement = event.target as HTMLIonInputElement | null;
    const nativeInput = inputElement?.shadowRoot?.querySelector('input');
    const caretPosition = nativeInput?.selectionStart ?? rawValue.length;
    const digitsBeforeCaret = rawValue
      .slice(0, caretPosition)
      .replace(/\D/g, '').length;

    this.value = digitsOnly(rawValue);
    const formatted = addThousandsSeparators(this.value);
    this.displayValue.set(formatted);
    this.onChange(this.value);

    if (inputElement && nativeInput) {
      requestAnimationFrame(() => {
        void inputElement.getInputElement().then((nativeElement) => {
          const nextCaret = this.caretAfterDigits(formatted, digitsBeforeCaret);
          nativeElement.setSelectionRange(nextCaret, nextCaret);
        });
      });
    }
  }

  handleBlur(): void {
    this.onTouched();
  }

  private caretAfterDigits(value: string, digitsToKeep: number): number {
    if (digitsToKeep === 0) {
      return 0;
    }

    let digitCount = 0;
    for (let index = 0; index < value.length; index += 1) {
      if (/\d/.test(value[index])) {
        digitCount += 1;
        if (digitCount === digitsToKeep) {
          return index + 1;
        }
      }
    }
    return value.length;
  }
}
