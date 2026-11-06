import { Component, inject } from '@angular/core';
import { DatabaseService } from './database/database.service';

@Component({
  selector: 'app-root',
  templateUrl: 'app.component.html',
  styleUrls: ['app.component.scss'],
  standalone: false,
})
export class AppComponent {
  private readonly database = inject(DatabaseService);

  constructor() {
    void this.database.initialize().catch((error: unknown) => {
      console.error('No se pudo inicializar la base de datos local.', error);
    });
  }
}
