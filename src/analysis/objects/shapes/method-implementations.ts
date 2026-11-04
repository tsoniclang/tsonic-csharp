import type { Node, SourceFile } from "@tsonic/tsts";
import type { CsharpCaptureInitialization, CsharpObjectShapeFact, CsharpObjectShapeMemberFact, TargetTypeRef } from "../../../target-model/types/model.js";
import type { CsharpObjectShapePolicyHost } from "./model.js";
import type { CsharpTypeResolutionState } from "../../source-evidence/types/resolution/model.js";
import type { CsharpObjectMethodSourceCapture,
  CsharpDeclaredObjectReceiverSource } from "../../../target-model/records/native/native-value-carriers.js";
import { csharpCapturedBindingInitialization } from "../../callables/values/capture-initialization.js";
import { failTargetAnalysisInvariant } from "@tsonic/target-api/artifacts";

export interface CsharpObjectMethodImplementationSource {
  readonly declaration: Node;
  readonly identity: string;
  readonly methods: readonly Node[];
  readonly declaredReceiver: CsharpDeclaredObjectReceiverSource | undefined;
  readonly state: CsharpTypeResolutionState;
  readonly captures: readonly {
    readonly declaration: Node;
    readonly reference: Node;
    readonly sourceFile: SourceFile | undefined;
    readonly mutable: boolean;
    readonly initialization: CsharpCaptureInitialization;
  }[];
}

export interface CsharpObjectMethodImplementationInput {
  readonly source: CsharpObjectMethodImplementationSource | undefined;
  readonly memberNames: readonly string[];
  readonly captures: readonly {
    readonly node: Node;
    readonly sourceFile: SourceFile | undefined;
    readonly state: CsharpTypeResolutionState;
  }[];
}

export interface CsharpObjectMethodCaptureRequest {
  readonly kind: "capture";
  readonly input: CsharpObjectMethodImplementationInput;
  readonly index: number;
  readonly source: CsharpObjectMethodImplementationInput["captures"][number];
}

export interface CsharpCompletedObjectMethodCapture {
  readonly kind: "capture";
  readonly request: CsharpObjectMethodCaptureRequest;
  readonly type: TargetTypeRef | undefined;
}

export function* completeCsharpObjectMethodImplementationSource(
  input: CsharpObjectMethodImplementationInput,
): Generator<CsharpObjectMethodCaptureRequest, CsharpObjectShapeFact["methodImplementation"] | undefined,
  CsharpCompletedObjectMethodCapture> {
  const { source, captures } = input;
  if (source === undefined ? captures.length !== 0 : captures.length !== source.captures.length ||
    Array.from(captures).some((capture, index) => capture === undefined ||
      capture.node !== source.captures[index]?.declaration || capture.sourceFile !== source.captures[index]?.sourceFile ||
      capture.state.depth !== source.state.depth + 1 || capture.state.sourceBindings !== source.state.sourceBindings ||
      capture.state.sourceStorageSubject !== source.state.sourceStorageSubject ||
      capture.state.sourceStorageBindings !== source.state.sourceStorageBindings ||
      capture.state.rejectNativeResolution !== source.state.rejectNativeResolution)) {
    return failTargetAnalysisInvariant("tsonic-csharp",
      "A method implementation requires its exact ordered capture occurrences and original state.", source?.declaration);
  }
  const types: (TargetTypeRef | undefined)[] = [];
  for (const [index, capture] of captures.entries()) {
    const request: CsharpObjectMethodCaptureRequest = Object.freeze({ kind: "capture", input, index, source: capture });
    const completed = yield request;
    if (completed === undefined || completed.kind !== "capture" || completed.request !== request) {
      return failTargetAnalysisInvariant("tsonic-csharp",
        "Method capture completion requires the exact chosen child before the next capture.", capture.node);
    }
    types.push(completed.type);
  }
  return selectCsharpObjectMethodImplementation(source, input.memberNames, types);
}

