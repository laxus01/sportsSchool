import { describe, expect, it, vi } from 'vitest';

import { MoneyInputComponent } from './money-input.component';

describe('MoneyInputComponent', () => {
  it('formats thousands for display but keeps raw digits in the form value', () => {
    const component = new MoneyInputComponent();
    const onChange = vi.fn();
    component.registerOnChange(onChange);

    component.handleInput({
      detail: { value: '1000' },
      target: null,
    } as unknown as CustomEvent<{ value?: string | number | null }>);

    expect(component.displayValue()).toBe('1.000');
    expect(onChange).toHaveBeenCalledWith('1000');
  });

  it('formats millions and removes leading zeroes', () => {
    const component = new MoneyInputComponent();

    component.writeValue('0001000000');

    expect(component.displayValue()).toBe('1.000.000');
  });
});
