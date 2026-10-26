import { parseDefault } from "../exportSQL/shared";
import {
  constraintAction,
  isNullable,
  parseSize,
  resolveRelationships,
  resolveType,
  toPascalCase,
  toSnakeCase,
  uniqueNamer,
} from "./models";

const pythonKeywords = new Set([
  "False",
  "None",
  "True",
  "and",
  "as",
  "assert",
  "async",
  "await",
  "break",
  "class",
  "continue",
  "def",
  "del",
  "elif",
  "else",
  "except",
  "finally",
  "for",
  "from",
  "global",
  "if",
  "import",
  "in",
  "is",
  "lambda",
  "nonlocal",
  "not",
  "or",
  "pass",
  "raise",
  "return",
  "try",
  "while",
  "with",
  "yield",
  // Names that would shadow the declarative class machinery.
  "metadata",
  "registry",
]);

const str = (value) => JSON.stringify(String(value));

function attributeName(name) {
  const snake = toSnakeCase(name, "column");
  return pythonKeywords.has(snake) ? `${snake}_` : snake;
}

const datetimeTypes = new Set(["date", "time", "datetime", "timedelta"]);

export function jsonToSQLAlchemy(diagram) {
  const database = diagram.database;
  const enums = diagram.enums ?? [];
  const tables = (diagram.tables ?? []).filter((t) => t.fields?.length);

  const sqlalchemyImports = new Set();
  const ormImports = new Set(["DeclarativeBase", "Mapped", "mapped_column"]);
  const typingImports = new Set();
  const datetimeImports = new Set();
  const otherImports = new Set();

  const nameClass = uniqueNamer(["Base"]);
  const classNames = new Map(
    tables.map((t) => [t.id, nameClass(toPascalCase(t.name, "Table"))]),
  );

  // Attribute names per table: columns first, then relationships.
  const namers = new Map();
  const columnNames = new Map();
  tables.forEach((t) => {
    const namer = uniqueNamer();
    namers.set(t.id, namer);
    t.fields.forEach((f) => columnNames.set(f, namer(attributeName(f.name))));
  });

  const relationships = resolveRelationships(tables, diagram.relationships).map(
    (r) => ({
      ...r,
      toEndAttr: namers.get(r.start.id)(attributeName(r.toEndName)),
      toStartAttr: namers.get(r.end.id)(attributeName(r.toStartName)),
    }),
  );

  function typeExpression(field, table) {
    const type = resolveType(field, enums);
    let expression = type.sa;
    let pyType = type.py;

    if (type.enumValues?.length) {
      sqlalchemyImports.add("Enum");
      const name = type.enumName ?? `${table.name}_${field.name}`;
      expression = `Enum(${[...type.enumValues.map(str), `name=${str(name)}`].join(", ")})`;
    } else {
      sqlalchemyImports.add(expression.replace(/\(.*$/, ""));
      const size = parseSize(field.size);
      if ((type.sized || type.precision) && size.length) {
        expression = `${expression}(${size.join(", ")})`;
      }
    }

    if (datetimeTypes.has(pyType)) datetimeImports.add(pyType);
    if (pyType === "Decimal") otherImports.add("Decimal");
    if (pyType === "uuid.UUID") otherImports.add("uuid");
    if (field.isArray) {
      sqlalchemyImports.add("ARRAY");
      typingImports.add("List");
      expression = `ARRAY(${expression})`;
      pyType = `List[${pyType}]`;
    }
    if (isNullable(field)) {
      typingImports.add("Optional");
      pyType = `Optional[${pyType}]`;
    }
    return { expression, pyType };
  }

  function foreignKeyOptions(relationship) {
    const options = [];
    const onDelete = constraintAction(relationship.deleteConstraint);
    const onUpdate = constraintAction(relationship.updateConstraint);
    if (onDelete) options.push(`ondelete=${str(onDelete)}`);
    if (onUpdate) options.push(`onupdate=${str(onUpdate)}`);
    if (relationship.name) options.push(`name=${str(relationship.name)}`);
    return options;
  }

  function columnLine(field, table) {
    const name = columnNames.get(field);
    const { expression, pyType } = typeExpression(field, table);
    const args = [];

    if (name !== field.name) args.push(str(field.name));
    args.push(expression);

    relationships
      .filter((r) => r.start === table && r.startFields.length === 1)
      .filter((r) => r.startFields[0] === field)
      .forEach((r) => {
        sqlalchemyImports.add("ForeignKey");
        const target = str(`${r.end.name}.${r.endFields[0].name}`);
        args.push(
          `ForeignKey(${[target, ...foreignKeyOptions(r.relationship)].join(", ")})`,
        );
      });

    const primaryKeys = table.fields.filter((f) => f.primary);
    if (field.primary) args.push("primary_key=True");
    if (field.increment) {
      args.push("autoincrement=True");
    } else if (
      field.primary &&
      primaryKeys.length === 1 &&
      /Integer/.test(expression)
    ) {
      args.push("autoincrement=False");
    }
    if (field.unique && !field.primary) args.push("unique=True");

    const hasDefault =
      field.default !== undefined &&
      field.default !== null &&
      String(field.default).trim() !== "";
    if (hasDefault) {
      sqlalchemyImports.add("text");
      args.push(`server_default=text(${str(parseDefault(field, database))})`);
    }
    if (field.comment?.trim()) args.push(`comment=${str(field.comment)}`);

    return `    ${name}: Mapped[${pyType}] = mapped_column(${args.join(", ")})`;
  }

  function relationshipLines(table) {
    const lines = [];
    const columnRefs = (fields, prefix = "") =>
      `[${fields.map((f) => prefix + columnNames.get(f)).join(", ")}]`;

    relationships
      .filter((r) => r.start === table)
      .forEach((r) => {
        ormImports.add("relationship");
        const target = classNames.get(r.end.id);
        let annotation = str(target);
        if (r.optional) {
          typingImports.add("Optional");
          annotation = `Optional[${annotation}]`;
        }
        const args = [`back_populates=${str(r.toStartAttr)}`];
        if (r.ambiguous) args.push(`foreign_keys=${columnRefs(r.startFields)}`);
        if (r.selfReference) {
          args.push(`remote_side=${columnRefs(r.endFields)}`);
        }
        lines.push(
          `    ${r.toEndAttr}: Mapped[${annotation}] = relationship(${args.join(", ")})`,
        );
      });

    relationships
      .filter((r) => r.end === table)
      .forEach((r) => {
        ormImports.add("relationship");
        const source = classNames.get(r.start.id);
        let annotation;
        if (r.oneToOne) {
          typingImports.add("Optional");
          annotation = `Optional[${str(source)}]`;
        } else {
          typingImports.add("List");
          annotation = `List[${str(source)}]`;
        }
        const args = [`back_populates=${str(r.toEndAttr)}`];
        if (r.ambiguous) {
          const refs = r.selfReference
            ? columnRefs(r.startFields)
            : str(columnRefs(r.startFields, `${source}.`));
          args.push(`foreign_keys=${refs}`);
        }
        lines.push(
          `    ${r.toStartAttr}: Mapped[${annotation}] = relationship(${args.join(", ")})`,
        );
      });

    return lines;
  }

  function tableArgs(table) {
    const args = [];

    relationships
      .filter((r) => r.start === table && r.startFields.length > 1)
      .forEach((r) => {
        sqlalchemyImports.add("ForeignKeyConstraint");
        const local = `[${r.startFields.map((f) => str(f.name)).join(", ")}]`;
        const remote = `[${r.endFields.map((f) => str(`${r.end.name}.${f.name}`)).join(", ")}]`;
        args.push(
          `ForeignKeyConstraint(${[local, remote, ...foreignKeyOptions(r.relationship)].join(", ")})`,
        );
      });

    (table.uniqueConstraints ?? []).forEach((constraint) => {
      sqlalchemyImports.add("UniqueConstraint");
      args.push(
        `UniqueConstraint(${[...constraint.fields.map(str), `name=${str(constraint.name)}`].join(", ")})`,
      );
    });

    (table.indices ?? []).forEach((index) => {
      sqlalchemyImports.add("Index");
      const indexArgs = [str(index.name), ...index.fields.map(str)];
      if (index.unique) indexArgs.push("unique=True");
      args.push(`Index(${indexArgs.join(", ")})`);
    });

    if (table.comment?.trim()) args.push(`{"comment": ${str(table.comment)}}`);

    if (!args.length) return [];
    if (args.length === 1 && args[0].startsWith("{")) {
      return [`    __table_args__ = ${args[0]}`];
    }
    return [
      "    __table_args__ = (",
      ...args.map((a) => `        ${a},`),
      "    )",
    ];
  }

  const classes = tables.map((table) => {
    const columns = table.fields.map((f) => columnLine(f, table));
    const navigation = relationshipLines(table);
    const lines = [
      `class ${classNames.get(table.id)}(Base):`,
      `    __tablename__ = ${str(table.name)}`,
      ...tableArgs(table),
    ];
    if (!table.fields.some((f) => f.primary)) {
      lines.push(
        "    # TODO: SQLAlchemy's ORM requires a primary key; this table has none.",
      );
    }
    lines.push("", ...columns);
    if (navigation.length) lines.push("", ...navigation);
    return lines.join("\n");
  });

  const stdlib = [
    ...(otherImports.has("uuid") ? ["import uuid"] : []),
    ...(datetimeImports.size
      ? [`from datetime import ${[...datetimeImports].sort().join(", ")}`]
      : []),
    ...(otherImports.has("Decimal") ? ["from decimal import Decimal"] : []),
    ...(typingImports.size
      ? [`from typing import ${[...typingImports].sort().join(", ")}`]
      : []),
  ];

  const header = [
    ...(stdlib.length ? [...stdlib, ""] : []),
    ...(sqlalchemyImports.size
      ? [`from sqlalchemy import ${[...sqlalchemyImports].sort().join(", ")}`]
      : []),
    `from sqlalchemy.orm import ${[...ormImports].sort().join(", ")}`,
  ];

  return (
    [
      header.join("\n"),
      "class Base(DeclarativeBase):\n    pass",
      ...classes,
    ].join("\n\n\n") + "\n"
  );
}
