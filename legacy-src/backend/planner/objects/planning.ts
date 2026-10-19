import type {
  CsharpPlanningContext,
} from "../context.js";
import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import type {
  CsharpCompilationUnit,
  CsharpTypeDeclaration,
  CsharpTypeNode,
} from "../../target-ast/syntax/index.js";
import type {
  CsharpOutputSourceFile,
} from "../../artifact-model/output.js";
import { unsupportedNodeDiagnostic } from "../diagnostics.js";
import { failCsharpPlannerInvariant } from "../../invariants.js";
import {
  csharpTypeFromTargetTypeRef,
} from "../types/target-types.js";
import type {
  CsharpObjectShapeFact,
  CsharpTargetNamedTypeRef,
} from "../../../target-model/types/index.js";
import {
  csharpStructuralObjectShapeIdentity,
  isCsharpJsValueObjectShapeTargetType,
  targetTypeRefEquals,
} from "../../../target-model/types/index.js";
import {
  objectShapeDeclarationMatches,
  renderObjectShapeInterfaces,
  renderObjectShapeMembers,
  renderObjectShapeTypeParameters,
} from "./declarations.js";
import {
  csharpJsonValueInterfaceType,
  renderJsonSerializableObjectShapeMethod,
} from "./json-object-shapes.js";
import {
  renderObjectShapeProjectionMethods,
} from "./closed-object-shapes.js";
import {
  finalizeCsharpCompilationUnit,
} from "../program/compilation-unit.js";
import {
  readNamespace,
} from "../project/project-artifacts.js";

export {
  objectShapeAccessorGetterStorageMemberName,
  objectShapeAccessorSetterStorageMemberName,
  objectShapeStorageMemberName,
} from "../../../target-model/names/object-members.js";
export { objectShapeMethodStorageTargetType } from "./object-shape-storage.js";

import { isCsharpEmptyObjectTargetType } from "../../../target-model/types/carriers/runtime-carriers.js";
import { guardCsharpFrozenDataProperties } from "./frozen-data-properties.js";
import { csharpInheritedStructuralInterfaces, renderCsharpStructuralInterfaceMembers } from "./declarations/structural-interfaces.js";
import { renderCsharpMethodValueContracts } from "./declarations/method-values.js";
import { csharpClosedValueCarrierInterfaceType } from "./declarations/interfaces.js";
import { csharpEnumerableKeysContract, isCsharpEnumerableKeysMember, renderCsharpEnumerableKeys } from "./declarations/enumerable-keys.js";
import { renderCsharpAuthoredObjectMethods } from "./declarations/authored-methods.js";
import { renderCsharpCaptureFrameMethods } from "./declarations/capture-methods.js";
import type { CsharpObjectShapeProjectionDeclaration } from "../../../target-model/records/object-shape-demand.js";

export function csharpTypeFromObjectShapeFact(
  input: CsharpPlanningContext,
  fact: CsharpObjectShapeFact,
  _diagnostics?: TargetDiagnostic[],
  diagnosticSubject?: Parameters<typeof unsupportedNodeDiagnostic>[0],
): CsharpTypeNode | undefined {
  const targetType = csharpTypeFromTargetTypeRef(fact.targetType, input.scope.typeParameterNames);
  if (targetType === undefined) return failCsharpPlannerInvariant(
    "An admitted object-shape artifact must carry its renderable target type.", diagnosticSubject);
  if (!isCsharpJsValueObjectShapeTargetType(fact.targetType) && !isCsharpEmptyObjectTargetType(fact.targetType)) {
    input.artifacts.objectShape(fact);
  }
  return targetType;
}

export function csharpConstructibleTypeFromObjectShapeFact(
  input: CsharpPlanningContext,
  fact: CsharpObjectShapeFact,
  diagnostics?: TargetDiagnostic[],
  diagnosticSubject?: Parameters<typeof unsupportedNodeDiagnostic>[0],
): CsharpTypeNode | undefined {
  if (fact.constructible === false) {
    reportObjectShapeFailure(
      diagnostics,
      diagnosticSubject,
      "Class object literal emission requires an exact constructible source class with a parameterless constructor.",
    );
    return undefined;
  }
  return csharpTypeFromObjectShapeFact(
    input,
    fact,
    diagnostics,
    diagnosticSubject,
  );
}

