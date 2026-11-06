import { Component, forwardRef, Input, signal } from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';

@Component({
  selector: 'app-date-input',
  templateUrl: './date-input.component.html',
  styleUrls: ['./date-input.component.scss'],
  standalone: false,
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => DateInputComponent),
      multi: true,
    },
  ],
})
export class DateInputComponent implements ControlValueAccessor {
  private static nextId = 0;

  @Input() label = '';
  @Input() helperText = '';
  @Input() errorText = '';
  @Input() min?: string;
  @Input() max?: string;
  @Input() invalid = false;

  readonly pickerId = `app-date-picker-${DateInputComponent.nextId++}`;
  readonly selectedDate = signal('');
  readonly disabled = signal(false);

  get datePickerValue(): string | undefined {
    return this.selectedDate() || undefined;
  }

  private onChange: (value: string) => void = () => undefined;
  private onTouched: () => void = () => undefined;

  writeValue(value: unknown): void {
    this.selectedDate.set(String(value ?? '').slice(0, 10));
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

  handleDateChange(
    event: CustomEvent<{ value?: string | string[] | null }>,
  ): void {
    const value = event.detail.value;
    if (typeof value !== 'string' || !value) {
      return;
    }

    const date = value.slice(0, 10);
    if ((this.min && date < this.min) || (this.max && date > this.max)) {
      return;
    }

    this.selectedDate.set(date);
    this.onChange(date);
    this.onTouched();
  }

  handleDismiss(): void {
    this.onTouched();
  }
}
