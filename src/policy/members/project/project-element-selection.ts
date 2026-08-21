import type {
  SourceFile,
} from "@tsonic/tsts";
import type { SourceFileSemantics } from "@tsonic/target-api/source";
import type {
  TargetTypeRef,
} from "../../types/index.js";
import {
  targetTypeRefEquals,
} from "../../types/index.js";
import type {
  CsharpProviderCallSelectionHost,
} from "../selection/call-selection.js";

type ResolvedSourceElementAccessInfo = NonNullable<
  ReturnType<SourceFileSemantics["operations"]["elementAccess"]>
>;

export type CsharpProjectElementSelection =
  | { readonly kind: "not-project-indexer" }
  | { readonly kind: "rejected"; readonly reason: string }
  | {
      readonly kind: "resolved";
      readonly source: ResolvedSourceElementAccessInfo;
      readonly keyType: TargetTypeRef;
      readonly valueType: TargetTypeRef;
      readonly selectedReadType?: TargetTypeRef;
    };

export function selectCsharpProjectElement(
  host: CsharpProviderCallSelectionHost,
  source: ResolvedSourceElementAccessInfo,
  sourceFile: SourceFile,
): CsharpProjectElementSelection {
  const declaration = source.selectedDeclaration;
  if (
    declaration === undefined ||
    !host.navigation.isProjectDeclaration(declaration) ||
    !host.ast.is.IsIndexSignatureDeclaration(declaration)
  ) {
    return { kind: "not-project-indexer" };
  }
  const parameters = host.ast.parameters(declaration).filter(
    (parameter): parameter is NonNullable<typeof parameter> =>
      parameter !== undefined,
  );
  const parameter = parameters[0];
  const declarationSourceFile = host.ast.getSourceFile(declaration);
  const keyTypeNode = parameter === undefined
    ? undefined
    : host.ast.typeNode(parameter);
  const valueTypeNode = host.ast.typeNode(declaration);
  if (
    parameters.length !== 1 ||
    parameter === undefined ||
    declarationSourceFile === undefined ||
    keyTypeNode === undefined ||
    valueTypeNode === undefined
  ) {
    return {
      kind: "rejected",
      reason:
        "The exact selected project index signature does not declare one authored key type and one authored value type.",
    };
  }
  const receiverType = host.types.resolveSelectedValue(
    source.receiver.expression,
    source.receiver.type,
    sourceFile,
  );
  const declaredKeyType = host.types.resolveNode(
    keyTypeNode,
    declarationSourceFile,
  );
  const declaredValueType = host.types.resolveNode(
    valueTypeNode,
    declarationSourceFile,
  );
  if (
    receiverType === undefined ||
    declaredKeyType === undefined ||
    declaredValueType === undefined
  ) {
    return {
      kind: "rejected",
      reason:
        "The exact selected project index signature does not close its receiver, key, and value target types.",
    };
  }
  const key = host.projectTypes.instantiateMemberType(
    declaration,
    receiverType,
    declaredKeyType,
  );
  const value = host.projectTypes.instantiateMemberType(
    declaration,
    receiverType,
    declaredValueType,
  );
  if (key.kind !== "resolved" || value.kind !== "resolved") {
    return {
      kind: "rejected",
      reason:
        `The exact selected project index signature could not be instantiated. ${key.kind === "unresolved" ? key.reason : "The key is not project-owned."} ${value.kind === "unresolved" ? value.reason : "The value is not project-owned."}`,
    };
  }
  const selectedReadType = source.sourceReadType === undefined
    ? undefined
    : host.types.resolveSelectedResult(
        declaration,
        source.sourceReadType,
        sourceFile,
      );
  const selectedWriteType = source.sourceWriteType === undefined
    ? undefined
    : host.types.resolveSelectedResult(
        declaration,
        source.sourceWriteType,
        sourceFile,
      );
  if (
    source.sourceReadType !== undefined && selectedReadType === undefined ||
    source.sourceWriteType !== undefined && selectedWriteType === undefined
  ) {
    return {
      kind: "rejected",
      reason:
        "The exact selected project index operation does not close its checked read/write target type.",
    };
  }
  if (
    selectedWriteType !== undefined &&
    (
      host.ast.hasModifierKind(declaration, "readonly") ||
      !targetTypeRefEquals(value.type, selectedWriteType)
    )
  ) {
    return {
      kind: "rejected",
      reason:
        "The exact selected project index write does not match one writable C# indexer storage type.",
    };
  }
  if (
    source.accessMode === "read-write" &&
    selectedReadType !== undefined &&
    !targetTypeRefEquals(value.type, selectedReadType)
  ) {
    return {
      kind: "rejected",
      reason:
        "A read-write project index operation cannot project its lvalue through a distinct flow-read representation.",
    };
  }
  return {
    kind: "resolved",
    source,
    keyType: key.type,
    valueType: value.type,
    ...(selectedReadType === undefined ? {} : { selectedReadType }),
  };
}
