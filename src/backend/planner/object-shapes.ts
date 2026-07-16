import type { TargetCompileInput, TargetDiagnostic } from "@tsonic/target-api";
import type { CsharpClassDeclaration, CsharpTypeDeclaration, CsharpTypeNode } from "../roslyn/syntax.js";
import { unsupportedNodeDiagnostic } from "./diagnostics.js";
import { csharpTypeFromTargetTypeRef } from "./target-types.js";
import type { CsharpObjectShapeFact } from "../../source/csharp-facts.js";
import {
  objectShapeDeclarationMatches,
  renderObjectShapeInterfaces,
  renderObjectShapeMembers,
  renderObjectShapeTypeParameters,
} from "./object-shape-declarations.js";
import {
  csharpJsonValueInterfaceType,
  objectShapeRequiresJsonSerialization,
  renderJsonSerializableObjectShapeMethod,
} from "./json-object-shapes.js";

export {
  objectShapeStorageMemberName,
} from "./object-shape-storage.js";

interface ObjectShapeRegistry {
  readonly declarations: Map<string, CsharpClassDeclaration>;
  readonly declarationOwners: Map<string, string | undefined>;
  activeOwner?: string;
}

const registries = new WeakMap<TargetCompileInput, ObjectShapeRegistry>();

export function beginObjectShapePlanning(input: TargetCompileInput): void {
  registries.set(input, createObjectShapeRegistry());
}

export function beginObjectShapeSourceFilePlanning(input: TargetCompileInput, owner: string): void {
  const registry = registries.get(input) ?? createObjectShapeRegistry();
  registry.activeOwner = owner;
  registries.set(input, registry);
}

function createObjectShapeRegistry(): ObjectShapeRegistry {
  return {
    declarations: new Map(),
    declarationOwners: new Map(),
  };
}

export function takeObjectShapeDeclarations(input: TargetCompileInput, owner?: string): readonly CsharpTypeDeclaration[] {
  const registry = registries.get(input);
  if (registry === undefined) {
    return [];
  }
  if (owner === undefined) {
    registries.delete(input);
    return [...registry.declarations.values()];
  }
  return [...registry.declarations]
    .filter(([name]) => registry.declarationOwners.get(name) === owner)
    .map(([, declaration]) => declaration);
}

export function finishObjectShapePlanning(input: TargetCompileInput): void {
  registries.delete(input);
}

export function csharpTypeFromObjectShapeFact(
  input: TargetCompileInput,
  fact: CsharpObjectShapeFact,
  diagnostics?: TargetDiagnostic[],
  diagnosticSubject?: Parameters<typeof unsupportedNodeDiagnostic>[0],
): CsharpTypeNode | undefined {
  const targetType = csharpTypeFromTargetTypeRef(fact.targetType);
  if (targetType === undefined || targetType.kind !== "IdentifierName") {
    if (diagnostics !== undefined && diagnosticSubject !== undefined) {
      diagnostics.push(unsupportedNodeDiagnostic(diagnosticSubject, "Object-shape fact must carry a renderable named target carrier type before C# emission."));
    }
    return undefined;
  }
  if (fact.constructible === false) {
    if (diagnostics !== undefined && diagnosticSubject !== undefined) {
      diagnostics.push(unsupportedNodeDiagnostic(diagnosticSubject, "Class object literal emission requires a finalized constructible source class fact with a parameterless constructor."));
    }
    return undefined;
  }
  if (fact.constructible === true) {
    return targetType;
  }
  if (isSourceDeclaredNominalShape(fact)) {
    return targetType;
  }
  registerObjectShapeDeclaration(input, targetType.name, fact, diagnostics, diagnosticSubject);
  return targetType;
}

function isSourceDeclaredNominalShape(fact: CsharpObjectShapeFact): boolean {
  return fact.targetType.kind === "target-named" &&
    (fact.targetType as { readonly csharpSourceDeclarationKind?: unknown }).csharpSourceDeclarationKind !== undefined;
}

function registerObjectShapeDeclaration(
  input: TargetCompileInput,
  name: string,
  fact: CsharpObjectShapeFact,
  diagnostics: TargetDiagnostic[] | undefined,
  diagnosticSubject: Parameters<typeof unsupportedNodeDiagnostic>[0] | undefined,
): void {
  const registry = registries.get(input);
  if (registry === undefined) {
    return;
  }
  const existing = registry.declarations.get(name);
  const jsonSerializable = objectShapeRequiresJsonSerialization(input, fact);
  if (existing !== undefined) {
    if (!objectShapeDeclarationMatches(existing, fact, jsonSerializable)) {
      const message = `Object-shape carrier '${name}' was requested with incompatible finalized members. Structural carriers must have stable unique target identities.`;
      if (diagnostics !== undefined && diagnosticSubject !== undefined) {
        diagnostics.push(unsupportedNodeDiagnostic(diagnosticSubject, message));
        return;
      }
      throw new Error(message);
    }
    return;
  }
  const interfaces = renderObjectShapeInterfaces(fact, diagnostics, diagnosticSubject);
  if (interfaces === undefined) {
    return;
  }
  const typeParameters = renderObjectShapeTypeParameters(fact, diagnostics, diagnosticSubject);
  if (typeParameters === undefined) {
    return;
  }
  const implementsInterface = interfaces.length > 0;
  const members = renderObjectShapeMembers(fact, implementsInterface, diagnostics, diagnosticSubject);
  if (members === undefined) {
    return;
  }
  registry.declarations.set(name, {
    kind: "ClassDeclaration",
    name,
    modifiers: ["public"],
    ...(typeParameters.length === 0 ? {} : { typeParameters }),
    ...(interfaces.length === 0 && !jsonSerializable
      ? {}
      : { interfaces: jsonSerializable ? [...interfaces, csharpJsonValueInterfaceType()] : interfaces }),
    members: jsonSerializable ? [...members, renderJsonSerializableObjectShapeMethod(fact)] : members,
  });
  registry.declarationOwners.set(name, registry.activeOwner);
}
