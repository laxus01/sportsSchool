const UPPERCASE_TEXT_COLUMNS: Readonly<Record<string, ReadonlySet<string>>> = {
  escuela: new Set([
    'nombre',
    'identificacion_fiscal',
    'nombre_representante',
    'telefono',
    'correo',
    'direccion',
  ]),
  categorias: new Set(['nombre', 'descripcion']),
  deportistas: new Set([
    'nombres',
    'apellidos',
    'tipo_documento',
    'numero_documento',
  ]),
  acudientes: new Set([
    'nombres',
    'apellidos',
    'tipo_documento',
    'numero_documento',
    'telefono',
    'correo',
    'direccion',
  ]),
  deportista_acudiente: new Set(['parentesco']),
  entidades_transferencia: new Set(['nombre']),
  pagos: new Set(['referencia', 'observacion', 'motivo_anulacion']),
  gastos: new Set(['descripcion']),
  cargos_adicionales: new Set(['descripcion']),
  entidades_salud: new Set(['nombre']),
  auditoria_financiera: new Set(['motivo']),
};

export function normalizeSqlTextValues(
  statement: string,
  values: unknown,
): unknown {
  if (!Array.isArray(values)) {
    return values;
  }

  const target = getTargetTable(statement);
  if (!target) {
    return values;
  }

  const textColumns = UPPERCASE_TEXT_COLUMNS[target.table];
  if (!textColumns?.size) {
    return values;
  }

  const parameterIndexes =
    target.operation === 'insert'
      ? getInsertParameterIndexes(statement, textColumns)
      : getUpdateParameterIndexes(statement, textColumns);
  if (parameterIndexes.size === 0) {
    return values;
  }

  const normalizedValues = [...values];
  for (const index of parameterIndexes) {
    const value = normalizedValues[index];
    if (typeof value === 'string') {
      normalizedValues[index] = value.toLocaleUpperCase('es');
    }
  }
  return normalizedValues;
}

function getTargetTable(
  statement: string,
): { operation: 'insert' | 'update'; table: string } | null {
  const insert =
    /^\s*INSERT(?:\s+OR\s+\w+)?\s+INTO\s+([^\s(]+)/i.exec(statement);
  if (insert) {
    return {
      operation: 'insert',
      table: normalizeIdentifier(insert[1].split('.').at(-1) ?? ''),
    };
  }

  const update = /^\s*UPDATE\s+([^\s(]+)/i.exec(statement);
  if (update) {
    return {
      operation: 'update',
      table: normalizeIdentifier(update[1].split('.').at(-1) ?? ''),
    };
  }

  return null;
}

function getInsertParameterIndexes(
  statement: string,
  textColumns: ReadonlySet<string>,
): Set<number> {
  const tableMatch =
    /^\s*INSERT(?:\s+OR\s+\w+)?\s+INTO\s+[^\s(]+/i.exec(statement);
  if (!tableMatch) {
    return new Set();
  }

  const columnsOpen = statement.indexOf('(', tableMatch[0].length);
  if (columnsOpen === -1) {
    return new Set();
  }
  const columnsClose = findClosingParenthesis(statement, columnsOpen);
  if (columnsClose === -1) {
    return new Set();
  }

  const valuesKeyword = /\bVALUES\s*\(/i.exec(statement.slice(columnsClose + 1));
  if (!valuesKeyword) {
    return new Set();
  }
  const valuesOpen =
    columnsClose + 1 + valuesKeyword.index + valuesKeyword[0].lastIndexOf('(');
  const valuesClose = findClosingParenthesis(statement, valuesOpen);
  if (valuesClose === -1) {
    return new Set();
  }

  const columns = splitTopLevel(statement.slice(columnsOpen + 1, columnsClose))
    .map(normalizeIdentifier);
  const expressions = splitTopLevel(
    statement.slice(valuesOpen + 1, valuesClose),
  );
  const parameterIndexes = new Set<number>();
  let parameterIndex = 0;

  for (let index = 0; index < Math.min(columns.length, expressions.length); index += 1) {
    const expressionParameterCount = countParameters(expressions[index]);
    if (textColumns.has(columns[index])) {
      for (
        let offset = 0;
        offset < expressionParameterCount;
        offset += 1
      ) {
        parameterIndexes.add(parameterIndex + offset);
      }
    }
    parameterIndex += expressionParameterCount;
  }

  return parameterIndexes;
}

function getUpdateParameterIndexes(
  statement: string,
  textColumns: ReadonlySet<string>,
): Set<number> {
  const setMatch = /\bSET\b/i.exec(statement);
  if (!setMatch) {
    return new Set();
  }

  const assignmentsStart = setMatch.index + setMatch[0].length;
  const tail = statement.slice(assignmentsStart);
  const assignmentsEndMatch = /\bWHERE\b|\bRETURNING\b/i.exec(tail);
  const assignments = splitTopLevel(
    assignmentsEndMatch ? tail.slice(0, assignmentsEndMatch.index) : tail,
  );
  const parameterIndexes = new Set<number>();
  let parameterIndex = countParameters(statement.slice(0, assignmentsStart));

  for (const assignment of assignments) {
    const equalsIndex = assignment.indexOf('=');
    if (equalsIndex === -1) {
      continue;
    }
    const column = normalizeIdentifier(assignment.slice(0, equalsIndex));
    const expression = assignment.slice(equalsIndex + 1);
    const expressionParameterCount = countParameters(expression);
    if (textColumns.has(column)) {
      for (
        let offset = 0;
        offset < expressionParameterCount;
        offset += 1
      ) {
        parameterIndexes.add(parameterIndex + offset);
      }
    }
    parameterIndex += expressionParameterCount;
  }

  return parameterIndexes;
}

function splitTopLevel(value: string): string[] {
  const parts: string[] = [];
  let start = 0;
  let depth = 0;
  let quote: string | null = null;

  for (let index = 0; index < value.length; index += 1) {
    const character = value[index];
    if (quote) {
      if (character === quote) {
        if (value[index + 1] === quote && quote !== ']') {
          index += 1;
        } else {
          quote = null;
        }
      } else if (quote === ']' && character === ']') {
        quote = null;
      }
      continue;
    }

    if (character === "'" || character === '"' || character === '`') {
      quote = character;
    } else if (character === '[') {
      quote = ']';
    } else if (character === '(') {
      depth += 1;
    } else if (character === ')') {
      depth -= 1;
    } else if (character === ',' && depth === 0) {
      parts.push(value.slice(start, index).trim());
      start = index + 1;
    }
  }

  parts.push(value.slice(start).trim());
  return parts;
}

function findClosingParenthesis(value: string, openIndex: number): number {
  let depth = 0;
  let quote: string | null = null;

  for (let index = openIndex; index < value.length; index += 1) {
    const character = value[index];
    if (quote) {
      if (character === quote) {
        if (value[index + 1] === quote && quote !== ']') {
          index += 1;
        } else {
          quote = null;
        }
      } else if (quote === ']' && character === ']') {
        quote = null;
      }
      continue;
    }

    if (character === "'" || character === '"' || character === '`') {
      quote = character;
    } else if (character === '[') {
      quote = ']';
    } else if (character === '(') {
      depth += 1;
    } else if (character === ')' && --depth === 0) {
      return index;
    }
  }

  return -1;
}

function normalizeIdentifier(value: string): string {
  return value
    .trim()
    .replace(/^["'`\[]|["'`\]]$/g, '')
    .toLowerCase();
}

function countParameters(value: string): number {
  return (value.match(/\?/g) ?? []).length;
}
