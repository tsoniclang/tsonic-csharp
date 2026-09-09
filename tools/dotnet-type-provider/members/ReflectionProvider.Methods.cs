using System.Reflection;

sealed partial class ReflectionProvider
{
    IEnumerable<object> ConversionOperators(Type type)
    {
        foreach (var method in type.GetMethods(BindingFlags.Public | BindingFlags.Static | BindingFlags.DeclaredOnly)
            .Where(IsConversionOperator)
            .Where(method => UnsupportedOperatorReason(type, method) is null)
            .OrderBy(MethodId, StringComparer.Ordinal))
        {
            var parameters = method.GetParameters();
            if (parameters.Length != 1)
            {
                continue;
            }
            var sourceType = TypeRef(
                UnwrapByRef(parameters[0].ParameterType),
                typeNullability: nullability.Create(parameters[0]),
                typeNullabilityMetadata: NullableMetadata.ForParameter(parameters[0]),
                signatureEvidence: SignatureEvidence(parameters[0]));
            var targetType = TypeRef(
                method.ReturnType,
                typeNullability: nullability.Create(method.ReturnParameter),
                typeNullabilityMetadata: NullableMetadata.ForParameter(method.ReturnParameter),
                signatureEvidence: SignatureEvidence(method.ReturnParameter));
            if (sourceType is null || targetType is null)
            {
                continue;
            }
            yield return new
            {
                id = MethodId(method),
                targetName = method.Name,
                metadataName = MethodMetadataId(method),
                conversionKind = method.Name == "op_Implicit" ? "implicit" : "explicit",
                sourceType,
                targetType,
            };
        }
    }

    IEnumerable<MethodInfo> Methods(Type type)
    {
        return type.GetMethods(BindingFlags.Public | BindingFlags.Instance | BindingFlags.Static | BindingFlags.DeclaredOnly)
            .Where(method => !method.IsSpecialName)
            .Where(method => !method.IsStatic || !RequiresStaticSourceAdapter(type))
            .Where(method => UnsupportedMethodReason(type, method) is null)
            .OrderBy(MethodId, StringComparer.Ordinal);
    }

    IEnumerable<object> ExtensionProjectionMembers(Type receiverType)
    {
        foreach (var group in ExtensionProjectionMethods(receiverType).GroupBy(ExtensionProjectionGroupKey))
        {
            var first = group.First();
            var signatures = group.Select(method => MethodSignature(method, GenericParameterContext.ForExtensionProjection(method, receiverType))).Where(signature => signature is not null).Cast<object>().ToArray();
            var targetDeclaringType = TypeRef(first.DeclaringType!, requireDelegateSourceShape: false);
            if (signatures.Length == 0 || targetDeclaringType is null)
            {
                continue;
            }
            yield return new
            {
                kind = "method",
                sourceName = SourceMemberName(first.Name),
                targetName = first.Name,
                targetId = $"{TargetId(first.DeclaringType!)}.{first.Name}",
                metadataName = $"{MetadataName(first.DeclaringType!)}.{first.Name}",
                @static = true,
                sourceStatic = false,
                sourceProjection = "extension-method",
                receiverPassing = "target-parameter",
                sourceReceiverParameterIndex = 0,
                targetDeclaringType,
                signatures,
            };
        }
    }

    IEnumerable<MethodInfo> ExtensionProjectionMethods(Type receiverType)
    {
        return activeModuleTypes
            .SelectMany(type => type.GetMethods(BindingFlags.Public | BindingFlags.Static | BindingFlags.DeclaredOnly))
            .Where(method => IsExtensionMethod(method))
            .Where(method => !method.IsSpecialName)
            .Where(method => ExtensionReceiverApplies(receiverType, method))
            .Where(method => GenericParameterContext
                .ForExtensionProjection(method, receiverType)
                .CanProjectOmittedMethodParameters())
            .Where(method => UnsupportedMethodReason(method.DeclaringType!, method) is null)
            .OrderBy(MethodId, StringComparer.Ordinal);
    }

    static string ExtensionProjectionGroupKey(MethodInfo method)
    {
        return $"{TargetId(method.DeclaringType!)}:{method.Name}";
    }

    static bool ExtensionReceiverApplies(Type receiverType, MethodInfo method)
    {
        var receiverParameter = method.GetParameters().FirstOrDefault();
        if (receiverParameter is null)
        {
            return false;
        }
        return ReceiverTypeAccepts(UnwrapByRef(receiverParameter.ParameterType), receiverType);
    }

