import { Constraint } from "../../data/constants";
import { parseDefault } from "../exportSQL/shared";
import {
  isNullable,
  parseSize,
  referencesPrimaryKey,
  resolveRelationships,
  resolveType,
  toPascalCase,
  uniqueNamer,
  valueTypesCs,
} from "./models";

const str = (value) => JSON.stringify(String(value));

// DbContext members a DbSet property must not hide.
const dbContextMembers = ["ChangeTracker", "ContextId", "Database", "Model"];

const deleteBehavior = {
  [Constraint.CASCADE]: "Cascade",
  [Constraint.SET_NULL]: "SetNull",
  [Constraint.RESTRICT]: "Restrict",
  [Constraint.NONE]: "NoAction",
  [Constraint.SET_DEFAULT]: "NoAction",
};

function lambda(parameter, properties) {
  if (properties.length === 1)
    return `${parameter} => ${parameter}.${properties[0]}`;
  return `${parameter} => new { ${properties.map((p) => `${parameter}.${p}`).join(", ")} }`;
}

export function jsonToEntityFramework(diagram) {
  const database = diagram.database;
  const enums = diagram.enums ?? [];
  const tables = (diagram.tables ?? []).filter((t) => t.fields?.length);

  const namespace = toPascalCase(diagram.title, "Models");
  const contextName = `${namespace}Context`;

  const nameClass = uniqueNamer([contextName]);
  const classNames = new Map(
    tables.map((t) => [t.id, nameClass(toPascalCase(t.name, "Table"))]),
  );

  // Property names per table (a member can't share its class's name).
  const namers = new Map();
  const propertyNames = new Map();
  tables.forEach((t) => {
    const namer = uniqueNamer([classNames.get(t.id)]);
    namers.set(t.id, namer);
    t.fields.forEach((f) =>
      propertyNames.set(f, namer(toPascalCase(f.name, "Column"))),
    );
  });
  const propertyByColumn = (table, columnName) => {
    const field = table.fields.find((f) => f.name === columnName);
    return field ? propertyNames.get(field) : toPascalCase(columnName);
  };

  const relationships = resolveRelationships(tables, diagram.relationships).map(
    (r) => ({
      ...r,
      toEndProperty: namers.get(r.start.id)(toPascalCase(r.toEndName)),
      toStartProperty: namers.get(r.end.id)(toPascalCase(r.toStartName)),
    }),
  );

  function clrType(field) {
    const type = resolveType(field, enums);
    let cs = type.cs;
    if (field.isArray) cs = `List<${cs}>`;
    return { type, cs };
  }

  function entityClass(table) {
    const className = classNames.get(table.id);
    const lines = [];

    if (table.comment?.trim()) {
      lines.push(
        "/// <summary>",
        `/// ${table.comment.trim().replace(/\n/g, "\n/// ")}`,
        "/// </summary>",
      );
    }
    lines.push(`public class ${className}`, "{");

    table.fields.forEach((field) => {
      const { cs } = clrType(field);
      const nullable = isNullable(field);
      const isValue = valueTypesCs.has(cs);
      const suffix = nullable ? "?" : "";
      const initializer = !nullable && !isValue ? " = null!;" : "";
      if (field.comment?.trim()) {
        lines.push(
          `    /// <summary>${field.comment.trim().replace(/\n/g, " ")}</summary>`,
        );
      }
      lines.push(
        `    public ${cs}${suffix} ${propertyNames.get(field)} { get; set; }${initializer}`,
      );
    });

    const navigation = [];
    relationships
      .filter((r) => r.start === table)
      .forEach((r) => {
        const target = classNames.get(r.end.id);
        navigation.push(
          r.optional
            ? `    public virtual ${target}? ${r.toEndProperty} { get; set; }`
            : `    public virtual ${target} ${r.toEndProperty} { get; set; } = null!;`,
        );
      });
    relationships
      .filter((r) => r.end === table)
      .forEach((r) => {
        const source = classNames.get(r.start.id);
        navigation.push(
          r.oneToOne
            ? `    public virtual ${source}? ${r.toStartProperty} { get; set; }`
            : `    public virtual ICollection<${source}> ${r.toStartProperty} { get; set; } = new List<${source}>();`,
        );
      });

    if (navigation.length) lines.push("", ...navigation);
    lines.push("}");
    return lines.join("\n");
  }

  function propertyConfiguration(field, table) {
    const property = propertyNames.get(field);
    const { type } = clrType(field);
    const calls = [];

    if (property !== field.name)
      calls.push(`HasColumnName(${str(field.name)})`);

    const size = parseSize(field.size);
    if (type.enumValues && !type.enumName) {
      const values = type.enumValues.map((v) => `'${v.replace(/'/g, "''")}'`);
      calls.push(
        `HasColumnType(${str(`${field.type.toLowerCase()}(${values.join(",")})`)})`,
      );
    } else if (type.keepColumnType || type.enumValues) {
      calls.push(`HasColumnType(${str(field.type)})`);
    } else if (type.sized && size.length) {
      calls.push(`HasMaxLength(${size[0]})`);
      if (type.fixed) calls.push("IsFixedLength()");
    } else if (type.precision && size.length) {
      calls.push(`HasPrecision(${size.join(", ")})`);
    }

    const primaryKeys = table.fields.filter((f) => f.primary);
    if (field.increment) {
      calls.push("ValueGeneratedOnAdd()");
    } else if (
      field.primary &&
      primaryKeys.length === 1 &&
      ["int", "long", "short", "byte"].includes(type.cs)
    ) {
      calls.push("ValueGeneratedNever()");
    }

    const hasDefault =
      field.default !== undefined &&
      field.default !== null &&
      String(field.default).trim() !== "";
    if (hasDefault) {
      calls.push(`HasDefaultValueSql(${str(parseDefault(field, database))})`);
    }
    if (field.comment?.trim()) calls.push(`HasComment(${str(field.comment)})`);

    if (!calls.length) return [];
    if (calls.length === 1) {
      return [`            entity.Property(e => e.${property}).${calls[0]};`];
    }
    return [
      `            entity.Property(e => e.${property})`,
      ...calls.map(
        (c, i) => `                .${c}${i === calls.length - 1 ? ";" : ""}`,
      ),
    ];
  }

  function relationshipConfiguration(r) {
    const source = classNames.get(r.start.id);
    const target = classNames.get(r.end.id);
    const foreignKey = lambda(
      "d",
      r.startFields.map((f) => propertyNames.get(f)),
    );
    const calls = [`HasOne(d => d.${r.toEndProperty})`];

    if (r.oneToOne) {
      calls.push(`WithOne(p => p.${r.toStartProperty})`);
      calls.push(`HasForeignKey<${source}>(${foreignKey})`);
    } else {
      calls.push(`WithMany(p => p.${r.toStartProperty})`);
      calls.push(`HasForeignKey(${foreignKey})`);
    }
    if (!referencesPrimaryKey(r)) {
      const principal = lambda(
        "p",
        r.endFields.map((f) => propertyNames.get(f)),
      );
      calls.push(
        r.oneToOne
          ? `HasPrincipalKey<${target}>(${principal})`
          : `HasPrincipalKey(${principal})`,
      );
    }

    const onDelete = deleteBehavior[r.relationship.deleteConstraint];
    if (onDelete) calls.push(`OnDelete(DeleteBehavior.${onDelete})`);
    if (r.relationship.name) {
      calls.push(`HasConstraintName(${str(r.relationship.name)})`);
    }

    const lines = [`            entity.${calls[0]}`];
    calls.slice(1).forEach((c, i) => {
      lines.push(`                .${c}${i === calls.length - 2 ? ";" : ""}`);
    });
    if (r.relationship.deleteConstraint === Constraint.SET_DEFAULT) {
      lines.unshift(
        "            // ON DELETE SET DEFAULT has no EF Core equivalent; set it in a migration.",
      );
    }
    return lines;
  }

  function entityConfiguration(table) {
    const className = classNames.get(table.id);
    const lines = [];

    const tableName = str(table.name);
    lines.push(
      table.comment?.trim()
        ? `            entity.ToTable(${tableName}, tb => tb.HasComment(${str(table.comment)}));`
        : `            entity.ToTable(${tableName});`,
    );

    const primaryKeys = table.fields.filter((f) => f.primary);
    lines.push(
      primaryKeys.length
        ? `            entity.HasKey(${lambda(
            "e",
            primaryKeys.map((f) => propertyNames.get(f)),
          )});`
        : "            entity.HasNoKey();",
    );

    table.fields
      .filter((f) => f.unique && !f.primary)
      .forEach((f) => {
        lines.push(
          `            entity.HasIndex(e => e.${propertyNames.get(f)}).IsUnique();`,
        );
      });
    (table.uniqueConstraints ?? []).forEach((constraint) => {
      const properties = constraint.fields.map((c) =>
        propertyByColumn(table, c),
      );
      lines.push(
        `            entity.HasIndex(${lambda("e", properties)}, ${str(constraint.name)}).IsUnique();`,
      );
    });
    (table.indices ?? []).forEach((index) => {
      const properties = index.fields.map((c) => propertyByColumn(table, c));
      lines.push(
        `            entity.HasIndex(${lambda("e", properties)}, ${str(index.name)})${index.unique ? ".IsUnique()" : ""};`,
      );
    });

    const properties = table.fields.flatMap((f) =>
      propertyConfiguration(f, table),
    );
    if (properties.length) lines.push("", ...properties);

    const foreignKeys = relationships
      .filter((r) => r.start === table)
      .map(relationshipConfiguration);
    foreignKeys.forEach((fk) => lines.push("", ...fk));

    return [
      `        modelBuilder.Entity<${className}>(entity =>`,
      "        {",
      ...lines,
      "        });",
    ].join("\n");
  }

  const nameDbSet = uniqueNamer([contextName, ...dbContextMembers]);
  const dbSets = tables.map((t) => {
    const className = classNames.get(t.id);
    return `    public virtual DbSet<${className}> ${nameDbSet(className)} { get; set; }`;
  });

  const context = [
    `public class ${contextName} : DbContext`,
    "{",
    `    public ${contextName}(DbContextOptions<${contextName}> options)`,
    "        : base(options)",
    "    {",
    "    }",
    "",
    ...dbSets,
    "",
    "    protected override void OnModelCreating(ModelBuilder modelBuilder)",
    "    {",
    tables.map(entityConfiguration).join("\n\n"),
    "    }",
    "}",
  ].join("\n");

  const header = [
    "using System;",
    "using System.Collections.Generic;",
    "using Microsoft.EntityFrameworkCore;",
    "",
    `namespace ${namespace};`,
  ].join("\n");

  return [header, ...tables.map(entityClass), context].join("\n\n") + "\n";
}
