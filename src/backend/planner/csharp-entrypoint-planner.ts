import type { CsharpTranslationContext } from "../../translate/context/index.js";
import type { CsharpModuleInitializationPlan } from "./csharp-module-initialization.js";
import type { CsharpOutputSourceFile } from "./csharp-output-plan.js";
import type { PlannedCsharpSourceFile } from "./csharp-source-file-planner.js";
import { readCsharpOutputType } from "../../options/csharp-target-options.js";
import {
  predefined,
  qualifiedCsharpType,
} from "./csharp-types.js";
import { readNamespace } from "./project-artifacts.js";

export const csharpModuleInitMethodName = "__tsonic_module_init";

export function planCsharpEntrypointSourceFile(
  input: CsharpTranslationContext,
  plannedSources: readonly PlannedCsharpSourceFile[],
  moduleInitialization: CsharpModuleInitializationPlan,
): CsharpOutputSourceFile | undefined {
  if (readCsharpOutputType(input.target) !== "Exe") {
    return undefined;
  }
  const plannedSourcesByFileName = new Map(plannedSources.map((source) => [source.fileName, source]));
  const entrypointSourceFile = moduleInitialization.entrypointInitializer();
  const entrypointPlannedSource = entrypointSourceFile === undefined
    ? undefined
    : plannedSourcesByFileName.get(input.ast.getFileName(entrypointSourceFile));
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
