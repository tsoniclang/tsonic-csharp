import {
  targetOperationFactKey,
} from "@tsonic/tsts";
import type {
  ExtensionObservationContext,
  Node,
  SourceFile,
  TargetTypeRef,
  Type,
} from "@tsonic/tsts";
import {
  csharpTargetOperationFactKey,
} from "../../../csharp-facts.js";
import {
  asNodeSubject,
  getNodeField,
  visitAstReaderNodes,
} from "../../ast-utils.js";
import {
  csharpTargetOperationFromMember,
  targetOperationFromMember,
} from "../../operations.js";
import {
  selectTargetMember,
} from "../../target-member-selection.js";
import {
  getDeclarationTypeNode,
} from "../../symbol-utils.js";
import type {
  TargetTypeRefResolutionOptions,
} from "../../target-type-ref-resolution.js";
import {
  getCsharpRecordDictionaryIndexerTargetMembers,
  isCsharpRecordDictionaryTargetType,
} from "../../dictionaries.js";
import {
  createRuntimeCarrierLifecycleObservationContext,
} from "../../runtime-carrier-context.js";
import type {
  CsharpOperationsProviderHost,
} from "../../operations-provider.js";

type CsharpRecordDictionaryElementAccessHost = Pick<
  CsharpOperationsProviderHost,
  "getCsharpTargetBindingByTargetId" | "getCsharpTargetBindingByMetadataName" | "getTargetTypeRefForSubject" | "getBaseTargetTypeRef"
> & {
  readonly getTargetTypeRefForType: (
    type: Type | undefined,
    context: ExtensionObservationContext,
    options?: TargetTypeRefResolutionOptions,
  ) => TargetTypeRef | undefined;
};

export function recordCsharpRecordDictionaryElementAccessFactsBeforeFinalization(
  lifecycleContext: { readonly host: ExtensionObservationContext["host"]; readonly compiler?: ExtensionObservationContext["compiler"] },
  host: CsharpRecordDictionaryElementAccessHost,
): void {
  const compiler = lifecycleContext.compiler;
  if (compiler === undefined) {
    return;
  }
  const context = createRuntimeCarrierLifecycleObservationContext(lifecycleContext);
  for (const sourceFile of compiler.getSourceFiles()) {
    if (sourceFile === undefined || sourceFile.IsDeclarationFile === true) {
      continue;
    }
    visitAstReaderNodes(compiler.ast, sourceFile, (node) => {
      if (!compiler.ast.is.IsElementAccessExpression(node) || lifecycleContext.host.facts.get(node, targetOperationFactKey) !== undefined) {
        return;
      }
      const receiver = asNodeSubject(getNodeField(node, "Expression"));
      const argument = asNodeSubject(getNodeField(node, "ArgumentExpression"));
      if (receiver === undefined || argument === undefined) {
        return;
      }
      const sourceFile = compiler.ast.getSourceFile(node);
      const receiverType = host.getTargetTypeRefForSubject(receiver, context, { allowRuntimeCarrier: false, sourceFile } satisfies TargetTypeRefResolutionOptions) ??
        getCheckedReceiverTargetTypeRef(compiler, sourceFile, receiver, context, host) ??
        host.getTargetTypeRefForSubject(getDeclarationTypeNode(receiver, context), context, { allowRuntimeCarrier: false, allowSemanticTypeQuery: false, sourceFile } satisfies TargetTypeRefResolutionOptions);
      if (!isCsharpRecordDictionaryTargetType(receiverType)) {
        return;
      }
      const candidates = getCsharpRecordDictionaryIndexerTargetMembers(receiverType, host);
      const member = candidates.length === 1
        ? candidates[0]
        : selectTargetMember(candidates, { arguments: [argument] }, context, host.getTargetTypeRefForSubject, {
            getBaseTargetTypeRef: host.getBaseTargetTypeRef,
          });
      if (member === undefined) {
        return;
      }
      lifecycleContext.host.facts.set(node, targetOperationFactKey, targetOperationFromMember(member), [{ message: "C# Record dictionary indexer selected from finalized TypeScript Record carrier and provider-owned Dictionary indexer facts." }]);
      lifecycleContext.host.facts.set(node, csharpTargetOperationFactKey, csharpTargetOperationFromMember(member), [{ message: "C# Record dictionary indexer operation finalized from provider-owned Dictionary indexer facts." }]);
    });
  }
}

function getCheckedReceiverTargetTypeRef(
  compiler: NonNullable<ExtensionObservationContext["compiler"]>,
  sourceFile: SourceFile | undefined,
  receiver: Node,
  context: ExtensionObservationContext,
  host: CsharpRecordDictionaryElementAccessHost,
): TargetTypeRef | undefined {
  if (sourceFile === undefined) {
    return undefined;
  }
  return host.getTargetTypeRefForType(
    compiler.checker.getTypeAtLocation(receiver, { sourceFile }),
    context,
    { allowRuntimeCarrier: false, sourceFile },
  );
}
