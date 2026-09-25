import type { CsharpPlanningContext } from "../../context.js";
import { AsClassDeclaration, AsInterfaceDeclaration, AsPropertySignatureDeclaration, KindInterfaceDeclaration, KindPropertySignature, SourceKind } from "@tsonic/target-api/source";
import type { Node, SourceFile } from "@tsonic/tsts";
import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import type { CsharpClassDeclaration } from "../../../target-ast/roslyn/index.js";
import { planAttributesForSubject } from "../attributes.js";
import { planClassHeritage } from "./heritage.js";
import { diagnoseTypeScriptOnlyRuntimeShapeModifiers } from "../modifiers.js";
import { csharpReferenceIdentityInterfaceType } from "../../objects/declarations/interfaces.js";
import { planCsharpStructuralInterfaceMethods } from "../interfaces/structural.js";
import { planIdentifierName } from "../../names/source-identifiers.js";
import { planOuterTypeParameters, planTypeParameters } from "../../types/type-parameters.js";
import { planClassMembers } from "./members.js";
import { csharpJsonValueInterfaceType, objectShapeRequiresJsonSerialization, renderJsonSerializableObjectShapeMethod } from "../../objects/json-object-shapes.js";
import { getCsharpObjectShapeFactForNode } from "../../objects/fact-queries.js";
import { registerSourceObjectShape } from "../../objects/index.js";
import { planImplicitForwardingConstructors } from "../../project/type-constructors.js";
import { csharpTypeFromTargetTypeRef } from "../../types/target-types.js";
import { unsupportedNodeDiagnostic } from "../../diagnostics.js";
import { csharpSafetyModifiersForDeclaration } from "../../safety/explicit-safety.js";
import { guardCsharpFrozenDataProperties } from "../../objects/frozen-data-properties.js";
import { createCsharpMemberPlanningContext } from "../../context.js";
import { completeLocalClassConstructor } from "./factories.js";

