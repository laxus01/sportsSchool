import { describe, expect, it, vi } from 'vitest';

import { DateInputComponent } from './date-input.component';

describe('DateInputComponent', () => {
  it('leaves the Ionic datetime value unset until a date is selected', () => {
    const component = new DateInputComponent();

    expect(component.datePickerValue).toBeUndefined();
  });

  it('keeps the selected date as an ISO date string', () => {
    const component = new DateInputComponent();
    const onChange = vi.fn();
    component.registerOnChange(onChange);

    component.handleDateChange({
      detail: { value: '2026-11-05T00:00:00' },
    } as CustomEvent<{ value?: string | string[] | null }>);

    expect(component.selectedDate()).toBe('2026-11-05');
    expect(onChange).toHaveBeenCalledWith('2026-11-05');
  });

  it('rejects dates outside the configured range', () => {
    const component = new DateInputComponent();
    const onChange = vi.fn();
    component.max = '2026-11-05';
    component.registerOnChange(onChange);

    component.handleDateChange({
      detail: { value: '2026-11-06' },
    } as CustomEvent<{ value?: string | string[] | null }>);

    expect(component.selectedDate()).toBe('');
    expect(onChange).not.toHaveBeenCalled();
  });
});
