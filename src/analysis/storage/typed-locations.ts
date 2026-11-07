import type { CsharpTypedLocationStorageSelection } from "../../target-model/records/storage/typed-location-storage.js";
import type { Node } from "@tsonic/tsts";
import { AsVariableDeclaration } from "@tsonic/target-api/source";
import type { CsharpPolicyContext } from "../../policy/model/context.js";
import { selectCsharpTargetProperty } from "../operations/members/selected-members.js";
import { selectCsharpTargetElement } from "../operations/members/selected-members.js";
import { targetTypeRefEquals, type TargetTypeRef } from "../../policy/types/index.js";

import { classifyCsharpStorageReceiver } from "../../policy/operations/typed-locations/storage.js";

/**
 * The location an access names can be assigned: the Host storage selection's `writable` (the checker storage witness:
 * not const, readonly or getter-only), independent of whether this use reads or writes it (an address-of reads).
 */
function csharpStorageWritable(input: CsharpPolicyContext, expression: Node): boolean {
  return input.facts.selections.storage(expression)?.writable === true;
}

/** A represented receiver value, or undefined when .NET refuses it (reported at its value read). */
function csharpReceiverType(input: CsharpPolicyContext, receiver: Node): TargetTypeRef | undefined {
  const represented = input.types.value(receiver);
  return represented.kind === "csharp-refused" ? undefined : represented;
}
export function selectCsharpTypedLocationStorage(
  input: CsharpPolicyContext,
  expression: Node,
  valueType: TargetTypeRef,
  active: WeakSet<Node>,
  selectedDeclaration: Node | undefined,
): CsharpTypedLocationStorageSelection {
  if (active.has(expression)) {
    return storageRejected(
      "The selected writable storage contains a cyclic receiver relation.",
    );
  }
  active.add(expression);
  try {
    if (input.ast.is.IsIdentifier(expression)) {
      return selectCsharpDirectStorage(
        input,
        expression,
        valueType,
        selectedDeclaration,
      );
    }
    if (input.ast.is.IsPropertyAccessExpression(expression)) {
      return selectCsharpPropertyStorage(
        input,
        expression,
        valueType,
        active,
      );
    }
    if (input.ast.is.IsElementAccessExpression(expression)) {
      return selectCsharpElementStorage(
        input,
        expression,
        valueType,
      );
    }
    return storageRejected(
      `Writable source storage kind '${input.ast.kindName(expression)}' has no C# typed-location operation.`,
    );
  } finally {
    active.delete(expression);
  }
}

function selectCsharpPropertyStorage(
  input: CsharpPolicyContext,
  expression: Node,
  valueType: TargetTypeRef,
  active: WeakSet<Node>,
): CsharpTypedLocationStorageSelection {
  const selection = selectCsharpTargetProperty(input, expression);
  if (selection.kind === "union-property") return storageRejected(
    "A native union operation is not one directly addressable writable property.");
  if (selection.kind !== "resolved" && selection.kind !== "source-owned") {
    const reason = selection.kind === "rejected"
      ? selection.diagnostic.message
      : selection.reason;
    return storageRejected(
      `The selected writable property has no exact C# member relation: ${reason}`,
    );
  }
  const source = selection.source;
  const selectedDeclaration = source.selected.kind === "member" ? source.selected.declarations[0] : undefined;
  if (!csharpStorageWritable(input, expression) || source.optionalChain) {
    return storageRejected(
      "The selected property is not an exact writable C# member location.",
    );
  }
  const isStatic = selection.kind === "resolved"
    ? selection.receiver.kind === "none"
    : selectedDeclaration !== undefined &&
      input.ast.hasModifierKind(selectedDeclaration, "static");
  const memberIdentity = selection.kind === "resolved"
    ? `target-member:${selection.targetMember.id}`
    : selectedSourceStorageIdentity(
        input,
        selectedDeclaration,
        "source-member",
      );
  if (memberIdentity === undefined) {
    return storageRejected(
      "The selected writable property has no exact source or target member identity.",
    );
  }
  if (isStatic) {
    return {
      kind: "resolved",
      storage: {
        kind: "direct-storage",
        expression,
        valueType,
        identity: {
          kind: "static-storage",
          identity: memberIdentity,
        },
      },
    };
  }
  const receiverType = csharpReceiverType(input, source.receiver);
  const receiverKind = classifyCsharpStorageReceiver(receiverType);
  if (receiverType === undefined || receiverKind === "unknown") {
    return storageRejected(
      "The selected property receiver is neither a proven C# reference nor value type.",
    );
  }
  if (receiverKind === "reference") {
    return {
      kind: "resolved",
      storage: {
        kind: "reference-property-storage",
        expression,
        valueType,
        memberIdentity,
      },
    };
  }
  const receiverStorage = selectWritableReceiverStorage(
    input,
    source.receiver,
    receiverType,
    active,
  );
  return receiverStorage.kind === "rejected"
    ? receiverStorage
    : {
        kind: "resolved",
        storage: {
          kind: "value-property-storage",
          expression,
          valueType,
          memberIdentity,
          receiverStorage: receiverStorage.storage,
        },
      };
}

