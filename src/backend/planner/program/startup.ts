import type { CsharpPlanningContext } from "../context.js";
import type { CsharpModuleInitializationPlan } from "./module-initialization.js";
import type { CsharpOutputSourceFile } from "../../artifact-model/output.js";
import type { PlannedCsharpSourceFile } from "./source-file.js";
import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import { csharpModuleInitMethodName } from "./module-initialization.js";
import {
  predefined,
  qualifiedCsharpType,
} from "../types/index.js";
import { csharpTypeFromTargetTypeRef } from "../types/target-type-rendering.js";
import { readNamespace } from "../project/project-artifacts.js";
import { targetPolicyDiagnostic } from "../diagnostics.js";
import type {
  CsharpExpression,
  CsharpStatement,
} from "../../target-ast/roslyn/index.js";

export function planCsharpStartupSourceFile(
  input: CsharpPlanningContext,
  plannedSources: readonly PlannedCsharpSourceFile[],
  moduleInitialization: CsharpModuleInitializationPlan,
  diagnostics: TargetDiagnostic[],
): CsharpOutputSourceFile | undefined {
  const plannedSourcesByFileName = new Map(plannedSources.map((source) => [source.fileName, source]));
  const entrypointSourceFile = moduleInitialization.entrypointInitializer();
  const entrypointPlannedSource = entrypointSourceFile === undefined
    ? undefined
    : plannedSourcesByFileName.get(input.program.source.ast.getFileName(entrypointSourceFile));
  if (input.program.configuration.outputType === "Library") {
    if (
      entrypointSourceFile === undefined ||
      entrypointPlannedSource?.hasModuleInitializer !== true
    ) {
      return undefined;
    }
    if (entrypointPlannedSource.asyncModuleInitializer) {
      diagnostics.push(targetPolicyDiagnostic(
        entrypointSourceFile,
        "CSHARP_ASYNC_LIBRARY_MODULE_INITIALIZATION_UNSUPPORTED",
        "C# library output cannot preserve TypeScript top-level await during automatic module initialization because CLR module initializers must be synchronous.",
        [
          "The configured library entry module requires asynchronous initialization.",
          "Generated library members can execute only after the complete entry-module dependency graph has initialized.",
          "Select executable output or remove top-level await from the library module graph.",
        ],
      ));
      return undefined;
    }
    return planCsharpLibraryModuleInitializer(input, entrypointPlannedSource);
  }
  const driverDiagnosticCount = diagnostics.length;
  const binaryExecutionDriver = planCsharpBinaryExecutionDriver(
    input,
    diagnostics,
  );
  if (diagnostics.length !== driverDiagnosticCount) return undefined;
  const workerEntryByKey = new Map<string, {
    readonly sourceFile: import("@tsonic/tsts").SourceFile;
    readonly identity: string;
    readonly planned: PlannedCsharpSourceFile;
    readonly bootstrap: import("../../../analysis/source-modules/model.js").CsharpSourceModuleBootstrap;
  }>();
  for (const construction of input.program.sourceModuleConstructions.entries()) {
    const sourceFile = construction.targetSourceFile;
    const fileName = input.program.source.ast.getFileName(sourceFile);
    const planned = plannedSourcesByFileName.get(fileName);
    if (planned === undefined) {
      diagnostics.push(targetPolicyDiagnostic(
        sourceFile,
        "CSHARP_WORKER_SOURCE_ARTIFACT_MISSING",
        `Worker source module '${fileName}' has no planned C# source artifact.`,
      ));
      continue;
    }
    const key = `${construction.bootstrap.id}\0${fileName}`;
    if (!workerEntryByKey.has(key)) {
      workerEntryByKey.set(key, {
        sourceFile,
        identity: input.outputIdentities.resolveRequired(fileName).className,
        planned,
        bootstrap: construction.bootstrap,
      });
    }
  }
  const workerEntries = [...workerEntryByKey.values()];
  if (diagnostics.length > 0) return undefined;
  const asyncEntrypoint =
    binaryExecutionDriver === undefined &&
    (
      entrypointPlannedSource?.asyncModuleInitializer === true ||
      workerEntries.some((entry) =>
        entry.planned?.asyncModuleInitializer === true)
    );
  const workerDispatch = planCsharpWorkerDispatch(
    workerEntries,
    binaryExecutionDriver,
    diagnostics,
  );
  if (workerDispatch === undefined) return undefined;
  return {
    path: "generated/TsonicEntrypoint.cs",
    unit: {
      kind: "CompilationUnit",
      usings: [],
      members: [{
        kind: "NamespaceDeclaration",
        name: readNamespace(input),
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
  entries: readonly {
    readonly sourceFile: import("@tsonic/tsts").SourceFile;
    readonly identity: string;
    readonly planned: PlannedCsharpSourceFile;
    readonly bootstrap: import("../../../analysis/source-modules/model.js").CsharpSourceModuleBootstrap;
  }[],
  binaryExecutionDriver: PlannedCsharpBinaryExecutionDriver | undefined,
  diagnostics: TargetDiagnostic[],
): readonly CsharpStatement[] | undefined {
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
    const bootstrapType = csharpTypeFromTargetTypeRef(bootstrap.declaringType);
    if (bootstrapType === undefined) {
      diagnostics.push(targetPolicyDiagnostic(
        group[0]!.sourceFile,
        "CSHARP_WORKER_BOOTSTRAP_TYPE_UNRENDERABLE",
        `Source-module bootstrap '${bootstrap.id}' has no renderable C# declaring type.`,
      ));
      continue;
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
  return diagnostics.length === 0 ? Object.freeze(statements) : undefined;

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
  diagnostics: TargetDiagnostic[],
): PlannedCsharpBinaryExecutionDriver | undefined {
  const driver = input.program.binaryExecutionDriver;
  if (driver === undefined) return undefined;
  const declaringType = csharpTypeFromTargetTypeRef(driver.declaringType);
  if (declaringType === undefined) {
    diagnostics.push({
      code: "CSHARP_BINARY_EXECUTION_DRIVER_TYPE_UNRENDERABLE",
      category: "error",
      source: "tsonic-csharp",
      message:
        `Provider binary execution driver '${driver.id}' has no renderable C# declaring type.`,
      evidence: Object.freeze([
        `provider.binaryExecutionDriver=${driver.id}`,
        `provider.runMethod=${driver.runMethodName}`,
        `provider.runWithEntrypointMethod=${driver.runWithEntrypointMethodName}`,
      ]),
    });
    return undefined;
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
  if (source.asyncModuleInitializer && driver !== undefined) {
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
      source?.hasModuleInitializer === true &&
      source.asyncModuleInitializer
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
        : [{ kind: "Argument", expression: entryTask }],
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
        name: readNamespace(input),
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
