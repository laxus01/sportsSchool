import { Injectable } from '@angular/core';

import { DatabaseService } from '../../database/database.service';

export interface AthleteBalance {
  deportista_id: string;
  nombre: string;
  categoria: string;
  saldo_pendiente: number;
}

export interface AthleteFinancialObligation {
  id: string;
  tipo: 'mensualidad' | 'inscripcion';
  periodo: string | null;
  fecha_vencimiento: string | null;
  monto_pesos: number;
  pagado_pesos: number;
  pendiente_pesos: number;
  orden: string;
}

export interface FinancialSummary {
  collectedThisMonth: number;
  totalPending: number;
  athletesWithBalance: number;
  athleteBalances: AthleteBalance[];
}

type DatabaseConnection = Awaited<ReturnType<DatabaseService['getConnection']>>;

@Injectable({ providedIn: 'root' })
export class FinancialSummaryService {
  async loadAthleteObligations(
    database: DatabaseConnection,
    athleteId: string,
  ): Promise<AthleteFinancialObligation[]> {
    const result = await database.query(
      `SELECT
         id,
         tipo,
         periodo,
         fecha_vencimiento,
         monto_pesos,
         pagado_pesos,
         monto_pesos - pagado_pesos AS pendiente_pesos,
         COALESCE(fecha_vencimiento, periodo) AS orden
       FROM (
         SELECT
           m.id,
           'mensualidad' AS tipo,
           m.periodo,
           m.fecha_vencimiento,
           m.monto_pesos,
           COALESCE((
             SELECT SUM(pm.monto_aplicado_pesos)
             FROM pago_mensualidad pm
             JOIN pagos p ON p.id = pm.pago_id
             WHERE pm.mensualidad_id = m.id
               AND p.estado = 'registrado'
           ), 0) AS pagado_pesos
         FROM mensualidades m
         WHERE m.deportista_id = ? AND m.estado = 'activa'
         UNION ALL
         SELECT
           i.id,
           'inscripcion' AS tipo,
           NULL AS periodo,
           i.fecha_inscripcion AS fecha_vencimiento,
           i.monto_pesos,
           COALESCE((
             SELECT SUM(pi.monto_aplicado_pesos)
             FROM pago_inscripcion pi
             JOIN pagos p ON p.id = pi.pago_id
             WHERE pi.inscripcion_id = i.id
               AND p.estado = 'registrado'
           ), 0) AS pagado_pesos
         FROM inscripciones i
         WHERE i.deportista_id = ? AND i.estado = 'activa'
       )
       WHERE monto_pesos > pagado_pesos
       ORDER BY orden, tipo`,
      [athleteId, athleteId],
    );

    return (result.values ?? []).map((row) => {
      const obligation = row as AthleteFinancialObligation;
      const amount = Number(obligation.monto_pesos);
      const paid = Number(obligation.pagado_pesos);
      return {
        ...obligation,
        monto_pesos: amount,
        pagado_pesos: paid,
        pendiente_pesos: amount - paid,
        orden: String(obligation.orden),
      };
    });
  }

  async loadSummary(
    database: DatabaseConnection,
    today: string,
  ): Promise<FinancialSummary> {
    const [collectedResult, balancesResult] = await Promise.all([
      database.query(
        `SELECT COALESCE(SUM(monto_pesos), 0) AS total
         FROM pagos
         WHERE estado = 'registrado'
           AND fecha_pago >= ?
           AND fecha_pago <= ?`,
        [`${today.slice(0, 7)}-01`, today],
      ),
      database.query(
        `SELECT *
         FROM (
           SELECT
             d.id AS deportista_id,
             d.nombres || ' ' || d.apellidos AS nombre,
             c.nombre AS categoria,
             COALESCE((
               SELECT SUM(MAX(m.monto_pesos - COALESCE((
                 SELECT SUM(pm.monto_aplicado_pesos)
                 FROM pago_mensualidad pm
                 JOIN pagos p ON p.id = pm.pago_id
                 WHERE pm.mensualidad_id = m.id
                   AND p.estado = 'registrado'
               ), 0), 0))
               FROM mensualidades m
               WHERE m.deportista_id = d.id AND m.estado = 'activa'
             ), 0)
             + COALESCE((
               SELECT SUM(MAX(i.monto_pesos - COALESCE((
                 SELECT SUM(pi.monto_aplicado_pesos)
                 FROM pago_inscripcion pi
                 JOIN pagos p ON p.id = pi.pago_id
                 WHERE pi.inscripcion_id = i.id
                   AND p.estado = 'registrado'
               ), 0), 0))
               FROM inscripciones i
               WHERE i.deportista_id = d.id AND i.estado = 'activa'
             ), 0) AS saldo_pendiente
           FROM deportistas d
           LEFT JOIN deportista_categoria_historial h
             ON h.deportista_id = d.id
            AND h.vigente_desde <= ?
            AND (h.vigente_hasta IS NULL OR h.vigente_hasta >= ?)
           LEFT JOIN categorias c
             ON c.id = COALESCE(h.categoria_id, d.categoria_id)
         )
         WHERE saldo_pendiente > 0
         ORDER BY nombre COLLATE NOCASE`,
        [today, today],
      ),
    ]);

    const athleteBalances = (balancesResult.values ?? []).map((row) => {
      const balance = row as AthleteBalance;
      return {
        ...balance,
        saldo_pendiente: Number(balance.saldo_pendiente ?? 0),
      };
    });

    return {
      collectedThisMonth: Number(
        (collectedResult.values?.[0] as { total?: number } | undefined)?.total ??
          0,
      ),
      totalPending: athleteBalances.reduce(
        (total, athlete) => total + athlete.saldo_pendiente,
        0,
      ),
      athletesWithBalance: athleteBalances.length,
      athleteBalances,
    };
  }
}
