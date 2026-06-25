import type { TargetCompileInput } from "@tsonic/target-api";
import type { CsharpModuleInitializationPlan } from "./csharp-module-initialization.js";
import type { CsharpOutputSourceFile } from "./csharp-output-plan.js";
import type { PlannedCsharpSourceFile } from "./csharp-source-file-planner.js";
import { readCsharpOutputType } from "../../options/csharp-target-options.js";
import { predefined } from "./csharp-types.js";
import { readNamespace } from "./project-artifacts.js";

export const csharpModuleInitMethodName = "__tsonic_module_init";

export function planCsharpEntrypointSourceFile(
  input: TargetCompileInput,
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
            modifiers: ["public", "static"],
            returnType: predefined("void"),
            parameters: [],
            body: {
              kind: "Block",
              statements: plannedSources
                .filter((source) => source === entrypointPlannedSource && source.hasModuleInitializer)
                .map((source) => ({
                  kind: "ExpressionStatement",
                  expression: {
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
