import type { SourceElementAccessRecord } from "@tsonic/target-api/source";
import type { CsharpRepresentation } from "../../../representation/index.js";
import type { TargetTypeRef } from "../../../policy/types/index.js";
import { targetTypeRefEquals } from "../../../policy/types/index.js";
import type { CsharpProviderCallSelectionHost } from "../../../policy/model/provider-calls.js";

const represented = (representation: CsharpRepresentation): TargetTypeRef | undefined =>
  representation.kind === "csharp-refused" ? undefined : representation;

export type CsharpProjectElementSelection =
  | { readonly kind: "not-project-indexer" }
  | { readonly kind: "rejected"; readonly reason: string }
  | {
      readonly kind: "resolved";
      readonly source: SourceElementAccessRecord;
      readonly keyType: TargetTypeRef;
      readonly valueType: TargetTypeRef;
      readonly selectedReadType?: TargetTypeRef;
    };

export function selectCsharpProjectElement(
  host: CsharpProviderCallSelectionHost,
  source: SourceElementAccessRecord,
): CsharpProjectElementSelection {
  const declaration = source.selected.kind === "index-signature" ? source.selected.declaration : undefined;
  if (
    declaration === undefined ||
    !host.facts.navigation.identity.isProjectDeclaration(declaration) ||
    !host.ast.is.IsIndexSignatureDeclaration(declaration)
  ) {
    return { kind: "not-project-indexer" };
  }
  const parameters = host.ast.parameters(declaration).filter(
    (parameter): parameter is NonNullable<typeof parameter> =>
      parameter !== undefined,
  );
  const parameter = parameters[0];
  const keyTypeNode = parameter === undefined
    ? undefined
    : host.ast.typeNode(parameter);
  const valueTypeNode = host.ast.typeNode(declaration);
  if (
    parameters.length !== 1 ||
    parameter === undefined ||
    keyTypeNode === undefined ||
    valueTypeNode === undefined
  ) {
    return {
      kind: "rejected",
      reason:
        "The exact selected project index signature does not declare one authored key type and one authored value type.",
    };
  }
  const receiverType = represented(host.types.represent(source.receiverType, source.receiver, "value"));
  // The declared (uninstantiated) key and value slots of the index signature; projectTypes instantiates them.
  const declaredKeyType = represented(host.types.storage(parameter));
  const declaredValueType = represented(host.types.storage(declaration));
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
  const reads = source.access !== "write";
  const writes = source.access !== "read";
  const selectedReadType = reads ? represented(host.types.value(source.node)) : undefined;
  const selectedWriteType = writes ? represented(host.types.represent(source.result, source.node, "storage")) : undefined;
  if (reads && selectedReadType === undefined || writes && selectedWriteType === undefined) {
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
    source.access === "read-write" &&
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
