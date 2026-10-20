import type { CsharpPlanningContext } from "../context.js";
import type { CsharpOutputSourceFile } from "../../artifact-model/output.js";
import type { PlannedCsharpSourceFile } from "./source-file.js";
import { csharpModuleInitMethodName } from "./module-initialization-names.js";
import {
  predefined,
  qualifiedCsharpType,
} from "../types/index.js";
import { csharpTypeFromTargetTypeRef } from "../types/target-type-rendering.js";
import { failCsharpPlannerInvariant } from "../../invariants.js";
import type {
  CsharpExpression,
  CsharpStatement,
} from "../../target-ast/syntax/index.js";

export function planCsharpStartupSourceFile(
  input: CsharpPlanningContext,
  plannedSources: readonly PlannedCsharpSourceFile[],
): CsharpOutputSourceFile | undefined {
  const plannedSourcesByFileName = new Map(plannedSources.map((source) => [source.fileName, source]));
  const selection = input.program.records.startup.get();
  const entrypointPlannedSource = selection.entryFileName === undefined
    ? undefined
    : plannedSourcesByFileName.get(selection.entryFileName);
  if (selection.kind === "none") return undefined;
  if (selection.kind === "library") {
    if (entrypointPlannedSource?.hasModuleInitializer !== true)
      failCsharpPlannerInvariant("An admitted native library startup requires its synchronous entry initializer.");
    return planCsharpLibraryModuleInitializer(input, entrypointPlannedSource);
  }
  const binaryExecutionDriver = planCsharpBinaryExecutionDriver(
    input,
  );
  const workerEntryByKey = new Map<string, {
    readonly sourceFile: import("@tsonic/tsts").SourceFile;
    readonly identity: string;
    readonly planned: PlannedCsharpSourceFile;
    readonly bootstrap: import("../../../target-model/records/source-modules.js").CsharpSourceModuleBootstrap;
  }>();
  for (const construction of selection.workers) {
    const sourceFile = construction.sourceFile;
    const fileName = construction.fileName;
    const planned = plannedSourcesByFileName.get(fileName);
    if (planned === undefined) {
      failCsharpPlannerInvariant("An admitted worker source requires its native source artifact.", sourceFile);
    }
    const key = `${construction.bootstrap.id}\0${fileName}`;
    if (!workerEntryByKey.has(key)) {
      workerEntryByKey.set(key, {
        sourceFile,
        identity: construction.identity,
        planned,
        bootstrap: construction.bootstrap,
      });
    }
  }
  const workerEntries = [...workerEntryByKey.values()];
  const asyncEntrypoint = selection.asynchronous;
  const workerDispatch = planCsharpWorkerDispatch(
    input.scope.typeParameterNames,
    workerEntries,
    binaryExecutionDriver,
  );
  if (workerDispatch === undefined) return undefined;
  return {
    path: "generated/TsonicEntrypoint.cs",
    unit: {
      kind: "CompilationUnit",
      usings: [],
      members: [{
        kind: "NamespaceDeclaration",
        name: input.program.records.compilation.get().namespace,
        members: [{
          kind: "ClassDeclaration",
          name: "TsonicEntrypoint",
          modifiers: ["public", "static"],
          members: [{
            kind: "MethodDeclaration",
            name: "Main",
            modifiers: asyncEntrypoint
              ? ["public", "static", "async"]
              : ["public", "static"],
            returnType: asyncEntrypoint
              ? qualifiedCsharpType(
                  "System.Threading.Tasks",
                  "Task",
                )
              : predefined("void"),
            parameters: workerEntries.length === 0
              ? []
              : [{
                  name: "args",
                  type: {
                    kind: "ArrayType",
                    elementType: predefined("string"),
                  },
                }],
            body: {
              kind: "Block",
              statements: [
                ...workerDispatch,
                ...plannedSources
                .filter((source) => source === entrypointPlannedSource && source.hasModuleInitializer)
                .map((source) =>
                  planCsharpModuleInitializationStatement(
                    source,
                    binaryExecutionDriver,
                  )),
                ...planStandaloneBinaryExecutionDriver(
                  entrypointPlannedSource,
                  binaryExecutionDriver,
                ),
              ],
            },
          }],
        }],
      }],
    },
  };
}

