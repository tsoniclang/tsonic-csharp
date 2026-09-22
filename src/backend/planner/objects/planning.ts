import type {
  CsharpPlanningContext,
} from "../context.js";
import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import type {
  CsharpCompilationUnit,
  CsharpTypeDeclaration,
  CsharpTypeNode,
} from "../../target-ast/roslyn/index.js";
import type {
  CsharpOutputSourceFile,
} from "../../artifact-model/output.js";
import {
  unsupportedNodeDiagnostic,
} from "../diagnostics.js";
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
  objectShapeMethodStorageTargetType,
  objectShapeStorageMemberName,
} from "./object-shape-storage.js";

import { isCsharpEmptyObjectTargetType } from "../../../target-model/types/runtime-carriers.js";
import { guardCsharpFrozenDataProperties } from "./frozen-data-properties.js";
import { renderCsharpStructuralInterfaceMembers } from "./declarations/structural-interfaces.js";
import { renderCsharpMethodValueContracts } from "./declarations/method-values.js";
import { csharpReferenceIdentityInterfaceType } from "./declarations/interfaces.js";
import { csharpEnumerableKeysContract, isCsharpEnumerableKeysMember, renderCsharpEnumerableKeys } from "./declarations/enumerable-keys.js";
import { renderCsharpGenericObjectMethods } from "./declarations/generic-methods.js";
import { renderCsharpCaptureFrameMethods } from "./declarations/capture-methods.js";

export function registerSourceObjectShape(
  input: CsharpPlanningContext,
  fact: CsharpObjectShapeFact,
  diagnostics: TargetDiagnostic[],
  diagnosticSubject: Parameters<typeof unsupportedNodeDiagnostic>[0],
): boolean {
  const result = input.artifacts.registerObjectShape(fact, "source");
  if (result.kind === "accepted") {
    return true;
  }
  diagnostics.push(unsupportedNodeDiagnostic(
    diagnosticSubject,
    result.reason,
  ));
  return false;
}

