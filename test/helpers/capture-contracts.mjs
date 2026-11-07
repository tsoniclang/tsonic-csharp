import { getCsharpLambdaSignature } from "../../dist/target-model/types/carriers/delegates.js";
import { getCsharpMethodValue } from "../../dist/target-model/types/method-values.js";

export function createCaptureContractFixture(source, typeFor) {
  return Object.freeze({
    get(identity) {
      const declaration = identity.declaration;
      const type = typeFor(declaration);
      const method = getCsharpMethodValue(type);
      const signature = getCsharpLambdaSignature(method?.contract ?? type);
      // The Host-published callable signature names the parameter declarations (nextgen C-2542: facts only).
      const published = source.facts.values.type(declaration);
      const callable = published.kind === "refused" ? undefined : published.type;
      const parameters = callable?.kind === "callable" && callable.calls.length === 1
        ? callable.calls[0].parameters.map(parameter => parameter.declaration) : undefined;
      if (signature === undefined || parameters === undefined) return undefined;
      return Object.freeze({ kind: "source", sourceDeclaration: declaration,
        nativeSignature: Object.freeze({ methodTypeParameterIdentities: method?.typeParameters ?? [],
          methodAllowsRefLikeTypeArguments: method?.allowsRefLikeTypeArguments ?? [] }),
        parameters,
        nativeParameters: signature.parameters.map((type, index) => ({ sourceParameter: parameters[index],
          targetParameter: { name: source.syntax.text(source.syntax.name(parameters[index])), type,
            passingMode: signature.parameterPassingModes[index],
            ...(signature.optionalParameterIndexes?.includes(index) === true ? { optional: true } : {}),
            ...(signature.restParameterIndex === index ? { paramsArray: true } : {}),
          } })),
        returnType: signature.returnType,
      });
    },
    closedInputType(declaration) {
      const type = typeFor(declaration);
      return getCsharpMethodValue(type) === undefined ? type : undefined;
    },
  });
}
