import {
  Directive,
  ElementRef,
  HostBinding,
  HostListener,
  inject,
} from '@angular/core';
import { NgControl } from '@angular/forms';

interface UppercaseInputElement extends HTMLElement {
  value: string;
}

@Directive({
  selector: 'ion-input[appUppercase], ion-textarea[appUppercase]',
  standalone: false,
})
export class UppercaseInputDirective {
  private readonly host = inject(ElementRef<UppercaseInputElement>);
  private readonly ngControl = inject(NgControl, { optional: true });

  @HostBinding('class.uppercase-text')
  readonly uppercaseTextClass = true;

  @HostBinding('attr.autocapitalize')
  readonly autocapitalize = 'characters';

  @HostListener('ionInput', ['$event'])
  onInput(event: Event): void {
    const value = (
      event as CustomEvent<{ value?: string | null }>
    ).detail?.value;
    if (typeof value !== 'string') {
      return;
    }

    const uppercaseValue = value.toLocaleUpperCase('es');
    if (uppercaseValue === value) {
      return;
    }

    queueMicrotask(() => {
      const element = this.host.nativeElement;
      const nativeInput = element.shadowRoot?.querySelector(
        'input, textarea',
      ) as HTMLInputElement | HTMLTextAreaElement | null;
      const cursorPosition = nativeInput?.selectionStart ?? null;

      if (this.ngControl?.control?.value !== uppercaseValue) {
        this.ngControl?.control?.setValue(uppercaseValue);
      }
      if (element.value !== uppercaseValue) {
        element.value = uppercaseValue;
      }

      if (nativeInput) {
        nativeInput.value = uppercaseValue;
        if (cursorPosition !== null) {
          nativeInput.setSelectionRange(cursorPosition, cursorPosition);
        }
      }
    });
  }
}