function planCsharpWorkerDispatch(
  typeParameterNames: ReadonlyMap<string, string> | undefined,
  entries: readonly {
    readonly sourceFile: import("@tsonic/tsts").SourceFile;
    readonly identity: string;
    readonly planned: PlannedCsharpSourceFile;
    readonly bootstrap: import("../../../target-model/records/source-modules.js").CsharpSourceModuleBootstrap;
  }[],
  binaryExecutionDriver: PlannedCsharpBinaryExecutionDriver | undefined,
): readonly CsharpStatement[] {
  if (entries.length === 0) return Object.freeze([]);
  const entriesByBootstrapId = new Map<
    string,
    (typeof entries)[number][]
  >();
  for (const entry of entries) {
    const selected = entriesByBootstrapId.get(entry.bootstrap.id) ?? [];
    selected.push(entry);
    entriesByBootstrapId.set(entry.bootstrap.id, selected);
  }
  const statements: CsharpStatement[] = [];
  const groups = [...entriesByBootstrapId.values()].sort((left, right) =>
    left[0]!.bootstrap.id.localeCompare(right[0]!.bootstrap.id, "en"));
  for (const [index, group] of groups.entries()) {
    const bootstrap = group[0]!.bootstrap;
    const bootstrapType = csharpTypeFromTargetTypeRef(bootstrap.declaringType, typeParameterNames);
    if (bootstrapType === undefined) {
      failCsharpPlannerInvariant("An admitted worker bootstrap requires its rendered native declaring type.", group[0]!.sourceFile);
    }
    const workerEntryName = `__tsonic_worker_entry_${index + 1}`;
    statements.push({
      kind: "LocalDeclarationStatement",
      name: workerEntryName,
      type: {
        kind: "NullableType",
        inner: predefined("string"),
      },
      initializer: {
        kind: "InvocationExpression",
        callee: {
          kind: "SimpleMemberAccessExpression",
          receiver: bootstrapType,
          name: bootstrap.methodName,
        },
        arguments: [{
          kind: "Argument",
          expression: { kind: "IdentifierName", name: "args" },
        }],
      },
    }, {
      kind: "IfStatement",
      condition: {
        kind: "NullPatternExpression",
        expression: { kind: "IdentifierName", name: workerEntryName },
        negated: true,
      },
      thenBody: {
        kind: "Block",
        statements: [{
          kind: "SwitchStatement",
          expression: { kind: "IdentifierName", name: workerEntryName },
          sections: [
          ...group.sort((left, right) => left.identity.localeCompare(right.identity, "en")).map((entry) => ({
            kind: "SwitchSection" as const,
            label: {
              kind: "CaseSwitchLabel" as const,
              expression: {
                kind: "LiteralExpression" as const,
                value: entry.identity,
              },
            },
            statements: [
              ...(entry.planned.hasModuleInitializer
                ? [planCsharpModuleInitializationStatement(
                    entry.planned,
                    binaryExecutionDriver,
                  )]
                : []),
              ...planStandaloneBinaryExecutionDriver(
                entry.planned,
                binaryExecutionDriver,
              ),
              {
              kind: "ReturnStatement" as const,
              },
            ],
          })),
          {
            kind: "SwitchSection",
            label: { kind: "DefaultSwitchLabel" },
            statements: [{
              kind: "ThrowStatement",
              expression: {
                kind: "ObjectCreationExpression",
                type: qualifiedCsharpType(
                  "System",
                  "InvalidOperationException",
                ),
                arguments: [{
                  kind: "Argument",
                  expression: {
                    kind: "LiteralExpression",
                    value:
                      "Worker process selected an entry that is absent from the closed generated dispatch table.",
                  },
                }],
              },
            }],
          },
          ],
        }],
      },
    });
  }
  return Object.freeze(statements);

}

interface PlannedCsharpBinaryExecutionDriver {
  readonly id: string;
  readonly declaringType: NonNullable<
    ReturnType<typeof csharpTypeFromTargetTypeRef>
  >;
  readonly runMethodName: string;
  readonly runWithEntrypointMethodName: string;
}

