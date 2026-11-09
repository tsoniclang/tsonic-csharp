import type { Node, SourceFile } from "@tsonic/tsts";
import { failTargetAnalysisInvariant } from "@tsonic/target-api/artifacts";
import type { CsharpMemoryAnalysisHost, CsharpMemoryOutcome } from "../../policy/model/memory.js";
import type { CsharpTypedLocationStorageSelection, CsharpTypedLocationStorage } from "../../target-model/records/storage/typed-location-storage.js";
import type { TargetTypeRef } from "../../target-model/types/native-type-data.js";
import { targetTypeRefEquals } from "../../target-model/types/equality.js";
import { represented, sourceOutcome } from "../../policy/types/source-type-flow/representation-results.js";
import { classifyCsharpStorageReceiver } from "../../policy/operations/typed-locations/storage.js";
import { selectCsharpTargetElement, selectCsharpTargetProperty } from "../operations/members/selected-members.js";
import { selectCsharpShapeMemberByOrigins } from "../objects/shapes/member-origins.js";

type Outcome = CsharpMemoryOutcome<CsharpTypedLocationStorageSelection>;

export function selectCsharpTypedLocationStorage(input: CsharpMemoryAnalysisHost, expression: Node,
  valueType: TargetTypeRef, sourceFile: SourceFile, active: Set<Node>, receiverOwner = false): Outcome {
  if (active.has(expression)) return rejected("The selected writable storage contains a cyclic receiver relation.");
  active.add(expression);
  try {
    const selected = sourceOutcome(input.facts.protocols.storage(expression));
    if (selected.kind !== "represented") return selected;
    if (selected.value.kind === "none") return rejected("The original occurrence has no canonical Source storage place.");
    const source = selected.value.value;
    const ownedBinding = source.kind === "binding" && receiverOwner &&
      input.ast.is.IsVariableDeclaration(source.declaration) &&
      input.ast.as.AsVariableDeclaration(source.declaration)?.Initializer !== undefined;
    if (!source.writable && !ownedBinding) return rejected("The original Source place does not authorize writable storage.");
    if (source.kind === "binding") {
      const type = input.storageTargetType.get(source.declaration);
      if (type === undefined) failTargetAnalysisInvariant("tsonic-csharp",
        "Addressable declaration storage requires its completed canonical physical slot.", source.declaration);
      if (!targetTypeRefEquals(input.typeIdentity, type, valueType)) return rejected("The completed declared slot and pointer pointee have different Native carriers.");
      return directStorage(input, source.storage, type, source.declaration);
    }
    if (source.kind === "pointer") return rejected("A pointer place requires its own admitted Native ref-return storage operation.");
    const receiver = input.nativeValue(source.receiver.occurrence);
    if (receiver.kind !== "represented") return receiver;
    const receiverKind = classifyCsharpStorageReceiver(receiver.value);
    if (receiverKind === "unknown") return rejected("The actual Native receiver is neither proven reference nor value storage.");
    if (source.kind === "element") {
      if (receiver.value.kind === "array") {
        if (!targetTypeRefEquals(input.typeIdentity, receiver.value.element, valueType)) return rejected("The actual Native array element and pointer pointee differ.");
        return resolved({ kind: "reference-element-storage", expression: source.storage, valueType });
      }
      const element = selectCsharpTargetElement(input, expression, sourceFile);
      if (element.kind === "source-refused" || element.kind === "native-refused" || element.kind === "provider-refused") return element;
      if (element.kind === "rejected") return Object.freeze({ kind: "provider-refused", diagnostic: element.diagnostic });
      if (element.kind !== "resolved") return rejected("A nonarray writable index requires its exact Native indexed-location policy.");
      const parameter = element.targetMember.parameters[element.targetParameterIndex];
      if (receiverKind !== "reference" || element.invocation.kind !== "indexer" ||
        element.invocation.indexedLocationMethod === undefined ||
        !/^[A-Za-z_][A-Za-z0-9_]*$/u.test(element.invocation.indexedLocationMethod) ||
        element.receiver.kind !== "instance" || element.targetMember.kind !== "indexer" ||
        element.targetMember.readonly === true || element.targetMember.parameters.length !== 1 ||
        parameter?.passingMode !== "by-value" || element.targetMember.returnType === undefined ||
        !targetTypeRefEquals(input.typeIdentity, element.targetMember.returnType, valueType)) {
        return rejected("The complete Native indexer does not expose the required exact writable location ABI.");
      }
      return resolved({ kind: "reference-indexed-storage", expression: source.storage, valueType,
        receiverType: receiver.value, indexType: parameter.type, receiver: source.receiver.occurrence,
        index: source.key.occurrence, method: element.invocation.indexedLocationMethod });
    }
    const member = selectCsharpTargetProperty(input, expression, sourceFile);
    if (member.kind === "source-refused" || member.kind === "native-refused" || member.kind === "provider-refused") return member;
    if (member.kind === "rejected") return Object.freeze({ kind: "provider-refused", diagnostic: member.diagnostic });
    let identity: string;
    let physical: TargetTypeRef;
    let isStatic: boolean;
    if (member.kind === "resolved") {
      if (member.targetMember.readonly === true || member.targetMember.returnType === undefined) {
        return rejected("The exact Native member has no complete writable physical slot.");
      }
      physical = member.targetMember.returnType;
      identity = `target-member:${member.targetMember.id}`;
      isStatic = member.receiver.kind === "none";
    } else if (member.kind === "source-owned") {
      const shape = input.objectShapes.resolveTarget(receiver.value);
      if (shape === undefined) failTargetAnalysisInvariant("tsonic-csharp",
        "Addressable project members require their completed canonical Native object declaration.", expression);
      const publication = sourceOutcome(input.facts.objects.use(expression));
      if (publication.kind !== "represented") return publication;
      const origins = publication.value.arms.flatMap(arm => arm.kind === "member" ? arm.writeOrigins : []);
      const selected = selectCsharpShapeMemberByOrigins(shape, origins);
      if (selected === undefined) return rejected("Every Source write origin must identify the same actual Native member.");
      const emission = input.objectMembers.objectMember.get(shape, selected);
      if (emission === undefined) failTargetAnalysisInvariant("tsonic-csharp",
        "Addressable members require their completed canonical physical declaration.", expression);
      const declaration = emission.declaration;
      if (selected.readonly === true || declaration.kind !== "field" && declaration.kind !== "property" &&
        declaration.kind !== "accessor") return rejected("The selected Native member has no direct writable field/property storage.");
      physical = declaration.type;
      if (shape.targetType.kind !== "target-named") failTargetAnalysisInvariant("tsonic-csharp",
        "An addressable generated member requires its actual named Native declaration identity.", expression);
      identity = `native-member:${shape.targetType.id}:${selected.targetName}`;
      isStatic = false;
    } else return rejected("The published member does not select one directly addressable Native member.");
    if (!targetTypeRefEquals(input.typeIdentity, physical, valueType)) return rejected("The actual member slot and pointer pointee have different Native carriers.");
    if (isStatic) return resolved({ kind: "direct-storage", expression: source.storage, valueType,
      identity: { kind: "static-storage", identity } });
    if (receiverKind === "reference") return resolved({ kind: "reference-property-storage",
      expression: source.storage, valueType, memberIdentity: identity });
    const owner = selectCsharpTypedLocationStorage(input, source.receiver.occurrence, receiver.value, sourceFile, active, true);
    if (owner.kind !== "represented" || owner.value.kind === "rejected") return owner;
    return resolved({ kind: "value-property-storage", expression: source.storage, valueType,
      memberIdentity: identity, receiverStorage: owner.value.storage });
  } finally { active.delete(expression); }
}

