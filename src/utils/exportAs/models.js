import { Cardinality, Constraint } from "../../data/constants";
import i18n from "../../i18n/i18n";
import { getRelationshipFields } from "../utils";

// Shared helpers for the ORM model exporters (SQLAlchemy, Entity Framework).

export function words(name) {
  return String(name ?? "")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean);
}

function identifier(parts, fallback) {
  const result = parts.join("") || fallback;
  return /^[0-9]/.test(result) ? `_${result}` : result;
}

export function toPascalCase(name, fallback = "Item") {
  return identifier(
    words(name).map((w) => w[0].toUpperCase() + w.slice(1).toLowerCase()),
    fallback,
  );
}

export function toSnakeCase(name, fallback = "item") {
  return identifier(
    words(name).map((w, i) => (i ? "_" : "") + w.toLowerCase()),
    fallback,
  );
}

// Returns a function that hands out unique names, appending a number on
// collisions.
export function uniqueNamer(taken = []) {
  const used = new Set(taken);
  return (name) => {
    let candidate = name;
    for (let i = 2; used.has(candidate); i++) candidate = `${name}${i}`;
    used.add(candidate);
    return candidate;
  };
}

// Splits a size like "10,2" into precision and scale.
export function parseSize(size) {
  if (size === undefined || size === null || size === "") return [];
  return String(size)
    .split(",")
    .map((s) => s.trim())
    .filter((s) => /^\d+$/.test(s))
    .map(Number);
}

