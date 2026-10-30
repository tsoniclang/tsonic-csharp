import type { CsharpPlanningContext } from "../../context.js";
import { csharpObjectShapeArtifact } from "../../artifacts/object-shapes.js";
import { AsClassDeclaration } from "@tsonic/target-api/source";
import type { Node, SourceFile } from "@tsonic/tsts";
import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import type { CsharpClassDeclaration, CsharpConstructorDeclaration, CsharpStatement, CsharpParameter } from "../../../target-ast/syntax/index.js";
import { planAttributesForSubject } from "../attributes.js";
import { planClassHeritage } from "./heritage.js";
import { csharpClosedValueCarrierInterfaceType } from "../../objects/interfaces.js";
import { planCsharpStructuralInterfaceMembers } from "../interfaces/structural.js";
import { createCsharpTypeParameterPlanningContext } from "../../names/type-parameters.js";
import { planOuterTypeParameters, planTypeParameters } from "../../types/type-parameters.js";
import { planClassMembers } from "./members.js";
import {
  csharpJsonValueInterfaceType, objectShapeRequiresJsonSerialization, renderJsonSerializableObjectShapeMethod,
} from "../../objects/json-object-shapes.js";
import { getCsharpObjectShapeFactForNode } from "../../objects/fact-queries.js";
import { planImplicitForwardingConstructors } from "../../project/type-constructors.js";
import { csharpTypeFromTargetTypeRef } from "../../types/render.js";
import { csharpSafetyModifiersForDeclaration, withCsharpSafetyModifiers } from "../../safety/explicit-safety.js";
import { createCsharpMemberPlanningContext } from "../../context.js";
import { classFactoryContext, completeLocalClassConstructor } from "./factories.js";
import { planClassInitializationRegion } from "./initializers.js";
import { renderObjectShapeProjectionMethods } from "../../objects/closed-object-shapes.js";
import { planCsharpNativeMemberHiding } from "../modifiers.js";
import { failCsharpPlannerInvariant } from "../../diagnostics.js";

export interface CsharpPlannedClass {
  readonly declaration: CsharpClassDeclaration;
  readonly constructorParameters: readonly CsharpParameter[];
}

