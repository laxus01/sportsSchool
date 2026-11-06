import { Component, DestroyRef, inject, OnInit, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';

import {
  MANAGEMENT_SECTIONS,
  ManagementSection,
} from './management-sections';

@Component({
  selector: 'app-management',
  templateUrl: './management.page.html',
  styleUrls: ['./management.page.scss'],
  standalone: false,
})
export class ManagementPage implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  readonly section = signal<ManagementSection | null>(null);

  ngOnInit(): void {
    this.route.paramMap
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((params) => {
        const section = MANAGEMENT_SECTIONS.find(
          (item) => item.id === params.get('section'),
        );

        if (!section) {
          void this.router.navigateByUrl('/home', { replaceUrl: true });
          return;
        }

        this.section.set(section);
      });
  }
}