function selectCsharpElementStorage(
  input: CsharpPolicyContext,
  expression: Node,
  valueType: TargetTypeRef,
): CsharpTypedLocationStorageSelection {
  const selection = selectCsharpTargetElement(input, expression);
  if (
    selection.kind !== "resolved" &&
    selection.kind !== "project-indexer" &&
    selection.kind !== "source-owned"
  ) {
    const reason = selection.kind === "rejected"
      ? selection.diagnostic.message
      : selection.reason;
    return storageRejected(
      `The selected writable element has no exact C# member relation: ${reason}`,
    );
  }
  const source = selection.source;
  if (!csharpStorageWritable(input, expression) || source.optionalChain) {
    return storageRejected(
      "The selected element is not an exact writable C# index location.",
    );
  }
  const receiverType = csharpReceiverType(input, source.receiver);
  const receiverKind = classifyCsharpStorageReceiver(receiverType);
  if (receiverType === undefined || receiverKind === "unknown") {
    return storageRejected(
      "The selected element receiver is neither a proven C# reference nor value type.",
    );
  }
  if (receiverType.kind !== "array" || receiverKind !== "reference") {
    const indexExpression = input.ast.as.AsElementAccessExpression(expression)?.ArgumentExpression;
    const index = selection.kind === "resolved"
      ? selection.targetMember.parameters[selection.targetParameterIndex] : undefined;
    if (receiverKind === "reference" && selection.kind === "resolved" &&
      selection.invocation.kind === "indexer" && selection.invocation.indexedLocationMethod !== undefined &&
      /^[A-Za-z_][A-Za-z0-9_]*$/u.test(selection.invocation.indexedLocationMethod) &&
      selection.receiver.kind === "instance" && selection.targetMember.kind === "indexer" &&
      selection.targetMember.readonly !== true && index !== undefined &&
      selection.targetMember.parameters.length === 1 && index.passingMode === "by-value" &&
      selection.targetMember.returnType !== undefined &&
      targetTypeRefEquals(selection.targetMember.returnType, valueType) && indexExpression !== undefined) {
      return { kind: "resolved", storage: {
        kind: "reference-indexed-storage", expression, valueType, receiverType, indexType: index.type,
        receiver: source.receiver, index: indexExpression,
        method: selection.invocation.indexedLocationMethod,
      } };
    }
    return storageRejected(
      "C# typed-location element storage requires the exact built-in array representation; provider and project indexers require an explicit canonical location-identity policy.",
    );
  }
  return {
    kind: "resolved",
    storage: {
      kind: "reference-element-storage",
      expression,
      valueType,
    },
  };
}

function selectWritableReceiverStorage(
  input: CsharpPolicyContext,
  receiver: Node,
  receiverType: TargetTypeRef,
  active: WeakSet<Node>,
): CsharpTypedLocationStorageSelection {
  const storage = input.facts.selections.storage(receiver);
  const variable = storage?.declaration === undefined
    ? undefined
    : AsVariableDeclaration(input.ast, storage.declaration);
  const ownsMutableFields = storage !== undefined &&
    input.ast.is.IsIdentifier(storage.storageExpression) &&
    variable?.Initializer !== undefined;
  if (storage === undefined || (!storage.writable && !ownsMutableFields)) {
    return storageRejected(
      "A value-type storage receiver has no exact writable owner location.",
    );
  }
  const readStorage = input.types.readStorage(storage.storageExpression);
  const selectedStorageType = readStorage.kind === "csharp-refused" ? undefined : readStorage;
  if (
    selectedStorageType === undefined ||
    !targetTypeRefEquals(selectedStorageType, receiverType)
  ) {
    return storageRejected(
      "A value-type storage receiver and its writable owner do not have one exact C# target type.",
    );
  }
  return selectCsharpTypedLocationStorage(
    input,
    storage.storageExpression,
    receiverType,
    active,
    storage.declaration,
  );
}