export function csharpTypeFromObjectShapeFact(
  input: CsharpPlanningContext,
  fact: CsharpObjectShapeFact,
  diagnostics?: TargetDiagnostic[],
  diagnosticSubject?: Parameters<typeof unsupportedNodeDiagnostic>[0],
): CsharpTypeNode | undefined {
  const targetType = csharpTypeFromTargetTypeRef(fact.targetType);
  if (targetType === undefined) {
    reportObjectShapeFailure(
      diagnostics,
      diagnosticSubject,
      "Object-shape fact must carry a renderable named target carrier type before C# emission.",
    );
    return undefined;
  }
  if (isCsharpJsValueObjectShapeTargetType(fact.targetType)) {
    return targetType;
  }
  if (isCsharpEmptyObjectTargetType(fact.targetType)) {
    if (fact.members.length === 0 && (fact.implements?.length ?? 0) === 0) return targetType;
    reportObjectShapeFailure(diagnostics, diagnosticSubject, "An empty-object carrier cannot contain members or implemented contracts.");
    return undefined;
  }
  if (fact.constructible === true || isSourceDeclaredNominalShape(fact)) {
    const result = input.artifacts.registerObjectShape(fact, "source");
    if (result.kind === "rejected") {
      reportObjectShapeFailure(
        diagnostics,
        diagnosticSubject,
        result.reason,
      );
      return undefined;
    }
    return targetType;
  }
  if (targetType.kind !== "IdentifierName") {
    reportObjectShapeFailure(
      diagnostics,
      diagnosticSubject,
      "Generated object-shape declarations require one exact unqualified compiler-owned target type name.",
    );
    return undefined;
  }
  const result = input.artifacts.registerObjectShape(fact, "synthetic");
  if (result.kind === "rejected") {
    reportObjectShapeFailure(
      diagnostics,
      diagnosticSubject,
      result.reason,
    );
    return undefined;
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
    const declaration = renderObjectShapeDeclaration(
      input,
      artifact.fact,
      artifact.capabilities,
      artifact.projections,
      artifact.receiverBoundMethodKeys,
      diagnostics,
    );
    if (declaration === undefined) {
      continue;
    }
    const existing = declarations.get(declaration.name);
    if (
      existing !== undefined &&
      (existing.kind !== declaration.kind || (artifact.fact.methodImplementation !== undefined || input.program.captureStorage.forShape(artifact.fact.targetType) !== undefined
        ? JSON.stringify(existing) !== JSON.stringify(declaration)
        : existing.kind === "ClassDeclaration" && !objectShapeDeclarationMatches(
        existing,
        artifact.fact.declarationTemplate ?? artifact.fact,
        artifact.capabilities.includes("json-serialization"),
        artifact.projections,
        new Set(artifact.receiverBoundMethodKeys),
        artifact.capabilities.includes("js-freeze"),
        artifact.capabilities.includes("reference-identity"),
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
  projections: readonly import("../../../target-model/types/index.js").CsharpObjectShapeProjection[],
  receiverBoundMethodKeys: readonly string[],
  diagnostics: TargetDiagnostic[],
): CsharpTypeDeclaration | undefined {
  const fact = instance.declarationTemplate ?? instance;
  const jsonSerializable = capabilities.includes("json-serialization");
  const referenceIdentity = capabilities.includes("reference-identity");
  const targetType = csharpTypeFromTargetTypeRef(fact.targetType);
  if (targetType === undefined || targetType.kind !== "IdentifierName") {
    diagnostics.push({
      code: "CSHARP_OBJECT_SHAPE_TARGET_TYPE_INVALID",
      category: "error",
      source: "tsonic-csharp",
      message: "Generated object-shape artifact has no renderable named C# target type.",
    });
    return undefined;
  }
  const interfaces = renderObjectShapeInterfaces(fact, undefined, undefined);
  const typeParameters = renderObjectShapeTypeParameters(
    fact,
    undefined,
    undefined,
  );
  if ((fact.targetType as CsharpTargetNamedTypeRef).csharpStructuralContract === true) {
    const inheritedEnumerableKeys = (fact.implements ?? []).some(base =>
      input.artifacts.objectShapeArtifacts().some(artifact =>
        targetTypeRefEquals(artifact.fact.targetType, base) &&
        artifact.capabilities.includes("enumerable-keys")));
    const inherited = (fact.implements ?? []).flatMap(type => {
      const shape = input.types.objectShapes.resolveTarget(type);
      return shape === undefined ? [] : [shape];
    });
    const contractMembers = renderCsharpStructuralInterfaceMembers(fact, input.program.storage, capabilities.includes("method-values"), inherited);
    if (contractMembers === undefined || interfaces === undefined || typeParameters === undefined) {
      diagnostics.push({ code: "CSHARP_STRUCTURAL_INTERFACE_NOT_CLOSED", category: "error", source: "tsonic-csharp",
        message: "A structural reference contract requires exact renderable member signatures." });
      return undefined;
    }
    return { kind: "InterfaceDeclaration", name: targetType.name,
      objectShapeIdentity: csharpStructuralObjectShapeIdentity(fact.targetType), modifiers: ["public"], typeParameters,
      interfaces: [...interfaces, ...(jsonSerializable ? [csharpJsonValueInterfaceType()] : []),
        ...(referenceIdentity ? [csharpReferenceIdentityInterfaceType()] : [])],
      members: [...contractMembers, ...(capabilities.includes("enumerable-keys") && !inheritedEnumerableKeys ? [csharpEnumerableKeysContract()] : [])] };
  }
  const members = renderObjectShapeMembers(
    fact,
    (interfaces?.length ?? 0) > 0,
    new Set(receiverBoundMethodKeys),
    undefined,
    undefined,
    input.program.storage,
  );
  const methodValues = renderCsharpMethodValueContracts(fact, input);
  const genericMethods = renderCsharpGenericObjectMethods(fact, input, diagnostics);
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
    kind: "ClassDeclaration",
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
            ...(referenceIdentity ? [csharpReferenceIdentityInterfaceType()] : []),
          ],
        }),
    members: [
      ...genericMethods,
      ...captureMethods,
      ...methodValues,
      ...enumerableKeys,
      ...(capabilities.includes("js-freeze") ? guardCsharpFrozenDataProperties(fact, members, input, diagnostics) : members),
      ...(jsonSerializable ? renderJsonSerializableObjectShapeMethod(fact) : []),
      ...renderObjectShapeProjectionMethods(
        input,
        fact,
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

function isSourceDeclaredNominalShape(fact: CsharpObjectShapeFact): boolean {
  return fact.targetType.kind === "target-named" &&
    (fact.targetType as {
      readonly csharpSourceDeclarationKind?: unknown;
    }).csharpSourceDeclarationKind !== undefined;
}