function directStorage(input: CsharpMemoryAnalysisHost, expression: Node, valueType: TargetTypeRef,
  declaration: Node): Outcome {
  if ((input.ast.is.IsVariableDeclaration(declaration) || input.ast.is.IsBindingElement(declaration)) &&
    isPerIterationForInitializerDeclaration(input, declaration)) return rejected(
      "Addressing a for-initializer binding requires one function-scoped 'var' location; per-iteration 'let' locations require a dedicated C# loop-binding representation.");
  if (input.ast.is.IsBindingElement(declaration) && isFunctionScopedForOfBinding(input, declaration)) return rejected(
    "Addressing a destructured 'var' for-of binding requires a function-scoped destructuring-assignment representation; per-iteration declaration lowering cannot preserve that identity.");
  if (input.ast.is.IsParameterDeclaration(declaration) || input.ast.is.IsBindingElement(declaration) ||
    input.ast.is.IsVariableDeclaration(declaration) && !isModuleVariableDeclaration(input, declaration)) {
    return resolved({ kind: "direct-storage", expression, valueType, identity: { kind: "local-storage", declaration } });
  }
  const identity = input.sourceIdentities.node(declaration);
  if (!input.facts.navigation.isProjectDeclaration(declaration) || identity === undefined) {
    return rejected("The selected direct storage requires its exact original project declaration identity.");
  }
  if (input.ast.is.IsVariableDeclaration(declaration)) return resolved({ kind: "direct-storage", expression,
    valueType, identity: { kind: "static-storage", identity: `source-static-storage\u0000${identity}` } });
  if (input.ast.is.IsPropertyDeclaration(declaration)) return resolved({ kind: "direct-storage", expression, valueType,
    identity: input.ast.hasModifierKind(declaration, "static") ? { kind: "static-storage", identity: `source-member\u0000${identity}` }
      : { kind: "instance-member-storage", memberIdentity: `source-member\u0000${identity}` } });
  return rejected(`Selected direct declaration kind '${input.ast.kindName(declaration)}' has no canonical Native location identity.`);
}

