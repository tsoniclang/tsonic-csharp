import type { ObjectShapeFact } from "@tsonic/tsts";
import type { TargetCompileInput, TargetDiagnostic } from "@tsonic/target-api";
import type { CsharpClassDeclaration, CsharpTypeDeclaration, CsharpTypeNode } from "../ast/csharp-ast.js";
import { unsupportedNodeDiagnostic } from "./diagnostics.js";
import { csharpTypeFromTargetTypeRef } from "./target-types.js";

interface ObjectShapeRegistry {
  readonly declarations: Map<string, CsharpClassDeclaration>;
}

const registries = new WeakMap<TargetCompileInput, ObjectShapeRegistry>();

export function beginObjectShapePlanning(input: TargetCompileInput): void {
  registries.set(input, { declarations: new Map() });
}

export function takeObjectShapeDeclarations(input: TargetCompileInput): readonly CsharpTypeDeclaration[] {
  const registry = registries.get(input);
  registries.delete(input);
  return registry === undefined ? [] : [...registry.declarations.values()];
}

export function csharpTypeFromObjectShapeFact(
  input: TargetCompileInput,
  fact: ObjectShapeFact,
  diagnostics?: TargetDiagnostic[],
  diagnosticSubject?: Parameters<typeof unsupportedNodeDiagnostic>[0],
): CsharpTypeNode | undefined {
  const targetType = csharpTypeFromTargetTypeRef(fact.targetType);
  if (targetType === undefined || targetType.kind !== "named") {
    if (diagnostics !== undefined && diagnosticSubject !== undefined) {
      diagnostics.push(unsupportedNodeDiagnostic(diagnosticSubject, "Object-shape fact must carry a renderable named target carrier type before C# emission."));
    }
    return undefined;
  }
  registerObjectShapeDeclaration(input, targetType.name, fact, diagnostics, diagnosticSubject);
  return targetType;
}

function registerObjectShapeDeclaration(
  input: TargetCompileInput,
  name: string,
  fact: ObjectShapeFact,
  diagnostics: TargetDiagnostic[] | undefined,
  diagnosticSubject: Parameters<typeof unsupportedNodeDiagnostic>[0] | undefined,
): void {
  const registry = registries.get(input);
  if (registry === undefined || registry.declarations.has(name)) {
    return;
  }
  const members = fact.members.map((member) => {
    const type = csharpTypeFromTargetTypeRef(member.type);
    if (type === undefined) {
      if (diagnostics !== undefined && diagnosticSubject !== undefined) {
        diagnostics.push(unsupportedNodeDiagnostic(diagnosticSubject, `Object-shape member '${member.sourceName}' must carry a renderable target carrier type before C# emission.`));
      }
      return undefined;
    }
    return {
      kind: "field" as const,
      name: member.targetName,
      modifiers: ["public"] as const,
      type,
    };
  });
  if (members.some((member) => member === undefined)) {
    return;
  }
  registry.declarations.set(name, {
    kind: "class",
    name,
    modifiers: ["public"],
    members: members as CsharpClassDeclaration["members"],
  });
}
