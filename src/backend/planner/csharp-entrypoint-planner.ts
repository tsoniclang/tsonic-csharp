import type { TargetCompileInput } from "@tsonic/target-api";
import type { CsharpOutputSourceFile } from "./csharp-output-plan.js";
import type { PlannedCsharpSourceFile } from "./csharp-source-file-planner.js";
import { readCsharpOutputType } from "../../options/csharp-target-options.js";
import { predefined } from "./csharp-types.js";
import { readNamespace } from "./project-artifacts.js";

export const csharpModuleInitMethodName = "__tsonic_module_init";

export function planCsharpEntrypointSourceFile(
  input: TargetCompileInput,
  plannedSources: readonly PlannedCsharpSourceFile[],
): CsharpOutputSourceFile | undefined {
  if (readCsharpOutputType(input.target) !== "Exe") {
    return undefined;
  }
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
                .filter((source) => source.hasModuleInitializer)
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