function planCsharpBinaryExecutionDriver(
  input: CsharpPlanningContext,
): PlannedCsharpBinaryExecutionDriver | undefined {
  const driver = input.program.records.startup.get().driver;
  if (driver === undefined) return undefined;
  const declaringType = csharpTypeFromTargetTypeRef(driver.declaringType, input.scope.typeParameterNames);
  if (declaringType === undefined) {
    failCsharpPlannerInvariant("An admitted native binary execution driver requires its rendered declaring type.");
  }
  return Object.freeze({
    id: driver.id,
    declaringType,
    runMethodName: driver.runMethodName,
    runWithEntrypointMethodName: driver.runWithEntrypointMethodName,
  });
}

function planCsharpModuleInitializationStatement(
  source: PlannedCsharpSourceFile,
  driver: PlannedCsharpBinaryExecutionDriver | undefined,
): CsharpStatement {
  const initialization = moduleInitializerCall(source);
  if (driver !== undefined) {
    return binaryExecutionDriverStatement(driver, initialization);
  }
  return {
    kind: "ExpressionStatement",
    expression: source.asyncModuleInitializer
      ? {
          kind: "AwaitExpression",
          expression: initialization,
        }
      : initialization,
  };
}

function planStandaloneBinaryExecutionDriver(
  source: PlannedCsharpSourceFile | undefined,
  driver: PlannedCsharpBinaryExecutionDriver | undefined,
): readonly CsharpStatement[] {
  if (
    driver === undefined ||
    (
      source?.hasModuleInitializer === true
    )
  ) {
    return [];
  }
  return [binaryExecutionDriverStatement(driver)];
}

function binaryExecutionDriverStatement(
  driver: PlannedCsharpBinaryExecutionDriver,
  entryTask?: CsharpExpression,
): CsharpStatement {
  return {
    kind: "ExpressionStatement",
    expression: {
      kind: "InvocationExpression",
      callee: {
        kind: "SimpleMemberAccessExpression",
        receiver: driver.declaringType,
        name: entryTask === undefined
          ? driver.runMethodName
          : driver.runWithEntrypointMethodName,
      },
      arguments: entryTask === undefined
        ? []
        : [{ kind: "Argument", expression: { kind: "LambdaExpression", parameters: [], body: entryTask } }],
    },
  };
}

function moduleInitializerCall(
  source: PlannedCsharpSourceFile,
): CsharpExpression {
  return {
    kind: "InvocationExpression",
    callee: {
      kind: "SimpleMemberAccessExpression",
      receiver: {
        kind: "IdentifierName",
        name: source.moduleClassName,
      },
      name: csharpModuleInitMethodName,
    },
    arguments: [],
  };
}

function planCsharpLibraryModuleInitializer(
  input: CsharpPlanningContext,
  entrypoint: PlannedCsharpSourceFile,
): CsharpOutputSourceFile {
  return {
    path: "generated/TsonicModuleInitializer.cs",
    unit: {
      kind: "CompilationUnit",
      usings: [],
      members: [{
        kind: "NamespaceDeclaration",
        name: input.program.records.compilation.get().namespace,
        members: [{
          kind: "ClassDeclaration",
          name: "TsonicModuleInitializer",
          modifiers: ["internal", "static"],
          members: [{
            kind: "MethodDeclaration",
            name: "Initialize",
            modifiers: ["internal", "static"],
            attributes: [{
              type: qualifiedCsharpType(
                "System.Runtime.CompilerServices",
                "ModuleInitializerAttribute",
              ),
            }, {
              type: qualifiedCsharpType(
                "System.Diagnostics.CodeAnalysis",
                "SuppressMessageAttribute",
              ),
              arguments: [{
                kind: "Argument",
                expression: { kind: "LiteralExpression", value: "Usage" },
              }, {
                kind: "Argument",
                expression: { kind: "LiteralExpression", value: "CA2255" },
              }],
            }],
            returnType: predefined("void"),
            parameters: [],
            body: {
              kind: "Block",
              statements: [{
                kind: "ExpressionStatement",
                expression: {
                  kind: "InvocationExpression",
                  callee: {
                    kind: "SimpleMemberAccessExpression",
                    receiver: {
                      kind: "IdentifierName",
                      name: entrypoint.moduleClassName,
                    },
                    name: csharpModuleInitMethodName,
                  },
                  arguments: [],
                },
              }],
            },
          }],
        }],
      }],
    },
  };
}
