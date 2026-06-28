import type {
  ExtensionObservation,
  ExtensionObservationContext,
  Node,
  RuntimeCarrierFactRequest,
  RuntimeCarrierFactResult,
  SourceFile,
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
  resolveSourceLibraryMemberIdentity,
  targetParameter,
} from "./source-library.js";
import type {
  JsSurfaceSourceIdentitySelector,
  JsSurfaceTargetMemberMetadata,
} from "./target-member-metadata.js";
import {
  jsSurfaceTargetMemberFromMetadata,
  jsSurfaceSelectedSourceIdentityForMember,
  jsSurfaceSourceIdentityMatchesSelector,
  jsSurfaceTargetMemberMetadataIdentityIndex,
  jsSurfaceTargetMemberMetadataWithSourceIdentity,
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
import type {
  CsharpRecordDictionaryTargetTypeRef,
} from "../../dictionaries.js";

const jsonRuntimeType = csharpTargetNamedType("Tsonic.CSharp.Js.JSON", undefined, csharpQualifiedTypeRenderShape("Tsonic.CSharp.Js", "JSON"));
const jsonValueTargetType = csharpTargetNamedType("Tsonic.CSharp.Js.TsValue", undefined, csharpQualifiedTypeRenderShape("Tsonic.CSharp.Js", "TsValue"));
const stringTargetType = csharpStringTargetType();
const boolTargetType = csharpSourcePrimitiveTargetType("bool");
const numberTargetType = csharpSourcePrimitiveTargetType("float64");
const jsonArrayElementType: TargetTypeRef = {
  kind: "type-parameter",
  name: "T",
};

interface JsonSemanticExceptionMetadata {
  readonly reason: string;
  readonly provenance: string;
  readonly capabilityId: string;
  readonly requiredFacts: readonly string[];
}

type JsonTargetMemberMetadata = JsSurfaceTargetMemberMetadata & {
  readonly semanticException?: JsonSemanticExceptionMetadata;
};

interface JsonStaticMethodMetadataRow {
  readonly id: string;
  readonly sourceName: string;
  readonly targetName: string;
  readonly parameters: readonly ReturnType<typeof targetParameter>[];
  readonly returnType: TargetTypeRef;
  readonly semanticException?: JsonSemanticExceptionMetadata;
}

export function csharpJsJsonValueTargetType(): TargetTypeRef {
  return jsonValueTargetType;
}

export function isCsharpJsJsonValueTargetType(type: TargetTypeRef | undefined): boolean {
  return type?.kind === "target-named" && type.id === jsonValueTargetType.id;
}

export function jsonRecordDictionaryStringifyTargetMembers(
  dictionaryType: CsharpRecordDictionaryTargetTypeRef,
): readonly ReturnType<typeof jsSurfaceTargetMemberFromMetadata>[] {
  return [jsonStaticMethodMetadata({
    id: "Tsonic.CSharp.Js.JSON.stringify:dictionary",
    sourceName: "stringify",
    targetName: "stringify",
    parameters: [targetParameter("value", dictionaryType)],
    returnType: stringTargetType,
    semanticException: {
      reason: "JSON.stringify accepts closed string-keyed Record dictionary carriers through the JSON runtime shim.",
      provenance: "Selected TypeScript standard-library JSON.stringify overload with finalized string-keyed Record dictionary carrier facts.",
      capabilityId: "surface.js.math-json-regexp",
      requiredFacts: ["selected JSON.stringify source signature", "closed string-keyed Record dictionary argument carrier", "JSON.stringify dictionary runtime metadata row"],
    },
  })].map(jsSurfaceTargetMemberFromMetadata);
}

export function mapCsharpJsJsonRuntimeCarrier(
  request: RuntimeCarrierFactRequest,
  context: ExtensionObservationContext<"type.resolveRuntimeCarrier">,
  host: CsharpJsSurfaceHost,
): ExtensionObservation<RuntimeCarrierFactResult> {
  const call = asNodeSubject(request.type);
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

function jsonStaticMethodMetadata(row: JsonStaticMethodMetadataRow): JsonTargetMemberMetadata {
  return {
    id: row.id,
    sourceName: row.sourceName,
    targetName: row.targetName,
    kind: "method",
    parameters: row.parameters,
    returnType: row.returnType,
    declaringType: jsonRuntimeType,
    static: true,
    capabilityId: "surface.js.math-json-regexp",
    requiredFacts: [
      "selected source declaration/signature identity",
      "closed JSON argument target facts",
      "Tsonic.CSharp.Js.JSON runtime metadata row",
    ],
    semanticEquivalence: "Selected Tsonic.CSharp.Js.JSON runtime member preserves ECMAScript JSON operation semantics for closed JSON carriers.",
    ...(row.semanticException === undefined ? {} : { semanticException: row.semanticException }),
  };
}

const jsonTargetMemberMetadata = [
  jsonStaticMethodMetadata({
    id: "Tsonic.CSharp.Js.JSON.parse",
    sourceName: "parse",
    targetName: "parse",
    parameters: [targetParameter("text", stringTargetType)],
    returnType: jsonValueTargetType,
    semanticException: {
      reason: "JSON.parse returns the closed TsValue runtime carrier instead of System.Object.",
      provenance: "TypeScript standard-library JSON.parse declaration selected with a provider-proven string argument.",
      capabilityId: "surface.js.math-json-regexp",
      requiredFacts: ["selected JSON.parse source signature", "closed string argument carrier", "closed TsValue result carrier metadata"],
    },
  }),
  jsonStaticMethodMetadata({
    id: "Tsonic.CSharp.Js.JSON.stringify:string",
    sourceName: "stringify",
    targetName: "stringify",
    parameters: [targetParameter("value", stringTargetType)],
    returnType: stringTargetType,
  }),
  jsonStaticMethodMetadata({
    id: "Tsonic.CSharp.Js.JSON.stringify:number",
    sourceName: "stringify",
    targetName: "stringify",
    parameters: [targetParameter("value", numberTargetType)],
    returnType: stringTargetType,
  }),
  jsonStaticMethodMetadata({
    id: "Tsonic.CSharp.Js.JSON.stringify:bool",
    sourceName: "stringify",
    targetName: "stringify",
    parameters: [targetParameter("value", boolTargetType)],
    returnType: stringTargetType,
  }),
  jsonStaticMethodMetadata({
    id: "Tsonic.CSharp.Js.JSON.stringify:object",
    sourceName: "stringify",
    targetName: "stringify",
    parameters: [targetParameter("value", csharpJsObjectCarrierTargetType())],
    returnType: stringTargetType,
    semanticException: {
      reason: "JSON.stringify accepts the closed JSObject carrier through the JSON runtime shim.",
      provenance: "Selected TypeScript standard-library JSON.stringify overload with finalized JSObject carrier facts.",
      capabilityId: "surface.js.math-json-regexp",
      requiredFacts: ["selected JSON.stringify source signature", "closed JSObject argument carrier", "JSON.stringify object runtime metadata row"],
    },
  }),
  jsonStaticMethodMetadata({
    id: "Tsonic.CSharp.Js.JSON.stringify:array",
    sourceName: "stringify",
    targetName: "stringify",
    parameters: [targetParameter("value", csharpJsArrayCarrierTargetType(jsonArrayElementType))],
    returnType: stringTargetType,
    semanticException: {
      reason: "JSON.stringify accepts the closed JSArray carrier through the JSON runtime shim.",
      provenance: "Selected TypeScript standard-library JSON.stringify overload with finalized JSArray carrier facts.",
      capabilityId: "surface.js.math-json-regexp",
      requiredFacts: ["selected JSON.stringify source signature", "closed JSArray argument carrier", "JSON.stringify array runtime metadata row"],
    },
  }),
  jsonStaticMethodMetadata({
    id: "Tsonic.CSharp.Js.JSON.stringify:tsvalue",
    sourceName: "stringify",
    targetName: "stringify",
    parameters: [targetParameter("value", jsonValueTargetType)],
    returnType: stringTargetType,
    semanticException: {
      reason: "JSON.stringify preserves the closed TsValue carrier produced by JSON.parse.",
      provenance: "Selected TypeScript standard-library JSON.stringify overload with finalized TsValue carrier facts.",
      capabilityId: "surface.js.math-json-regexp",
      requiredFacts: ["selected JSON.stringify source signature", "closed TsValue argument carrier", "JSON.stringify TsValue runtime metadata row"],
    },
  }),
] satisfies readonly JsonTargetMemberMetadata[];
export const jsonTargetMemberIdentityIndex = jsSurfaceTargetMemberMetadataIdentityIndex(
  jsSurfaceTargetMemberMetadataWithSourceIdentity("JSON", jsonTargetMemberMetadata),
);

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
  const declaration = asNodeSubject(signature === undefined ? undefined : compiler.checker.getSignatureDeclaration(signature));
  const sourceMember = resolveSourceLibraryMemberIdentity(declaration, context);
  if (
    sourceMember === undefined ||
    !jsSurfaceSourceIdentityMatchesSelector(jsSurfaceSelectedSourceIdentityForMember(sourceMember), jsonParseIdentityPolicy)
  ) {
    return false;
  }
  const argument = getNodeList(getNodeField(call, "Arguments"))[0];
  return host.isCsharpStringType(host.unwrapNullableTargetType(host.getTargetTypeRefForSubject(argument, context, {
    allowRuntimeCarrier: true,
    allowSemanticTypeQuery: true,
    sourceFile,
  })));
}

const jsonParseIdentityPolicy = {
  ids: ["JSON.parse"],
} satisfies JsSurfaceSourceIdentitySelector;
