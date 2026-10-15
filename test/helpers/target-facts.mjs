const defaultMissingReason = "test fixture did not provide a finalized carrier fact";

export function missingCarrierResolution(reason = defaultMissingReason, evidence = []) {
  return {
    kind: "missing",
    reason,
    evidence,
  };
}

export function resolvedCarrierResolution(carrier, message = "test fixture provided a finalized carrier fact") {
  return carrier === undefined
    ? missingCarrierResolution()
    : {
        kind: "resolved",
        carrier,
        evidence: [{ message }],
      };
}

export function missingParameterCarrierResolution(reason = "test fixture did not provide a selected call signature", evidence = []) {
  return {
    kind: "missing",
    reason,
    evidence,
  };
}

export function resolvedParameterCarrierResolutions(carriers) {
  return {
    kind: "resolved-parameters",
    parameters: carriers.map((carrier) => resolvedCarrierResolution(carrier)),
    evidence: [{ message: "test fixture provided finalized parameter carrier facts" }],
  };
}
