import type {
  ExtensionFactSubject,
  ExtensionObservation,
  ExtensionObservationContext,
  RuntimeCarrierFactRequest,
  RuntimeCarrierFactResult,
  Node,
  SourceFile,
  TargetTypeRef,
  Type,
} from "@tsonic/tsts";
import {
  acceptObservation,
  deferObservation,
  selectedTargetSignatureFactKey,
} from "@tsonic/tsts";
import {
  asNodeSubject,
  getNodeField,
  isCsharpUserSourceFile,
  visitAstReaderNodes,
} from "../../../ast-utils.js";
import {
  createRuntimeCarrierLifecycleObservationContext,
} from "../../../runtime-carriers.js";
import {
  asType,
  resolveSelectedSourceLibraryMemberIdentity,
} from "../source-library.js";
import {
  isSourceStandardLibraryDateType,
} from "../../../source-type-classification.js";
import {
  csharpJsDateTargetType,
} from "./target-type.js";
import {
  setRuntimeCarrierFactIfUnresolved,
} from "../../../runtime-carrier-lifecycle/fact-writes.js";

export function mapCsharpJsDateRuntimeCarrier(
  request: RuntimeCarrierFactRequest,
  context: ExtensionObservationContext<"type.resolveRuntimeCarrier">,
): ExtensionObservation<RuntimeCarrierFactResult> {
  const carrier = getCsharpJsDateRuntimeCarrierForType(asType(request.type), context);
  return carrier === undefined
    ? deferObservation
    : acceptObservation<RuntimeCarrierFactResult>({
        carrier,
      }, [{ message: "C# JS surface Date runtime carrier mapped from checked JavaScript library type." }]);
}

export function getCsharpJsDateRuntimeCarrierForType(
  type: Type | undefined,
  context: ExtensionObservationContext,
): TargetTypeRef | undefined {
  return type !== undefined && isDateOrNullishDateUnion(type, context)
    ? csharpJsDateTargetType()
    : undefined;
}

function isDateOrNullishDateUnion(
  type: Type,
  context: ExtensionObservationContext,
): boolean {
  if (isSourceStandardLibraryDateType(type, context)) {
    return true;
  }
  const typeShape = context.compiler?.typeShape;
  if (typeShape === undefined || !typeShape.isUnion(type)) {
    return false;
  }
  const nonNullishMembers = typeShape.getUnionOrIntersectionTypes(type)
    .filter((member): member is Type => member !== undefined && !typeShape.isNullish(member));
  return nonNullishMembers.length > 0 &&
    nonNullishMembers.every((member) => isSourceStandardLibraryDateType(member, context));
}

export function recordCsharpJsDateRuntimeCarrierFactsBeforeFinalization(
  lifecycleContext: { readonly host: ExtensionObservationContext["host"]; readonly compiler?: ExtensionObservationContext["compiler"] },
): void {
  const compiler = lifecycleContext.compiler;
  if (compiler === undefined) {
    return;
  }
  const context = createRuntimeCarrierLifecycleObservationContext(lifecycleContext);
  for (const sourceFile of compiler.getSourceFiles()) {
    if (!isCsharpUserSourceFile(sourceFile, compiler.ast)) {
      continue;
    }
    visitAstReaderNodes(compiler.ast, sourceFile, (node) => {
      if (compiler.ast.is.IsTypeReferenceNode(node) && isCheckedSourceLibraryDateTypeReference(node, sourceFile, context)) {
        const typeName = asNodeSubject(getNodeField(node, "TypeName"));
        const type = compiler.checker.getTypeFromTypeNode(node, { sourceFile });
        const typeSymbol = type === undefined ? undefined : compiler.checker.getTypeSymbol(type);
        recordDateRuntimeCarrierFacts(lifecycleContext, [
          node,
          typeName,
          typeName === undefined ? undefined : compiler.checker.getSymbolAtLocation(typeName, { sourceFile }),
          typeName === undefined ? undefined : compiler.checker.getResolvedSymbol(typeName, { sourceFile }),
          type,
          typeSymbol,
        ], "C# JS surface Date runtime carrier recorded from checked TypeScript Date type reference.");
        return;
      }
      if (compiler.ast.is.IsNewExpression(node) !== true) {
        return;
      }
      if (!isCheckedSourceLibraryDateConstruction(node, sourceFile, context)) {
        return;
      }
      setRuntimeCarrierFactIfUnresolved(lifecycleContext, node, {
        carrier: csharpJsDateTargetType(),
      }, [{ message: "C# JS surface Date constructor runtime carrier recorded from checked TypeScript Date construction." }]);
    });
  }
}

function isCheckedSourceLibraryDateTypeReference(
  node: Node,
  sourceFile: SourceFile,
  context: ExtensionObservationContext,
): boolean {
  const type = context.compiler?.checker.getTypeFromTypeNode(node, { sourceFile });
  return type !== undefined && isSourceStandardLibraryDateType(type, context);
}

function recordDateRuntimeCarrierFacts(
  lifecycleContext: { readonly host: ExtensionObservationContext["host"] },
  subjects: readonly (ExtensionFactSubject | undefined)[],
  message: string,
): void {
  const fact = {
    carrier: csharpJsDateTargetType(),
  };
  const evidence = [{ message }];
  for (const subject of subjects) {
    setRuntimeCarrierFactIfUnresolved(lifecycleContext, subject, fact, evidence);
  }
}

function isCheckedSourceLibraryDateConstruction(
  node: Node,
  sourceFile: SourceFile,
  context: ExtensionObservationContext,
): boolean {
  void sourceFile;
  const selectedSignature = context.host.facts.get(node, selectedTargetSignatureFactKey) ??
    context.factResolver.resolve(node, selectedTargetSignatureFactKey);
  const sourceMember = resolveSelectedSourceLibraryMemberIdentity(
    selectedSignature?.sourceDeclaration,
    selectedSignature?.sourceSignature,
    context,
  );
  return sourceMember?.declaringName === "Date";
}