    static bool ReceiverTypeAccepts(Type receiverParameterType, Type receiverType)
    {
        if (receiverParameterType.IsAssignableFrom(receiverType))
        {
            return true;
        }
        if (receiverParameterType.IsGenericType)
        {
            var receiverParameterDefinition = receiverParameterType.GetGenericTypeDefinition();
            if (receiverType.IsGenericType && receiverType.GetGenericTypeDefinition() == receiverParameterDefinition)
            {
                return true;
            }
            return receiverType.GetInterfaces().Any(candidate =>
                candidate.IsGenericType && candidate.GetGenericTypeDefinition() == receiverParameterDefinition);
        }
        return false;
    }

    IEnumerable<MethodInfo> Operators(Type type)
    {
        return type.GetMethods(BindingFlags.Public | BindingFlags.Static | BindingFlags.DeclaredOnly)
            .Where(method => method.IsSpecialName)
            .Where(method => method.Name.StartsWith("op_", StringComparison.Ordinal))
            .Where(method => !IsConversionOperator(method))
            .Where(method => UnsupportedOperatorReason(type, method) is null)
            .OrderBy(OperatorId, StringComparer.Ordinal);
    }

    static string OperatorProjectionGroupKey(MethodInfo method)
    {
        var projection = OperatorSourceProjectionFor(method);
        return projection is null
            ? $"unsupported:{OperatorId(method)}"
            : $"{projection.SourceName}:{projection.ReceiverParameterIndex}";
    }

    static OperatorSourceProjection? OperatorSourceProjectionFor(MethodInfo method)
    {
        var descriptor = method.Name switch
        {
            "op_UnaryPlus" => ("operatorPlus", "prefix", "unary-plus", false),
            "op_UnaryNegation" => ("operatorNegate", "prefix", "unary-negation", false),
            "op_CheckedUnaryNegation" => ("checkedOperatorNegate", "prefix", "unary-negation", true),
            "op_LogicalNot" => ("operatorNot", "prefix", "logical-not", false),
            "op_OnesComplement" => ("operatorOnesComplement", "prefix", "ones-complement", false),
            "op_Addition" => ("operatorAdd", "binary", "addition", false),
            "op_CheckedAddition" => ("checkedOperatorAdd", "binary", "addition", true),
            "op_Subtraction" => ("operatorSubtract", "binary", "subtraction", false),
            "op_CheckedSubtraction" => ("checkedOperatorSubtract", "binary", "subtraction", true),
            "op_Multiply" => ("operatorMultiply", "binary", "multiplication", false),
            "op_CheckedMultiply" => ("checkedOperatorMultiply", "binary", "multiplication", true),
            "op_Division" => ("operatorDivide", "binary", "division", false),
            "op_Modulus" => ("operatorModulus", "binary", "modulus", false),
            "op_BitwiseAnd" => ("operatorBitwiseAnd", "binary", "bitwise-and", false),
            "op_BitwiseOr" => ("operatorBitwiseOr", "binary", "bitwise-or", false),
            "op_ExclusiveOr" => ("operatorExclusiveOr", "binary", "exclusive-or", false),
            "op_LeftShift" => ("operatorLeftShift", "binary", "left-shift", false),
            "op_RightShift" => ("operatorRightShift", "binary", "right-shift", false),
            "op_UnsignedRightShift" => ("operatorUnsignedRightShift", "binary", "unsigned-right-shift", false),
            "op_Equality" => ("operatorEquals", "binary", "equality", false),
            "op_Inequality" => ("operatorNotEquals", "binary", "inequality", false),
            "op_LessThan" => ("operatorLessThan", "binary", "less-than", false),
            "op_LessThanOrEqual" => ("operatorLessThanOrEqual", "binary", "less-than-or-equal", false),
            "op_GreaterThan" => ("operatorGreaterThan", "binary", "greater-than", false),
            "op_GreaterThanOrEqual" => ("operatorGreaterThanOrEqual", "binary", "greater-than-or-equal", false),
            _ => ((string SourceName, string Form, string Operator, bool Checked)?)null,
        };
        if (descriptor is null)
        {
            return null;
        }
        var parameters = method.GetParameters();
        var expectedArity = descriptor.Value.Form == "prefix" ? 1 : 2;
        if (parameters.Length != expectedArity || parameters.Any(parameter => parameter.ParameterType.IsByRef))
        {
            return null;
        }
        var declaringType = method.DeclaringType!;
        var receiverParameterIndex = Array.FindIndex(parameters, parameter =>
            OperatorOperandBelongsToDeclaringType(UnwrapByRef(parameter.ParameterType), declaringType));
        return receiverParameterIndex < 0
            ? null
            : new OperatorSourceProjection(
                descriptor.Value.SourceName,
                descriptor.Value.Form,
                descriptor.Value.Operator,
                descriptor.Value.Checked,
                receiverParameterIndex);
    }

