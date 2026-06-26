import type {
  ExtensionObservation,
  ExtensionObservationContext,
  Node,
  RuntimeCarrierFactRequest,
  RuntimeCarrierFactResult,
  SourceFile,
  TargetMember,
  TargetTypeRef,
} from "@tsonic/tsts";
import {
  acceptObservation,
  deferObservation,
  runtimeCarrierFactKey,
} from "@tsonic/tsts";
import {
  csharpJsArrayCarrierTargetType,
} from "./array-target-type.js";
import type {
  CsharpJsSurfaceHost,
} from "./source-library.js";
import {
  csharpQualifiedTypeRenderShape,
  csharpSourcePrimitiveTargetType,
  csharpStringTargetType,
  csharpTargetNamedType,
  getSourceLibraryMember,
  targetParameter,
} from "./source-library.js";
import type {
  JsSurfaceTargetMemberMetadata,
} from "./target-member-metadata.js";
import {
  jsSurfaceTargetMemberMetadataIndex,
  jsSurfaceTargetMembersForSourceName,
} from "./target-member-metadata.js";
import {
  csharpJsObjectCarrierTargetType,
} from "./objects.js";
import {
  asNodeSubject,
  getNodeField,
  getNodeList,
  visitAstReaderNodes,
} from "../../ast-utils.js";
import {
  createRuntimeCarrierLifecycleObservationContext,
} from "../../runtime-carriers.js";

const jsonRuntimeType = csharpTargetNamedType("Tsonic.CSharp.Js.JSON", undefined, csharpQualifiedTypeRenderShape("Tsonic.CSharp.Js", "JSON"));
const jsonValueTargetType = csharpTargetNamedType("Tsonic.CSharp.Js.TsValue", undefined, csharpQualifiedTypeRenderShape("Tsonic.CSharp.Js", "TsValue"));
const stringTargetType = csharpStringTargetType();
const boolTargetType = csharpSourcePrimitiveTargetType("bool");
const numberTargetType = csharpSourcePrimitiveTargetType("float64");
const jsonArrayElementType: TargetTypeRef = {
  kind: "type-parameter",
  name: "T",
};

export function csharpJsJsonValueTargetType(): TargetTypeRef {
  return jsonValueTargetType;
}

export function isCsharpJsJsonValueTargetType(type: TargetTypeRef | undefined): boolean {
  return type?.kind === "target-named" && type.id === jsonValueTargetType.id;
}

export function mapCsharpJsJsonRuntimeCarrier(
  request: RuntimeCarrierFactRequest,
  context: ExtensionObservationContext<"type.resolveRuntimeCarrier">,
  host: CsharpJsSurfaceHost,
): ExtensionObservation<RuntimeCarrierFactResult> {
  const call = asNodeSubject(request.sourceTypeReference);
  if (call === undefined || context.compiler?.ast.is.IsCallExpression(call) !== true) {
    return deferObservation;
  }
  const sourceFile = context.compiler.ast.getSourceFile(call);
  if (sourceFile === undefined || !isCheckedJsonParseCall(call, sourceFile, context, host)) {
    return deferObservation;
  }
  return acceptObservation<RuntimeCarrierFactResult>({
    carrier: jsonValueTargetType,
  }, [{ message: "C# JS surface JSON.parse runtime carrier recorded from selected TypeScript standard-library declaration and closed string argument facts." }]);
}

export function recordCsharpJsJsonRuntimeCarrierFactsBeforeFinalization(
  lifecycleContext: { readonly host: ExtensionObservationContext["host"]; readonly compiler?: ExtensionObservationContext["compiler"] },
  host: CsharpJsSurfaceHost,
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
      if (
        compiler.ast.is.IsCallExpression(node) !== true ||
        lifecycleContext.host.facts.get(node, runtimeCarrierFactKey) !== undefined ||
        !isCheckedJsonParseCall(node, sourceFile, context, host)
      ) {
        return;
      }
      lifecycleContext.host.facts.set(node, runtimeCarrierFactKey, {
        carrier: jsonValueTargetType,
      }, [{ message: "C# JS surface JSON.parse runtime carrier recorded before generic any carrier finalization." }]);
    });
  }
}

export function jsonTargetMembersForSourceName(sourceName: string): readonly TargetMember[] {
  return jsSurfaceTargetMembersForSourceName(jsonTargetMemberIndex, sourceName);
}

function jsonStaticMethodMetadata(
  idSuffix: string,
  sourceName: string,
  parameters: readonly ReturnType<typeof targetParameter>[],
  returnType: TargetTypeRef,
): JsSurfaceTargetMemberMetadata {
  return {
    id: `Tsonic.CSharp.Js.JSON.${idSuffix}`,
    sourceName,
    targetName: sourceName,
    kind: "method",
    parameters,
    returnType,
    declaringType: jsonRuntimeType,
    static: true,
  };
}

const jsonTargetMemberMetadata = [
  jsonStaticMethodMetadata("parse", "parse", [
    targetParameter("text", stringTargetType),
  ], jsonValueTargetType),
  jsonStaticMethodMetadata("stringify:string", "stringify", [
    targetParameter("value", stringTargetType),
  ], stringTargetType),
  jsonStaticMethodMetadata("stringify:number", "stringify", [
    targetParameter("value", numberTargetType),
  ], stringTargetType),
  jsonStaticMethodMetadata("stringify:bool", "stringify", [
    targetParameter("value", boolTargetType),
  ], stringTargetType),
  jsonStaticMethodMetadata("stringify:object", "stringify", [
    targetParameter("value", csharpJsObjectCarrierTargetType()),
  ], stringTargetType),
  jsonStaticMethodMetadata("stringify:array", "stringify", [
    targetParameter("value", csharpJsArrayCarrierTargetType(jsonArrayElementType)),
  ], stringTargetType),
  jsonStaticMethodMetadata("stringify:tsvalue", "stringify", [
    targetParameter("value", jsonValueTargetType),
  ], stringTargetType),
] satisfies readonly JsSurfaceTargetMemberMetadata[];
const jsonTargetMemberIndex = jsSurfaceTargetMemberMetadataIndex(jsonTargetMemberMetadata);

function isCheckedJsonParseCall(
  call: Node,
  sourceFile: SourceFile,
  context: ExtensionObservationContext,
  host: CsharpJsSurfaceHost,
): boolean {
  const compiler = context.compiler;
  if (compiler === undefined) {
    return false;
  }
  const signature = compiler.checker.getResolvedSignature(call, { sourceFile });
  const declaration = getSignatureDeclaration(signature);
  const sourceMember = getSourceLibraryMember(declaration, context);
  if (sourceMember?.id !== "JSON.parse") {
    return false;
  }
  const argument = getNodeList(getNodeField(call, "Arguments"))[0];
  return host.isCsharpStringType(host.unwrapNullableTargetType(host.getTargetTypeRefForSubject(argument, context, {
    allowRuntimeCarrier: true,
    allowSemanticTypeQuery: true,
    sourceFile,
  })));
}

function getSignatureDeclaration(signature: unknown): Node | undefined {
  return asNodeSubject((signature as { readonly declaration?: unknown } | undefined)?.declaration);
}
