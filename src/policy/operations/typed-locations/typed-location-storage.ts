import type {
  Node,
  SourceFile,
} from "@tsonic/tsts";
import type {
  CsharpPolicyContext,
} from "../../context.js";
import {
  selectCsharpTargetElement,
  selectCsharpTargetProperty,
} from "../../members/index.js";
import {
  isCsharpValueTypeTargetType,
  targetTypeRefEquals,
  type TargetTypeRef,
} from "../../types/index.js";

export type CsharpTypedLocationStorage =
  | {
      readonly kind: "direct-storage";
      readonly expression: Node;
      readonly valueType: TargetTypeRef;
      readonly identity: CsharpTypedLocationDirectIdentity;
    }
  | {
      readonly kind: "reference-property-storage";
      readonly expression: Node;
      readonly valueType: TargetTypeRef;
      readonly memberIdentity: string;
    }
  | {
      readonly kind: "value-property-storage";
      readonly expression: Node;
      readonly valueType: TargetTypeRef;
      readonly memberIdentity: string;
      readonly receiverStorage: CsharpTypedLocationStorage;
    }
  | {
      readonly kind: "reference-element-storage";
      readonly expression: Node;
      readonly valueType: TargetTypeRef;
    };

export type CsharpTypedLocationDirectIdentity =
  | {
      readonly kind: "local-storage";
      readonly declaration: Node;
    }
  | {
      readonly kind: "static-storage";
      readonly identity: string;
    }
  | {
      readonly kind: "instance-member-storage";
      readonly memberIdentity: string;
    };

export type CsharpTypedLocationStorageSelection =
  | { readonly kind: "resolved"; readonly storage: CsharpTypedLocationStorage }
  | { readonly kind: "rejected"; readonly reason: string };

export function selectCsharpTypedLocationStorage(
  input: CsharpPolicyContext,
  expression: Node,
  valueType: TargetTypeRef,
  sourceFile: SourceFile,
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
        sourceFile,
        active,
      );
    }
    if (input.ast.is.IsElementAccessExpression(expression)) {
      return selectCsharpElementStorage(
        input,
        expression,
        valueType,
        sourceFile,
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
  sourceFile: SourceFile,
  active: WeakSet<Node>,
): CsharpTypedLocationStorageSelection {
  const selection = selectCsharpTargetProperty(input, expression, sourceFile);
  if (selection.kind !== "resolved" && selection.kind !== "source-owned") {
    const reason = selection.kind === "rejected"
      ? selection.diagnostic.message
      : selection.reason;
    return storageRejected(
      `The selected writable property has no exact C# member relation: ${reason}`,
    );
  }
  const source = selection.source;
  if (!source.writable || source.optionalChain) {
    return storageRejected(
      "The selected property is not an exact writable C# member location.",
    );
  }
  const isStatic = selection.kind === "resolved"
    ? selection.receiver.kind === "none"
    : source.selectedDeclaration !== undefined &&
      input.ast.hasModifierKind(source.selectedDeclaration, "static");
  const memberIdentity = selection.kind === "resolved"
    ? `target-member:${selection.targetMember.id}`
    : selectedSourceStorageIdentity(
        input,
        source.selectedDeclaration,
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
  const receiverType = input.types.resolveSelectedValue(
    source.receiver.expression,
    source.receiver.type,
    sourceFile,
  );
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
    source.receiver.expression,
    receiverType,
    sourceFile,
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
  sourceFile: SourceFile,
): CsharpTypedLocationStorageSelection {
  const selection = selectCsharpTargetElement(input, expression, sourceFile);
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
  if (!source.writable || source.optionalChain) {
    return storageRejected(
      "The selected element is not an exact writable C# index location.",
    );
  }
  const receiverType = input.types.resolveSelectedValue(
    source.receiver.expression,
    source.receiver.type,
    sourceFile,
  );
  const receiverKind = classifyCsharpStorageReceiver(receiverType);
  if (receiverType === undefined || receiverKind === "unknown") {
    return storageRejected(
      "The selected element receiver is neither a proven C# reference nor value type.",
    );
  }
  if (receiverType.kind !== "array" || receiverKind !== "reference") {
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
  sourceFile: SourceFile,
  active: WeakSet<Node>,
): CsharpTypedLocationStorageSelection {
  const storage = input.semantics(sourceFile).getResolvedStorageInfo(receiver);
  if (storage === undefined || !storage.writable) {
    return storageRejected(
      "A value-type storage receiver has no exact writable owner location.",
    );
  }
  const selectedStorageType = input.types.resolveSelectedValue(
    storage.storageExpression,
    storage.type,
    sourceFile,
  );
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
    sourceFile,
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
  if (!input.navigation.isProjectDeclaration(declaration)) {
    return undefined;
  }
  const sourceFile = input.ast.getSourceFile(declaration);
  const syntaxKind = input.ast.kind(declaration);
  if (sourceFile === undefined || syntaxKind === undefined) {
    return undefined;
  }
  const outputIdentity = input.outputIdentities.resolveRequired(
    input.ast.getFileName(sourceFile),
  );
  return [
    category,
    outputIdentity.artifactPath,
    syntaxKind,
    input.ast.pos(declaration),
    input.ast.end(declaration),
  ].join("\u0000");
}

function classifyCsharpStorageReceiver(
  type: TargetTypeRef | undefined,
): "reference" | "value" | "unknown" {
  if (type === undefined) {
    return "unknown";
  }
  if (isCsharpValueTypeTargetType(type)) {
    return "value";
  }
  switch (type.kind) {
    case "array":
    case "target-named":
      return "reference";
    case "source-primitive":
    case "tuple":
    case "pointer":
    case "function-pointer":
      return "value";
    case "source-global":
    case "type-parameter":
    case "opaque":
    case "associated-type":
    case "lifetime":
    case "target-specific":
      return "unknown";
  }
}

function storageRejected(reason: string): CsharpTypedLocationStorageSelection {
  return { kind: "rejected", reason };
}