    static bool OperatorOperandBelongsToDeclaringType(Type operandType, Type declaringType)
    {
        if (operandType == declaringType)
        {
            return true;
        }
        return declaringType.IsGenericTypeDefinition &&
            operandType.IsGenericType &&
            operandType.GetGenericTypeDefinition() == declaringType;
    }

    sealed record OperatorSourceProjection(
        string SourceName,
        string Form,
        string Operator,
        bool Checked,
        int ReceiverParameterIndex);

    IEnumerable<object> UnsupportedMethods(Type type)
    {
        foreach (var method in type.GetMethods(BindingFlags.Public | BindingFlags.Instance | BindingFlags.Static | BindingFlags.DeclaredOnly)
            .Where(method => !method.IsSpecialName)
            .OrderBy(MethodId, StringComparer.Ordinal))
        {
            var reason = UnsupportedMethodReason(type, method);
            if (reason is null)
            {
                continue;
            }
            yield return UnsupportedMember(
                "method",
                SourceMemberName(method.Name),
                method.Name,
                MethodId(method),
                MethodMetadataId(method),
                method.IsStatic,
                reason);
        }
    }

    string? UnsupportedMethodReason(Type type, MethodInfo method)
    {
        if (!IsSourceIdentifier(SourceMemberName(method.Name)))
        {
            return $"CLR method name '{method.Name}' is not an exact source identifier; provider aliases must be declared explicitly rather than synthesized.";
        }
        if (Parameters(method.GetParameters()) is null)
        {
            return UnsupportedParametersReason(method.GetParameters(), "Method signature")!;
        }
        return UnsupportedReturnTypeReason(method, "Method return type");
    }

    IEnumerable<object> UnsupportedOperators(Type type)
    {
        foreach (var method in type.GetMethods(BindingFlags.Public | BindingFlags.Static | BindingFlags.DeclaredOnly)
            .Where(method => method.IsSpecialName)
            .Where(method => method.Name.StartsWith("op_", StringComparison.Ordinal))
            .OrderBy(MethodId, StringComparer.Ordinal))
        {
            var reason = UnsupportedOperatorReason(type, method);
            if (reason is null)
            {
                continue;
            }
            yield return UnsupportedMember(
                "operator",
                SourceMemberName(method.Name),
                method.Name,
                OperatorId(method),
                MethodMetadataId(method),
                true,
                reason);
        }
    }

    string? UnsupportedOperatorReason(Type type, MethodInfo method)
    {
        if (IsConversionOperator(method))
        {
            if (method.GetParameters().Length != 1)
            {
                return "Conversion operators require exactly one source parameter before provider conversion facts can be exposed safely.";
            }
            if (Parameters(method.GetParameters()) is null)
            {
                return UnsupportedParametersReason(method.GetParameters(), "Conversion operator signature")!;
            }
            return UnsupportedReturnTypeReason(method, "Conversion operator return type");
        }
        if (OperatorSourceProjectionFor(method) is null)
        {
            return "Operator has no exact legal TypeScript adapter and C# operator-expression projection.";
        }
        if (Parameters(method.GetParameters()) is null)
        {
            return UnsupportedParametersReason(method.GetParameters(), "Operator signature")!;
        }
        return UnsupportedReturnTypeReason(method, "Operator return type");
    }

    static bool IsConversionOperator(MethodInfo method)
    {
        return method.IsSpecialName &&
            (method.Name == "op_Implicit" || method.Name == "op_Explicit");
    }

    static bool IsExtensionMethod(MethodInfo method)
    {
        return method.IsStatic &&
            HasRuntimeAttribute(method, typeof(System.Runtime.CompilerServices.ExtensionAttribute));
    }

}