// type: SQLAlchemy type, py: Python annotation, cs: C# type, sized: takes a
// length, precision: takes precision/scale, text: unbounded text (C# keeps
// the column type), keepColumnType: C# keeps the database column type.
const typeMap = {
  INT: { sa: "Integer", py: "int", cs: "int" },
  INTEGER: { sa: "Integer", py: "int", cs: "int" },
  MEDIUMINT: { sa: "Integer", py: "int", cs: "int" },
  SERIAL: { sa: "Integer", py: "int", cs: "int" },
  BIGINT: { sa: "BigInteger", py: "int", cs: "long" },
  BIGSERIAL: { sa: "BigInteger", py: "int", cs: "long" },
  SMALLINT: { sa: "SmallInteger", py: "int", cs: "short" },
  SMALLSERIAL: { sa: "SmallInteger", py: "int", cs: "short" },
  TINYINT: { sa: "SmallInteger", py: "int", cs: "byte" },
  YEAR: { sa: "SmallInteger", py: "int", cs: "short", keepColumnType: true },
  DECIMAL: { sa: "Numeric", py: "Decimal", cs: "decimal", precision: true },
  NUMERIC: { sa: "Numeric", py: "Decimal", cs: "decimal", precision: true },
  NUMBER: { sa: "Numeric", py: "Decimal", cs: "decimal", precision: true },
  MONEY: { sa: "Numeric", py: "Decimal", cs: "decimal", keepColumnType: true },
  SMALLMONEY: {
    sa: "Numeric",
    py: "Decimal",
    cs: "decimal",
    keepColumnType: true,
  },
  FLOAT: { sa: "Float", py: "float", cs: "double" },
  REAL: { sa: "Float", py: "float", cs: "float" },
  DOUBLE: { sa: "Double", py: "float", cs: "double" },
  DOUBLEPRECISION: { sa: "Double", py: "float", cs: "double" },
  BOOLEAN: { sa: "Boolean", py: "bool", cs: "bool" },
  BOOL: { sa: "Boolean", py: "bool", cs: "bool" },
  BIT: { sa: "Boolean", py: "bool", cs: "bool" },
  CHAR: { sa: "CHAR", py: "str", cs: "string", sized: true, fixed: true },
  NCHAR: { sa: "CHAR", py: "str", cs: "string", sized: true, fixed: true },
  VARCHAR: { sa: "String", py: "str", cs: "string", sized: true },
  NVARCHAR: { sa: "String", py: "str", cs: "string", sized: true },
  VARCHAR2: { sa: "String", py: "str", cs: "string", sized: true },
  NVARCHAR2: { sa: "String", py: "str", cs: "string", sized: true },
  TEXT: { sa: "Text", py: "str", cs: "string", keepColumnType: true },
  TINYTEXT: { sa: "Text", py: "str", cs: "string", keepColumnType: true },
  MEDIUMTEXT: { sa: "Text", py: "str", cs: "string", keepColumnType: true },
  LONGTEXT: { sa: "Text", py: "str", cs: "string", keepColumnType: true },
  NTEXT: { sa: "Text", py: "str", cs: "string", keepColumnType: true },
  CLOB: { sa: "Text", py: "str", cs: "string", keepColumnType: true },
  NCLOB: { sa: "Text", py: "str", cs: "string", keepColumnType: true },
  LONG: { sa: "Text", py: "str", cs: "string", keepColumnType: true },
  XML: { sa: "Text", py: "str", cs: "string", keepColumnType: true },
  DATE: { sa: "Date", py: "date", cs: "DateOnly" },
  TIME: { sa: "Time", py: "time", cs: "TimeOnly" },
  TIMETZ: { sa: "Time", py: "time", cs: "TimeOnly", keepColumnType: true },
  DATETIME: { sa: "DateTime", py: "datetime", cs: "DateTime" },
  DATETIME2: { sa: "DateTime", py: "datetime", cs: "DateTime" },
  SMALLDATETIME: {
    sa: "DateTime",
    py: "datetime",
    cs: "DateTime",
    keepColumnType: true,
  },
  TIMESTAMP: { sa: "DateTime", py: "datetime", cs: "DateTime" },
  TIMESTAMPTZ: {
    sa: "DateTime(timezone=True)",
    py: "datetime",
    cs: "DateTimeOffset",
  },
  DATETIMEOFFSET: {
    sa: "DateTime(timezone=True)",
    py: "datetime",
    cs: "DateTimeOffset",
  },
  INTERVAL: { sa: "Interval", py: "timedelta", cs: "TimeSpan" },
  UUID: { sa: "Uuid", py: "uuid.UUID", cs: "Guid" },
  UNIQUEIDENTIFIER: { sa: "Uuid", py: "uuid.UUID", cs: "Guid" },
  JSON: { sa: "JSON", py: "dict", cs: "string", keepColumnType: true },
  JSONB: { sa: "JSON", py: "dict", cs: "string", keepColumnType: true },
  BLOB: { sa: "LargeBinary", py: "bytes", cs: "byte[]" },
  TINYBLOB: { sa: "LargeBinary", py: "bytes", cs: "byte[]" },
  MEDIUMBLOB: { sa: "LargeBinary", py: "bytes", cs: "byte[]" },
  LONGBLOB: { sa: "LargeBinary", py: "bytes", cs: "byte[]" },
  BYTEA: { sa: "LargeBinary", py: "bytes", cs: "byte[]" },
  BINARY: { sa: "LargeBinary", py: "bytes", cs: "byte[]", sized: true },
  VARBINARY: { sa: "LargeBinary", py: "bytes", cs: "byte[]", sized: true },
  IMAGE: { sa: "LargeBinary", py: "bytes", cs: "byte[]" },
  RAW: { sa: "LargeBinary", py: "bytes", cs: "byte[]", sized: true },
  BFILE: { sa: "LargeBinary", py: "bytes", cs: "byte[]" },
};

const fallbackType = {
  sa: "String",
  py: "str",
  cs: "string",
  keepColumnType: true,
};

export const valueTypesCs = new Set([
  "int",
  "long",
  "short",
  "byte",
  "decimal",
  "double",
  "float",
  "bool",
  "DateOnly",
  "TimeOnly",
  "DateTime",
  "DateTimeOffset",
  "TimeSpan",
  "Guid",
]);