export function materializeObjectShapeDeclarations(
  input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[],
): readonly CsharpTypeDeclaration[] {
  const declarations = new Map<string, CsharpTypeDeclaration>();
  for (const artifact of input.artifacts.objectShapeArtifacts()) {
    if (artifact.materialization !== "synthetic") {
      continue;
    }
    const fact = artifact.fact.declarationTemplate ?? artifact.fact;
    const declarationArtifact = artifact.fact.declarationTemplate === undefined
      ? artifact : input.artifacts.objectShape(fact);
    const typeParameterNames = new Map([...input.scope.typeParameterNames ?? [],
      ...declarationArtifact.typeParameterNames.map(parameter => [parameter.identity, parameter.name] as const)]);
    const declarationInput = { ...input, scope: { ...input.scope, typeParameterNames } };
    const declaration = renderObjectShapeDeclaration(
      declarationInput,
      declarationArtifact.fact,
      declarationArtifact.capabilities,
      declarationArtifact.projections,
      declarationArtifact.receiverBoundMethodKeys,
      diagnostics,
    );
    if (declaration === undefined) {
      continue;
    }
    const existing = declarations.get(declaration.name);
    if (
      existing !== undefined &&
      (existing.kind !== declaration.kind || (declarationArtifact.fact.methodImplementation !== undefined || input.program.records.captureFrameShape.get(declarationArtifact.fact.targetType) !== undefined
        ? JSON.stringify(existing) !== JSON.stringify(declaration)
        : existing.kind === "ClassDeclaration" && !objectShapeDeclarationMatches(
        typeParameterNames,
        input.program.records.nativeMemberHiding,
        existing,
        declarationArtifact.fact,
        declarationArtifact.capabilities.includes("json-serialization"),
        declarationArtifact.projections,
        new Set(declarationArtifact.receiverBoundMethodKeys),
        declarationArtifact.capabilities.includes("js-freeze"),
        declarationArtifact.capabilities.includes("reference-identity"),
        declaration.kind === "ClassDeclaration" ? declaration.members.filter(member =>
          member.kind === "PropertyDeclaration" && member.explicitInterface !== undefined) : [],
        declaration.kind === "ClassDeclaration" ? declaration.members.filter(isCsharpEnumerableKeysMember) : [],
      )) || existing.kind === "InterfaceDeclaration" && JSON.stringify(existing) !== JSON.stringify(declaration))
    ) {
      diagnostics.push({
        code: "CSHARP_OBJECT_SHAPE_ARTIFACT_CONFLICT",
        category: "error",
        source: "tsonic-csharp",
        message: `Generated object-shape name '${declaration.name}' is owned by incompatible target artifacts.`,
      });
      continue;
    }
    declarations.set(declaration.name, declaration);
  }
  return [...declarations.values()].sort((left, right) =>
    left.name.localeCompare(right.name)
  );
}

export function planCsharpObjectShapeSourceFile(
  input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[],
): {
  readonly source: CsharpOutputSourceFile;
  readonly requiresUnsafe: boolean;
} | undefined {
  const declarations = materializeObjectShapeDeclarations(input, diagnostics);
  if (declarations.length === 0) {
    return undefined;
  }
  const unit: CsharpCompilationUnit = {
    kind: "CompilationUnit",
    usings: [],
    members: [{
      kind: "NamespaceDeclaration",
      name: readNamespace(input),
      members: declarations,
    }],
  };
  const finalized = finalizeCsharpCompilationUnit(
    unit,
    input.program.configuration.languageDialect,
  );
  return {
    source: {
      path: "generated/TsonicObjectShapes.cs",
      unit: finalized.unit,
    },
    requiresUnsafe: finalized.requiresUnsafe,
  };
}