export function planClassDeclaration(
  node: Node,
  sourceFile: SourceFile,
  input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[],
): CsharpClassDeclaration {
  input = createCsharpMemberPlanningContext(input);
  const declaration = input.program.source.ast.is.IsClassExpression(node)
    ? input.program.source.ast.as.AsClassExpression(node)! : AsClassDeclaration(input.program.source.ast, node)!;
  diagnoseTypeScriptOnlyRuntimeShapeModifiers(input.program.source.ast, node, "class declaration", diagnostics, ["abstract"]);
  const factory = input.program.classFactories.get(node);
  const staticCompanion = input.types.projectTypes.definitionContainingDeclaration(node)?.staticCompanion === true;
  const className = factory?.instanceName ?? planIdentifierName(declaration.name, "AnonymousClass", input, diagnostics, "Class name");
  const heritage = planClassHeritage(node, input, diagnostics);
  const autoPropertyNames = new Set(getImplementedInterfacePropertyNames(node, input));
  const objectShape = getCsharpObjectShapeFactForNode(node, sourceFile, input);
  const structuralInterfaces = objectShape?.implements ?? [];
  const interfaces = [...heritage.interfaces];
  if (factory?.identity !== undefined) interfaces.push(csharpTypeFromTargetTypeRef(factory.identity.type)!);
  for (const type of structuralInterfaces) {
    const rendered = csharpTypeFromTargetTypeRef(type);
    if (rendered === undefined) {
      diagnostics.push(unsupportedNodeDiagnostic(node, "An analyzed structural interface has no C# type representation."));
    } else if (!interfaces.some(existing => JSON.stringify(existing) === JSON.stringify(rendered))) {
      interfaces.push(rendered);
    }
  }
  if (structuralInterfaces.length > 0) for (const member of objectShape!.members) {
    if (member.memberKind === "property") autoPropertyNames.add(member.targetName);
  }
  if (objectShape !== undefined) {
    registerSourceObjectShape(input, objectShape, diagnostics, node);
  }
  const jsonSerializable = objectShape !== undefined && objectShapeRequiresJsonSerialization(input, objectShape);
  const referenceIdentity = objectShape !== undefined && input.artifacts.objectShapeHasCapability(objectShape, "reference-identity");
  if (objectShape !== undefined && input.artifacts.objectShapeHasCapability(objectShape, "js-freeze") && heritage.baseType !== undefined) {
    diagnostics.push(unsupportedNodeDiagnostic(node, "Object.freeze over a source class with inherited native storage requires a closed base-field write contract."));
  }
  const memberNodes = (declaration.Members?.Nodes ?? []).filter(member => factory === undefined && !staticCompanion ||
    member === undefined || !input.program.source.ast.hasModifierKind(member, "static") && !input.program.source.ast.is.IsClassStaticBlockDeclaration(member));
  const members = planClassMembers(memberNodes, className, autoPropertyNames, sourceFile, input, diagnostics);
  const implicitConstructors = planImplicitForwardingConstructors(
    node,
    className,
    input,
    diagnostics,
  );
  const safetyDefaultConstructors = members.some((member) =>
      member.kind === "ConstructorDeclaration") ||
      implicitConstructors.length > 0
    ? []
    : defaultSafetyConstructors(node, className, input);
  const defaultFactoryConstructor = factory === undefined || members.some(member => member.kind === "ConstructorDeclaration") ||
    implicitConstructors.length !== 0 || safetyDefaultConstructors.length !== 0 ? [] : [{
      kind: "ConstructorDeclaration" as const, name: className, modifiers: ["public" as const],
      parameters: [], body: { kind: "Block" as const, statements: [] },
    }];
  return {
    kind: "ClassDeclaration",
    name: className,
    modifiers: input.program.source.ast.hasModifierKind(node, "abstract") ? ["public", "abstract"] : ["public"],
    attributes: planAttributesForSubject(node, sourceFile, input, diagnostics),
    typeParameters: [
      ...planOuterTypeParameters(node, input, diagnostics),
      ...planTypeParameters(declaration.TypeParameters?.Nodes ?? [], input, diagnostics, node),
    ],
    ...(heritage.baseType === undefined ? {} : { baseType: heritage.baseType }),
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
      ...implicitConstructors.map(constructor => factory === undefined ? constructor : completeLocalClassConstructor(constructor, factory, input, diagnostics)),
      ...[...safetyDefaultConstructors, ...defaultFactoryConstructor].map(member => factory !== undefined && member.kind === "ConstructorDeclaration"
        ? completeLocalClassConstructor(member, factory, input, diagnostics) : member),
      ...(factory?.retainsEnvironment ? [{ kind: "FieldDeclaration" as const, name: factory.environmentName,
        type: csharpTypeFromTargetTypeRef(factory.factoryType)!,
        modifiers: [factory.requiresInstanceTest ? "internal" as const : "private" as const, "readonly" as const] }] : []),
      ...(factory?.identity === undefined ? [] : [{ kind: "PropertyDeclaration" as const,
        name: factory.environmentName, explicitInterface: csharpTypeFromTargetTypeRef(factory.identity.type)!, modifiers: [],
        type: csharpTypeFromTargetTypeRef(factory.factoryType)!,
        getter: { kind: "Block" as const, statements: [{ kind: "ReturnStatement" as const, expression: {
          kind: "SimpleMemberAccessExpression" as const, receiver: { kind: "IdentifierName" as const, name: "this" }, name: factory.environmentName,
        } }] },
      }]),
      ...(objectShape === undefined ? [] : planCsharpStructuralInterfaceMethods(objectShape, node, input, diagnostics)),
      ...(objectShape !== undefined && input.artifacts.objectShapeHasCapability(objectShape, "js-freeze")
        ? guardCsharpFrozenDataProperties(objectShape, members, input, diagnostics) : members).map(member =>
          factory !== undefined && member.kind === "ConstructorDeclaration" ? completeLocalClassConstructor(member, factory, input, diagnostics) : member),
      ...(jsonSerializable && objectShape !== undefined
        ? renderJsonSerializableObjectShapeMethod(objectShape)
        : []),
      ...input.scope.generatedMethods!.values(),
    ],
  };
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

function getImplementedInterfacePropertyNames(
  classDeclaration: Node,
  input: CsharpPlanningContext,
): ReadonlySet<string> {
  const names = new Set<string>();
  const heritage = input.program.sourceNavigation.declaredHeritage(classDeclaration);
  if (heritage.kind !== "resolved") {
    return names;
  }
  for (const edge of heritage.edges) {
    if (edge.kind === "implements") {
      collectImplementedInterfacePropertyNames(
        edge.target.declaration,
        input,
        names,
        new Set<Node>(),
      );
    }
  }
  return names;
}

function collectImplementedInterfacePropertyNames(
  declaration: Node,
  input: CsharpPlanningContext,
  names: Set<string>,
  seen: Set<Node>,
): void {
  if (seen.has(declaration) || SourceKind(input.program.source.ast, declaration) !== KindInterfaceDeclaration) {
    return;
  }
  seen.add(declaration);
  const interfaceDeclaration = AsInterfaceDeclaration(input.program.source.ast, declaration);
  if (interfaceDeclaration === undefined) {
    return;
  }
  for (const member of interfaceDeclaration.Members?.Nodes ?? []) {
    if (SourceKind(input.program.source.ast, member) !== KindPropertySignature) {
      continue;
    }
    const property = AsPropertySignatureDeclaration(input.program.source.ast, member);
    const name = property?.name === undefined ? undefined : planIdentifierName(property.name, "PropertyDeclaration", input, [], "Interface property name");
    if (name !== undefined) {
      names.add(name);
    }
  }
  const heritage = input.program.sourceNavigation.declaredHeritage(declaration);
  if (heritage.kind !== "resolved") {
    return;
  }
  for (const edge of heritage.edges) {
    if (edge.kind === "extends") {
      collectImplementedInterfacePropertyNames(
        edge.target.declaration,
        input,
        names,
        seen,
      );
    }
  }
}