export function planClassDeclaration(
  node: Node,
  sourceFile: SourceFile,
  input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[],
): CsharpPlannedClass {
  input = createCsharpTypeParameterPlanningContext(node, createCsharpMemberPlanningContext(input));
  const declaration = input.program.source.ast.is.IsClassExpression(node)
    ? input.program.source.ast.as.AsClassExpression(node)! : AsClassDeclaration(input.program.source.ast, node)!;
  const factory = input.program.records.classFactory.get(node);
  const selected = input.program.records.nativeClass.get(node);
  if (selected === undefined) failCsharpPlannerInvariant("An admitted class requires its selected native declaration inventory.", node);
  const { staticCompanion, name: className } = selected;
  const objectShape = getCsharpObjectShapeFactForNode(node, sourceFile, input);
  const heritage = planClassHeritage(node, input);
  const interfaces = [...heritage.interfaces, csharpClosedValueCarrierInterfaceType()];
  if (factory?.identity !== undefined) interfaces.push(csharpTypeFromTargetTypeRef(factory.identity.type, input.scope.typeParameterNames)!);
  const jsonSerializable = objectShape !== undefined && objectShapeRequiresJsonSerialization(input, objectShape);
  const memberNodes = selected.instanceMembers;
  const initializerInput = factory === undefined ? input : classFactoryContext(factory,
    { kind: "IdentifierName", name: factory.environmentName }, input, diagnostics, "instance");
  const instanceRegion = planClassInitializationRegion(node, sourceFile, className, false, initializerInput, diagnostics, factory !== undefined);
  const staticRegion = factory !== undefined || staticCompanion ? undefined
    : planClassInitializationRegion(node, sourceFile, className, true, input, diagnostics);
  const memberPlan = planClassMembers(memberNodes, className, sourceFile, input, diagnostics,
    staticRegion === undefined ? [instanceRegion] : [instanceRegion, staticRegion]);
  const members = memberPlan.members;
  const implicitConstructors = planImplicitForwardingConstructors(
    node,
    className,
    input,
  );
  const safetyDefaultConstructors = selected.authoredConstructor !== undefined ||
      implicitConstructors.length > 0
    ? []
    : defaultSafetyConstructors(node, className, input);
  const requiresConstructor = instanceRegion.relocates;
  const completeConstructor = (constructor: CsharpConstructorDeclaration, initializers: readonly CsharpStatement[]): CsharpConstructorDeclaration => factory !== undefined
    ? completeLocalClassConstructor(constructor, factory, input, initializers, false)
    : { ...constructor, body: { kind: "Block", statements: [...initializers, ...constructor.body.statements] } };
  const defaultInitializationConstructor = !requiresConstructor || selected.authoredConstructor !== undefined ||
    implicitConstructors.length !== 0 || safetyDefaultConstructors.length !== 0 ? [] : [{
      kind: "ConstructorDeclaration" as const, name: className, modifiers: ["public" as const],
      parameters: [], body: { kind: "Block" as const, statements: [] },
    }];
  let constructorParameters: readonly CsharpParameter[];
  switch (selected.factoryConstructor) {
    case "authored":
      if (memberPlan.constructorParameters === undefined) failCsharpPlannerInvariant("An admitted authored class constructor requires its native parameter list.", node);
      constructorParameters = memberPlan.constructorParameters;
      break;
    case "implicit":
      if (implicitConstructors[0] === undefined) failCsharpPlannerInvariant("An admitted implicit class entry requires its native parameter list.", node);
      constructorParameters = implicitConstructors[0].parameters;
      break;
    case "default": constructorParameters = []; break;
  }
  return { constructorParameters, declaration: {
    kind: "ClassDeclaration",
    name: className,
    modifiers: withCsharpSafetyModifiers(selected.abstract ? ["public", "abstract"] : ["public"], node, "declaration", input),
    attributes: planAttributesForSubject(node, sourceFile, input, diagnostics),
    typeParameters: [
      ...planOuterTypeParameters(node, input, diagnostics),
      ...planTypeParameters(declaration.TypeParameters?.Nodes ?? [], input, diagnostics, node),
    ],
    ...(heritage.baseType === undefined ? {} : { baseType: heritage.baseType }),
    interfaces: [
      ...interfaces,
      ...(jsonSerializable ? [csharpJsonValueInterfaceType()] : []),
    ],
    members: [
      ...(staticRegion?.relocates ? [{ kind: "ConstructorDeclaration" as const, name: className,
        modifiers: ["static" as const], parameters: [], body: { kind: "Block" as const, statements: staticRegion.statements } }] : []),
      ...implicitConstructors.map(constructor => completeConstructor(constructor, instanceRegion.statements)),
      ...[...safetyDefaultConstructors, ...defaultInitializationConstructor].map(member => member.kind === "ConstructorDeclaration"
        ? completeConstructor(member, instanceRegion.statements) : member),
      ...(factory === undefined ? [] : [{ kind: "FieldDeclaration" as const, name: factory.environmentName,
        type: csharpTypeFromTargetTypeRef(factory.factoryType, input.scope.typeParameterNames)!,
        modifiers: ["internal" as const, "readonly" as const,
          ...planCsharpNativeMemberHiding(input.program.records.nativeMemberHiding, { kind: "source", declaration: node, role: "storage" })] }]),
      ...(factory?.identity === undefined ? [] : [{ kind: "PropertyDeclaration" as const,
        name: factory.environmentName, explicitInterface: csharpTypeFromTargetTypeRef(factory.identity.type, input.scope.typeParameterNames)!, modifiers: [],
        type: csharpTypeFromTargetTypeRef(factory.factoryType, input.scope.typeParameterNames)!,
        getter: { kind: "Block" as const, statements: [{ kind: "ReturnStatement" as const, expression: {
          kind: "SimpleMemberAccessExpression" as const, receiver: { kind: "IdentifierName" as const, name: "this" }, name: factory.environmentName,
        } }] },
      }]),
      ...(objectShape === undefined ? [] : planCsharpStructuralInterfaceMembers(objectShape, input, diagnostics)),
      ...members,
      ...(jsonSerializable && objectShape !== undefined
        ? renderJsonSerializableObjectShapeMethod(objectShape, input.program.records)
        : []),
      ...(objectShape === undefined ? [] : renderObjectShapeProjectionMethods(input,
        csharpObjectShapeArtifact(input, objectShape).projections, diagnostics)),
      ...input.scope.generatedMethods!.values(),
    ],
  } };
}

function defaultSafetyConstructors(
  declaration: Node,
  className: string,
  input: CsharpPlanningContext,
): CsharpClassDeclaration["members"] {
  const safetyModifiers = csharpSafetyModifiersForDeclaration(
    declaration,
    "constructor",
    input,
  );
  return safetyModifiers.length === 0
    ? []
    : [{
        kind: "ConstructorDeclaration",
        name: className,
        modifiers: ["public", ...safetyModifiers],
        parameters: [],
        body: { kind: "Block", statements: [] },
      }];
}
