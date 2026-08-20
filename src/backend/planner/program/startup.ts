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
import { readNamespace } from "../project/project-artifacts.js";
import { targetPolicyDiagnostic } from "../diagnostics.js";

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
  const asyncEntrypoint =
    entrypointPlannedSource?.asyncModuleInitializer === true;
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
            parameters: [],
            body: {
              kind: "Block",
              statements: plannedSources
                .filter((source) => source === entrypointPlannedSource && source.hasModuleInitializer)
                .map((source) => ({
                  kind: "ExpressionStatement",
                  expression: asyncEntrypoint
                    ? {
                        kind: "AwaitExpression",
                        expression: {
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
                        },
                      }
                    : {
                    kind: "InvocationExpression",
                    callee: {
                      kind: "SimpleMemberAccessExpression",
                      receiver: { kind: "IdentifierName", name: source.moduleClassName },
                      name: csharpModuleInitMethodName,
                    },
                    arguments: [],
                  },
                })),
            },
          }],
        }],
      }],
    },
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
