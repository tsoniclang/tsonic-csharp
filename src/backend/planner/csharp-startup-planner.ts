import type { CsharpTranslationContext } from "../../translate/context/index.js";
import type { CsharpModuleInitializationPlan } from "./csharp-module-initialization.js";
import type { CsharpOutputSourceFile } from "./csharp-output-plan.js";
import type { PlannedCsharpSourceFile } from "./csharp-source-file-planner.js";
import type { TargetDiagnostic } from "@tsonic/target-api";
import { readCsharpOutputType } from "../../options/csharp-target-options.js";
import { csharpModuleInitMethodName } from "./csharp-module-initialization.js";
import {
  predefined,
  qualifiedCsharpType,
} from "./csharp-types.js";
import { readNamespace } from "./project-artifacts.js";
import { targetPolicyDiagnostic } from "./diagnostics.js";

export function planCsharpStartupSourceFile(
  input: CsharpTranslationContext,
  plannedSources: readonly PlannedCsharpSourceFile[],
  moduleInitialization: CsharpModuleInitializationPlan,
  diagnostics: TargetDiagnostic[],
): CsharpOutputSourceFile | undefined {
  const plannedSourcesByFileName = new Map(plannedSources.map((source) => [source.fileName, source]));
  const entrypointSourceFile = moduleInitialization.entrypointInitializer();
  const entrypointPlannedSource = entrypointSourceFile === undefined
    ? undefined
    : plannedSourcesByFileName.get(input.ast.getFileName(entrypointSourceFile));
  if (readCsharpOutputType(input.target) === "Library") {
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
  input: CsharpTranslationContext,
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