function renderObjectShapeDeclaration(
  input: CsharpPlanningContext,
  instance: CsharpObjectShapeFact,
  capabilities: readonly import("../../../target-model/types/index.js").CsharpObjectShapeCapability[],
  projections: readonly CsharpObjectShapeProjectionDeclaration[],
  receiverBoundMethodKeys: readonly string[],
  diagnostics: TargetDiagnostic[],
): CsharpTypeDeclaration | undefined {
  const fact = instance.declarationTemplate ?? instance;
  const jsonSerializable = capabilities.includes("json-serialization");
  const referenceIdentity = capabilities.includes("reference-identity");
  const targetType = csharpTypeFromTargetTypeRef(fact.targetType, input.scope.typeParameterNames);
  if (targetType === undefined || targetType.kind !== "IdentifierName") {
    diagnostics.push({
      code: "CSHARP_OBJECT_SHAPE_TARGET_TYPE_INVALID",
      category: "error",
      source: "tsonic-csharp",
      message: "Generated object-shape artifact has no renderable named C# target type.",
    });
    return undefined;
  }
  const interfaces = renderObjectShapeInterfaces(input.scope.typeParameterNames, fact, undefined, undefined);
  const typeParameters = renderObjectShapeTypeParameters(
    input.scope.typeParameterNames,
    fact,
    undefined,
    undefined,
  );
  if ((fact.targetType as CsharpTargetNamedTypeRef).csharpStructuralContract === true) {
    const inheritedEnumerableKeys = (fact.implements ?? []).some(base =>
      input.artifacts.objectShapeArtifacts().some(artifact =>
        targetTypeRefEquals(artifact.fact.targetType, base) &&
        artifact.capabilities.includes("enumerable-keys")));
    const inherited = csharpInheritedStructuralInterfaces(fact, input);
    const contractMembers = renderCsharpStructuralInterfaceMembers(input.scope.typeParameterNames, fact, input.program.records,
      capabilities.includes("method-values"), inherited, input.program.records.nativeMemberHiding);
    if (contractMembers === undefined || interfaces === undefined || typeParameters === undefined) {
      diagnostics.push({ code: "CSHARP_STRUCTURAL_INTERFACE_NOT_CLOSED", category: "error", source: "tsonic-csharp",
        message: "A structural reference contract requires exact renderable member signatures." });
      return undefined;
    }
    return { kind: "InterfaceDeclaration", name: targetType.name,
      objectShapeIdentity: csharpStructuralObjectShapeIdentity(fact.targetType), modifiers: ["public"], typeParameters,
      interfaces: [...interfaces, ...(jsonSerializable ? [csharpJsonValueInterfaceType()] : []),
        ...(referenceIdentity ? [csharpClosedValueCarrierInterfaceType()] : [])],
      members: [...contractMembers, ...(capabilities.includes("enumerable-keys") && !inheritedEnumerableKeys ? [csharpEnumerableKeysContract(fact, input.program.records.nativeMemberHiding)] : []),
        ...renderObjectShapeProjectionMethods(input, projections, diagnostics)] };
  }
  const members = renderObjectShapeMembers(
    input.scope.typeParameterNames,
    fact,
    (interfaces?.length ?? 0) > 0,
    new Set(receiverBoundMethodKeys),
    undefined,
    undefined,
    input.program.records,
    input.program.records.nativeMemberHiding,
    new Set(input.program.records.captureFrameShape.get(fact.targetType)?.bindings
      .filter(binding => binding.initialization === "deferred").map(binding => binding.fieldName)),
  );
  const methodValues = renderCsharpMethodValueContracts(fact, input);
  const genericMethods = renderCsharpAuthoredObjectMethods(fact, input, diagnostics);
  const captureMethods = renderCsharpCaptureFrameMethods(fact, input, diagnostics);
  const enumerableKeys = capabilities.includes("enumerable-keys") ? renderCsharpEnumerableKeys(fact, input) : [];
  if (
    interfaces === undefined ||
    typeParameters === undefined ||
    members === undefined || methodValues === undefined || genericMethods === undefined || captureMethods === undefined || enumerableKeys === undefined
  ) {
    diagnostics.push({
      code: "CSHARP_OBJECT_SHAPE_RENDERING_REJECTED",
      category: "error",
      source: "tsonic-csharp",
      message: `Generated object-shape artifact '${targetType.name}' contains a target type or member that cannot be rendered exactly.`,
    });
    return undefined;
  }
  const objectShapeIdentity = csharpStructuralObjectShapeIdentity(
    fact.targetType,
  );
  return {
    kind: (fact.targetType as CsharpTargetNamedTypeRef).csharpValueType === true ? "StructDeclaration" : "ClassDeclaration",
    name: targetType.name,
    ...(objectShapeIdentity === undefined ? {} : { objectShapeIdentity }),
    modifiers: ["public"],
    ...(typeParameters.length === 0 ? {} : { typeParameters }),
    ...(interfaces.length === 0 && !jsonSerializable && !referenceIdentity
      ? {}
      : {
          interfaces: [
            ...interfaces,
            ...(jsonSerializable ? [csharpJsonValueInterfaceType()] : []),
            ...(referenceIdentity ? [csharpClosedValueCarrierInterfaceType()] : []),
          ],
        }),
    members: [
      ...genericMethods,
      ...captureMethods,
      ...methodValues,
      ...enumerableKeys,
      ...(capabilities.includes("js-freeze") ? guardCsharpFrozenDataProperties(fact, members, input, diagnostics) : members),
      ...(jsonSerializable ? renderJsonSerializableObjectShapeMethod(fact, input.program.records.nativeMemberHiding) : []),
      ...renderObjectShapeProjectionMethods(
        input,
        projections,
        diagnostics,
      ),
    ],
  };
}

function reportObjectShapeFailure(
  diagnostics: TargetDiagnostic[] | undefined,
  diagnosticSubject: Parameters<typeof unsupportedNodeDiagnostic>[0] | undefined,
  message: string,
): void {
  if (diagnostics !== undefined && diagnosticSubject !== undefined) {
    diagnostics.push(unsupportedNodeDiagnostic(diagnosticSubject, message));
  }
}