function variableOwner(input: CsharpMemoryAnalysisHost, declaration: Node): Node | undefined {
  let current: Node | undefined = declaration;
  while (current !== undefined && (input.ast.is.IsBindingElement(current) ||
    input.ast.is.IsArrayBindingPattern(current) || input.ast.is.IsObjectBindingPattern(current))) current = input.ast.parent(current);
  return current !== undefined && input.ast.is.IsVariableDeclaration(current) ? current : undefined;
}

function isFunctionScopedForOfBinding(input: CsharpMemoryAnalysisHost, declaration: Node): boolean {
  const owner = variableOwner(input, declaration);
  const list = owner === undefined ? undefined : input.ast.parent(owner);
  const statement = list === undefined ? undefined : input.ast.parent(list);
  return list !== undefined && input.ast.is.IsVariableDeclarationList(list) && input.ast.variableDeclarationKind(list) === "var" &&
    statement !== undefined && input.ast.is.IsForOfStatement(statement);
}

function isPerIterationForInitializerDeclaration(input: CsharpMemoryAnalysisHost, declaration: Node): boolean {
  const owner = variableOwner(input, declaration);
  const list = owner === undefined ? undefined : input.ast.parent(owner);
  const statement = list === undefined ? undefined : input.ast.parent(list);
  return list !== undefined && input.ast.is.IsVariableDeclarationList(list) && input.ast.variableDeclarationKind(list) !== "var" &&
    statement !== undefined && input.ast.is.IsForStatement(statement);
}

function isModuleVariableDeclaration(input: CsharpMemoryAnalysisHost, declaration: Node): boolean {
  const list = input.ast.parent(declaration);
  const statement = list === undefined ? undefined : input.ast.parent(list);
  const scope = statement === undefined ? undefined : input.ast.parent(statement);
  return list !== undefined && input.ast.is.IsVariableDeclarationList(list) && statement !== undefined &&
    input.ast.is.IsVariableStatement(statement) && scope !== undefined && input.ast.is.IsSourceFile(scope);
}

function resolved(storage: CsharpTypedLocationStorage): Outcome {
  return represented(Object.freeze({ kind: "resolved", storage: Object.freeze(storage) }));
}

function rejected(reason: string): Outcome {
  return represented(Object.freeze({ kind: "rejected", reason }));
}