function selectCsharpDirectStorage(
  input: CsharpPolicyContext,
  expression: Node,
  valueType: TargetTypeRef,
  declaration: Node | undefined,
): CsharpTypedLocationStorageSelection {
  if (declaration !== undefined && (
    input.ast.is.IsImportSpecifier(declaration) || input.ast.is.IsImportClause(declaration)
  )) {
    declaration = input.facts.navigation.identity.target(expression)?.declaration;
  }
  if (declaration === undefined) {
    return storageRejected(
      "The selected direct writable storage has no exact declaration evidence.",
    );
  }
  if (
    (input.ast.is.IsVariableDeclaration(declaration) ||
      input.ast.is.IsBindingElement(declaration)) &&
    isPerIterationForInitializerDeclaration(input, declaration)
  ) {
    return storageRejected(
      "Addressing a for-initializer binding requires one function-scoped 'var' location; per-iteration 'let' locations require a dedicated C# loop-binding representation.",
    );
  }
  if (
    input.ast.is.IsBindingElement(declaration) &&
    isFunctionScopedForOfBinding(input, declaration)
  ) {
    return storageRejected(
      "Addressing a destructured 'var' for-of binding requires a function-scoped destructuring-assignment representation; per-iteration declaration lowering cannot preserve that identity.",
    );
  }
  if (input.ast.is.IsParameterDeclaration(declaration)) {
    return {
      kind: "resolved",
      storage: {
        kind: "direct-storage",
        expression,
        valueType,
        identity: { kind: "local-storage", declaration },
      },
    };
  }
  if (input.ast.is.IsBindingElement(declaration)) {
    return {
      kind: "resolved",
      storage: {
        kind: "direct-storage",
        expression,
        valueType,
        identity: { kind: "local-storage", declaration },
      },
    };
  }
  if (input.ast.is.IsVariableDeclaration(declaration)) {
    if (isModuleVariableDeclaration(input, declaration)) {
      const identity = selectedSourceStorageIdentity(
        input,
        declaration,
        "source-static-storage",
      );
      return identity === undefined
        ? storageRejected(
            "The selected module storage has no stable source declaration identity.",
          )
        : {
            kind: "resolved",
            storage: {
              kind: "direct-storage",
              expression,
              valueType,
              identity: { kind: "static-storage", identity },
            },
          };
    }
    return {
      kind: "resolved",
      storage: {
        kind: "direct-storage",
        expression,
        valueType,
        identity: { kind: "local-storage", declaration },
      },
    };
  }
  if (input.ast.is.IsPropertyDeclaration(declaration)) {
    const identity = selectedSourceStorageIdentity(
      input,
      declaration,
      "source-member",
    );
    if (identity === undefined) {
      return storageRejected(
        "The selected direct member storage has no stable source declaration identity.",
      );
    }
    return {
      kind: "resolved",
      storage: {
        kind: "direct-storage",
        expression,
        valueType,
        identity: input.ast.hasModifierKind(declaration, "static")
          ? { kind: "static-storage", identity }
          : {
              kind: "instance-member-storage",
              memberIdentity: identity,
            },
      },
    };
  }
  return storageRejected(
    `Selected direct writable declaration kind '${input.ast.kindName(declaration)}' has no canonical C# location identity.`,
  );
}

function isFunctionScopedForOfBinding(
  input: CsharpPolicyContext,
  declaration: Node,
): boolean {
  let current: Node | undefined = declaration;
  while (
    current !== undefined &&
    (input.ast.is.IsBindingElement(current) ||
      input.ast.is.IsArrayBindingPattern(current) ||
      input.ast.is.IsObjectBindingPattern(current))
  ) {
    current = input.ast.parent(current);
  }
  if (current === undefined || !input.ast.is.IsVariableDeclaration(current)) {
    return false;
  }
  const declarationList = input.ast.parent(current);
  const iteration = declarationList === undefined
    ? undefined
    : input.ast.parent(declarationList);
  return declarationList !== undefined &&
    input.ast.is.IsVariableDeclarationList(declarationList) &&
    input.ast.variableDeclarationKind(declarationList) === "var" &&
    iteration !== undefined &&
    input.ast.is.IsForOfStatement(iteration);
}

function isPerIterationForInitializerDeclaration(
  input: CsharpPolicyContext,
  declaration: Node,
): boolean {
  let current: Node | undefined = declaration;
  while (current !== undefined) {
    if (input.ast.is.IsVariableDeclaration(current)) {
      const declarationList = input.ast.parent(current);
      const containingStatement = declarationList === undefined
        ? undefined
        : input.ast.parent(declarationList);
      return declarationList !== undefined &&
        input.ast.is.IsVariableDeclarationList(declarationList) &&
        containingStatement !== undefined &&
        input.ast.is.IsForStatement(containingStatement) &&
        input.ast.variableDeclarationKind(declarationList) !== "var";
    }
    if (
      !input.ast.is.IsBindingElement(current) &&
      !input.ast.is.IsArrayBindingPattern(current) &&
      !input.ast.is.IsObjectBindingPattern(current)
    ) {
      return false;
    }
    current = input.ast.parent(current);
  }
  return false;
}

function isModuleVariableDeclaration(
  input: CsharpPolicyContext,
  declaration: Node,
): boolean {
  const declarationList = input.ast.parent(declaration);
  const statement = declarationList === undefined
    ? undefined
    : input.ast.parent(declarationList);
  const parent = statement === undefined
    ? undefined
    : input.ast.parent(statement);
  return declarationList !== undefined &&
    input.ast.is.IsVariableDeclarationList(declarationList) &&
    statement !== undefined &&
    input.ast.is.IsVariableStatement(statement) &&
    parent !== undefined &&
    input.ast.is.IsSourceFile(parent);
}

function selectedSourceStorageIdentity(
  input: CsharpPolicyContext,
  declaration: Node | undefined,
  category: string,
): string | undefined {
  if (declaration === undefined) {
    return undefined;
  }
  if (!input.facts.navigation.identity.isProjectDeclaration(declaration)) {
    return undefined;
  }
  const identity = input.sourceIdentities.node(declaration);
  if (identity === undefined) {
    return undefined;
  }
  return [
    category,
    identity,
  ].join("\u0000");
}

function storageRejected(reason: string): CsharpTypedLocationStorageSelection {
  return { kind: "rejected", reason };
}