export function resolveCsharpObjectMethodImplementation(
  host: Pick<CsharpObjectShapePolicyHost, "typeResolver">,
  input: CsharpObjectMethodImplementationInput,
): CsharpObjectShapeFact["methodImplementation"] | undefined {
  const completion = completeCsharpObjectMethodImplementationSource(input);
  let step = completion.next();
  while (!step.done) {
    const request = step.value;
    const child = request.source;
    const type = host.typeResolver.resolveNode(child.node, child.sourceFile, child.state);
    step = completion.next(Object.freeze({ kind: "capture", request, type }));
  }
  return step.value;
}

export function selectCsharpObjectMethodImplementationSource(
  members: readonly Pick<CsharpObjectShapeMemberFact, "memberKind" | "sourceDeclarations">[],
  host: Pick<CsharpObjectShapePolicyHost, "ast" | "navigation" | "objectMethodSources">,
  state: CsharpTypeResolutionState,
  selectedLiteral?: Node,
): CsharpObjectMethodImplementationSource | undefined {
  const methods = [...new Set(members.filter(member => member.memberKind === "method").flatMap(member => (member.sourceDeclarations ?? [])
    .filter(declaration => host.ast.is.IsMethodDeclaration(declaration) && host.ast.body(declaration) !== undefined &&
      host.ast.is.IsObjectLiteralExpression(host.ast.parent(declaration)!) &&
      (selectedLiteral === undefined || host.ast.parent(declaration) === selectedLiteral))))]
    .sort((left, right) => host.ast.pos(left) - host.ast.pos(right));
  if (methods.length === 0) return undefined;
  const literal = host.ast.parent(methods[0]!);
  if (literal === undefined || methods.some(method => host.ast.parent(method) !== literal)) return undefined;
  const selected = host.objectMethodSources.get(literal);
  if (selected === undefined) return undefined;
  const selectedCaptures = new Map<Node, CsharpObjectMethodSourceCapture>();
  for (const method of methods) {
    const captures = selected.captures(method);
    if (captures === undefined) return undefined;
    for (const capture of captures) {
      if (!selectedCaptures.has(capture.declaration)) selectedCaptures.set(capture.declaration, capture);
    }
  }
  const captures = [...selectedCaptures.values()].map(capture => Object.freeze({
    declaration: capture.declaration,
    reference: capture.reference,
    sourceFile: host.ast.getSourceFile(capture.declaration),
    mutable: capture.mutable,
    initialization: csharpCapturedBindingInitialization(capture.declaration, host.ast, host.navigation),
  }));
  return Object.freeze({ declaration: literal, identity: selected.identity, methods: Object.freeze(methods),
    declaredReceiver: selected.declaredReceiver, state, captures: Object.freeze(captures),
  });
}

export function selectCsharpObjectMethodImplementation(
  source: CsharpObjectMethodImplementationSource | undefined,
  memberNames: readonly string[],
  captureTypes: readonly (TargetTypeRef | undefined)[],
): CsharpObjectShapeFact["methodImplementation"] | undefined {
  if (source === undefined || captureTypes.length !== source.captures.length) return undefined;
  const names = new Set(memberNames);
  const captures = source.captures.map((capture, index) => {
    const reference = capture.reference;
    const type = captureTypes[index];
    if (reference === undefined || type === undefined) return undefined;
    let fieldName = `__tsonic_capture${index}`;
    while (names.has(fieldName)) fieldName += "_";
    names.add(fieldName);
    return Object.freeze({ declaration: capture.declaration, reference, fieldName, type,
      mutable: capture.mutable,
      initialization: capture.initialization,
    });
  });
  if (captures.some(capture => capture === undefined)) return undefined;
  return Object.freeze({ declaration: source.declaration, identity: source.identity, methods: source.methods,
    captures: Object.freeze(captures as NonNullable<typeof captures[number]>[]),
  });
}
