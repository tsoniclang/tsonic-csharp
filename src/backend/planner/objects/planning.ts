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
import type { Node } from "@tsonic/tsts";
import type { CsharpObjectShapeDeclarationEmission } from "../../../target-model/records/objects/object-shape-emission.js";
import { failCsharpPlannerInvariant } from "../diagnostics.js";
import { csharpCompilationRequiresUnsafe, csharpObjectShapeSafetyModifiers } from "../safety/explicit-safety.js";
import { csharpTypeFromTargetTypeRef } from "../types/render.js";
import type {
  CsharpObjectShapeFact,
} from "../../../target-model/types/index.js";
import {
} from "../../../target-model/types/index.js";
import { renderObjectShapeInterfaces, csharpClosedValueCarrierInterfaceType } from "./interfaces.js";
import { renderObjectShapeMembers } from "./members.js";
import { renderObjectShapeTypeParameters } from "./type-parameters.js";
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


import { guardCsharpFrozenDataProperties } from "./frozen-data-properties.js";
import { renderCsharpStructuralInterfaceMembers } from "./structural-interfaces.js";
import { renderCsharpMethodValueContracts } from "./method-values.js";
import { csharpEnumerableKeysContract, renderCsharpEnumerableKeys } from "./enumerable-keys.js";
import { renderCsharpAuthoredObjectMethods } from "./authored-methods.js";
import { renderCsharpCaptureFrameMethods } from "./capture-methods.js";

export function csharpTypeFromObjectShapeFact(
  input: CsharpPlanningContext,
  fact: CsharpObjectShapeFact,
  _diagnostics?: TargetDiagnostic[],
  diagnosticSubject?: Node,
): CsharpTypeNode | undefined {
  const targetType = csharpTypeFromTargetTypeRef(fact.targetType, input.scope.typeParameterNames);
  if (targetType === undefined) return failCsharpPlannerInvariant(
    "An admitted object-shape artifact must carry its renderable target type.", diagnosticSubject);
  const selected = input.program.records.objectShapeEmission.get(fact);
  if (selected === undefined) failCsharpPlannerInvariant("An admitted object shape requires its sealed native materialization selection.", diagnosticSubject);
  return targetType;
}

export function csharpConstructibleTypeFromObjectShapeFact(
  input: CsharpPlanningContext,
  fact: CsharpObjectShapeFact,
  diagnostics?: TargetDiagnostic[],
  diagnosticSubject?: Node,
): CsharpTypeNode | undefined {
  if (fact.constructible === false) {
    failCsharpPlannerInvariant("An admitted object construction requires its exact native parameterless construction contract.", diagnosticSubject);
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
  return input.program.records.objectShapeDeclarations.get().map(selected => {
    const typeParameterNames = new Map([...input.scope.typeParameterNames ?? [],
      ...selected.artifact.typeParameterNames.map(parameter => [parameter.identity, parameter.name] as const)]);
    const declarationInput = { ...input, scope: { ...input.scope, typeParameterNames } };
    return renderObjectShapeDeclaration(declarationInput, selected, diagnostics);
  });
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
      name: input.program.records.compilation.get().namespace,
      members: declarations,
    }],
  };
  const finalized = finalizeCsharpCompilationUnit(
    unit,
    csharpCompilationRequiresUnsafe("object-shapes", input),
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
  selected: CsharpObjectShapeDeclarationEmission,
  diagnostics: TargetDiagnostic[],
): CsharpTypeDeclaration {
  const { artifact } = selected;
  const fact = artifact.fact;
  const { capabilities, projections } = artifact;
  const jsonSerializable = capabilities.includes("json-serialization");
  const referenceIdentity = capabilities.includes("reference-identity");
  const interfaces = renderObjectShapeInterfaces(input.scope.typeParameterNames, fact, undefined, undefined);
  const typeParameters = renderObjectShapeTypeParameters(
    input.scope.typeParameterNames,
    fact,
    input.program.records,
    undefined,
  );
  if (selected.representation === "interface") {
    const inheritedEnumerableKeys = selected.inheritedEnumerableKeys;
    const contractMembers = renderCsharpStructuralInterfaceMembers(input.scope.typeParameterNames, fact, input.program.records);
    if (contractMembers === undefined || interfaces === undefined || typeParameters === undefined) {
      failCsharpPlannerInvariant("A structural reference contract requires exact renderable member signatures.", fact.methodImplementation?.declaration);
    }
    return { kind: "InterfaceDeclaration", name: selected.name,
      objectShapeIdentity: selected.identity, modifiers: ["public", ...csharpObjectShapeSafetyModifiers(input, fact)], typeParameters,
      interfaces: [...interfaces, ...(jsonSerializable ? [csharpJsonValueInterfaceType()] : []),
        ...(referenceIdentity ? [csharpClosedValueCarrierInterfaceType()] : [])],
      members: [...contractMembers, ...(capabilities.includes("enumerable-keys") && !inheritedEnumerableKeys ? [csharpEnumerableKeysContract(fact, input.program.records.nativeMemberHiding)] : []),
        ...renderObjectShapeProjectionMethods(input, projections, diagnostics)] };
  }
  const members = renderObjectShapeMembers(
    input.scope.typeParameterNames,
    fact,
    input.program.records,
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
    failCsharpPlannerInvariant("An admitted object declaration requires its complete native member rendering.", fact.methodImplementation?.declaration);
  }
  const objectShapeIdentity = selected.identity;
  return {
    kind: selected.representation === "struct" ? "StructDeclaration" : "ClassDeclaration",
    name: selected.name,
    ...(objectShapeIdentity === undefined ? {} : { objectShapeIdentity }),
    modifiers: ["public", ...csharpObjectShapeSafetyModifiers(input, fact)],
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
      ...guardCsharpFrozenDataProperties(fact, members, input, diagnostics),
      ...(jsonSerializable ? renderJsonSerializableObjectShapeMethod(fact, input.program.records) : []),
      ...renderObjectShapeProjectionMethods(
        input,
        projections,
        diagnostics,
      ),
    ],
  };
}