// Resolves a field's type. Enum values come from the field itself (MySQL
// style ENUM/SET) or from a diagram-level enum with the type's name.
export function resolveType(field, enums = []) {
  const typeName = String(field.type ?? "").toUpperCase();
  const normalized = typeName.replace(/\s+/g, "");
  if (normalized === "ENUM" || normalized === "SET") {
    return { ...fallbackType, enumValues: field.values ?? [] };
  }
  const diagramEnum = enums.find(
    (e) => e.name?.toUpperCase() === typeName.trim(),
  );
  if (diagramEnum) {
    return {
      ...fallbackType,
      enumValues: diagramEnum.values ?? [],
      enumName: diagramEnum.name,
    };
  }
  return typeMap[normalized] ?? fallbackType;
}

export function isNullable(field) {
  return !field.notNull && !field.primary;
}

const constraintSql = {
  [Constraint.RESTRICT]: "RESTRICT",
  [Constraint.CASCADE]: "CASCADE",
  [Constraint.SET_NULL]: "SET NULL",
  [Constraint.SET_DEFAULT]: "SET DEFAULT",
};

// SQL action for an ON DELETE/ON UPDATE constraint, or null for the default
// (NO ACTION).
export function constraintAction(constraint) {
  return constraintSql[constraint] ?? null;
}

function isOneToOne(relationship) {
  return (
    relationship.cardinality === Cardinality.ONE_TO_ONE ||
    relationship.cardinality === i18n.t(Cardinality.ONE_TO_ONE)
  );
}

// Resolves relationships to tables and field objects. As in the SQL export,
// the foreign key columns are on the start table and reference the end table.
// Each entry gets language-neutral names for both navigation properties.
export function resolveRelationships(tables, relationships = []) {
  const resolved = relationships
    .map((relationship) => {
      const start = tables.find((t) => t.id === relationship.startTableId);
      const end = tables.find((t) => t.id === relationship.endTableId);
      if (!start || !end) return null;

      const pairs = getRelationshipFields(relationship);
      const startFields = pairs.map((p) =>
        start.fields.find((f) => f.id === p.startFieldId),
      );
      const endFields = pairs.map((p) =>
        end.fields.find((f) => f.id === p.endFieldId),
      );
      if (startFields.some((f) => !f) || endFields.some((f) => !f)) {
        return null;
      }

      return {
        relationship,
        start,
        end,
        startFields,
        endFields,
        oneToOne: isOneToOne(relationship),
        optional: startFields.some(isNullable),
      };
    })
    .filter(Boolean);

  const pairCount = {};
  const pairKey = (r) => [r.start.id, r.end.id].sort().join("\u0000");
  resolved.forEach((r) => {
    pairCount[pairKey(r)] = (pairCount[pairKey(r)] ?? 0) + 1;
  });

  return resolved.map((r) => {
    const ambiguous = r.start.id === r.end.id || pairCount[pairKey(r)] > 1;
    const fkWords = words(r.startFields[0].name);
    const toEndWords =
      r.startFields.length === 1 &&
      fkWords.length > 1 &&
      fkWords[fkWords.length - 1].toLowerCase() === "id"
        ? fkWords.slice(0, -1)
        : words(r.end.name);
    const toStartWords = ambiguous
      ? [...words(r.start.name), "by", ...toEndWords]
      : words(r.start.name);

    return {
      ...r,
      ambiguous,
      selfReference: r.start.id === r.end.id,
      toEndName: toEndWords.join(" "),
      toStartName: toStartWords.join(" "),
    };
  });
}

// Whether the referenced columns are exactly the end table's primary key.
export function referencesPrimaryKey(r) {
  const primary = r.end.fields.filter((f) => f.primary).map((f) => f.id);
  return (
    primary.length === r.endFields.length &&
    r.endFields.every((f) => primary.includes(f.id))
  );
}
