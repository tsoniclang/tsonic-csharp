using System.Reflection;

sealed partial class ReflectionProvider
{
    object[] Inheritance(Type type)
    {
        if (!type.IsClass || IsDelegate(type))
            return [];
        var chain = new List<object>();
        for (Type? current = type; current is not null; current = current.BaseType)
        {
            chain.Add(new
            {
                targetId = TargetId(current),
                type = TypeRef(current, requireDelegateSourceShape: false)
                    ?? throw new InvalidOperationException($"Native inheritance type '{TypeTargetId(current)}' has no exact physical type."),
            });
        }
        return chain.ToArray();
    }

    object[] InheritableMembers(Type type)
    {
        if (!type.IsClass || IsDelegate(type))
            return [];
        const BindingFlags flags = BindingFlags.Public | BindingFlags.NonPublic |
            BindingFlags.Instance | BindingFlags.Static | BindingFlags.DeclaredOnly;
        var members = new List<(string Key, object Value)>();
        foreach (var method in type.GetMethods(flags).Where(method => !method.IsSpecialName))
        {
            var accessibility = InheritedAccessibility(method);
            if (accessibility is null)
                continue;
            var genericParameters = method.IsGenericMethodDefinition
                ? method.GetGenericArguments()
                : [];
            members.Add((MethodId(method), new
            {
                targetName = method.Name,
                kind = "method",
                @static = method.IsStatic,
                accessibility,
                genericArity = genericParameters.Length,
                genericParameterIds = genericParameters.Select(GenericParameterIdentity).ToArray(),
                parameters = InheritedParameters(method.GetParameters(), GenericParameterContext.ForMethod(method, type)),
                dispatchSlots = new[] { InheritedDispatchSlot(method, "method") },
            }));
        }
        foreach (var property in type.GetProperties(flags))
        {
            var accessors = property.GetAccessors(true);
            var accessibility = InheritedAccessibility(accessors);
            if (accessibility is null)
                continue;
            var parameters = property.GetIndexParameters();
            members.Add(($"property:{property.Name}({string.Join(",", parameters.Select(ParameterTargetId))})", new
            {
                targetName = property.Name,
                kind = "property",
                @static = accessors.Any(accessor => accessor.IsStatic),
                accessibility,
                genericArity = 0,
                genericParameterIds = Array.Empty<string>(),
                parameters = InheritedParameters(parameters, GenericParameterContext.Empty),
                dispatchSlots = new[] {
                    (Method: property.GetGetMethod(true), Kind: "get"),
                    (Method: property.GetSetMethod(true), Kind: "set"),
                }.Where(accessor => accessor.Method is not null && InheritedAccessibility(accessor.Method) is not null)
                    .Select(accessor => InheritedDispatchSlot(accessor.Method!, accessor.Kind)).ToArray(),
            }));
        }
        foreach (var field in type.GetFields(flags))
        {
            var accessibility = field.IsPublic ? "public" : field.IsFamily ? "protected" :
                field.IsFamilyOrAssembly ? "protected-internal" : null;
            if (accessibility is null)
                continue;
            members.Add(($"field:{field.Name}", new
            {
                targetName = field.Name,
                kind = "field",
                @static = field.IsStatic,
                accessibility,
                genericArity = 0,
                genericParameterIds = Array.Empty<string>(),
                parameters = Array.Empty<object>(),
                dispatchSlots = Array.Empty<object>(),
            }));
        }
        foreach (var declaredEvent in type.GetEvents(flags))
        {
            var accessors = new[] { declaredEvent.GetAddMethod(true), declaredEvent.GetRemoveMethod(true) }
                .OfType<MethodInfo>().ToArray();
            var accessibility = InheritedAccessibility(accessors);
            if (accessibility is null)
                continue;
            members.Add(($"event:{declaredEvent.Name}", new
            {
                targetName = declaredEvent.Name,
                kind = "event",
                @static = accessors.Any(accessor => accessor.IsStatic),
                accessibility,
                genericArity = 0,
                genericParameterIds = Array.Empty<string>(),
                parameters = Array.Empty<object>(),
                dispatchSlots = new[] {
                    (Method: declaredEvent.GetAddMethod(true), Kind: "add"),
                    (Method: declaredEvent.GetRemoveMethod(true), Kind: "remove"),
                }.Where(accessor => accessor.Method is not null && InheritedAccessibility(accessor.Method) is not null)
                    .Select(accessor => InheritedDispatchSlot(accessor.Method!, accessor.Kind)).ToArray(),
            }));
        }
        foreach (var nestedType in type.GetNestedTypes(BindingFlags.Public | BindingFlags.NonPublic))
        {
            var accessibility = nestedType.IsNestedPublic ? "public" : nestedType.IsNestedFamily ? "protected" :
                nestedType.IsNestedFamORAssem ? "protected-internal" : null;
            if (accessibility is null)
                continue;
            var enclosingArity = type.IsGenericType ? type.GetGenericArguments().Length : 0;
            var genericParameters = nestedType.IsGenericType
                ? nestedType.GetGenericArguments().Skip(enclosingArity).ToArray()
                : [];
            members.Add(($"type:{nestedType.Name}", new
            {
                targetName = nestedType.Name.Split('`')[0],
                kind = "type",
                @static = true,
                accessibility,
                genericArity = genericParameters.Length,
                genericParameterIds = genericParameters.Select(GenericParameterIdentity).ToArray(),
                parameters = Array.Empty<object>(),
                dispatchSlots = Array.Empty<object>(),
            }));
        }
        return members.OrderBy(member => member.Key, StringComparer.Ordinal).Select(member => member.Value).ToArray();
    }

    object InheritedDispatchSlot(MethodInfo method, string kind)
    {
        var genericParameters = GenericParameterContext.ForMethod(method, method.DeclaringType!);
        return new
        {
            kind,
            id = MethodId(method),
            baseDefinitionId = MethodId(MetadataBaseDefinition(method)),
            @virtual = method.IsVirtual,
            @abstract = method.IsAbstract,
            final = method.IsFinal,
            accessibility = InheritedAccessibility(method)
                ?? throw new InvalidOperationException($"Native dispatch method '{MethodId(method)}' is not accessible from a derived assembly."),
            genericParameterIds = method.IsGenericMethodDefinition
                ? method.GetGenericArguments().Select(GenericParameterIdentity).ToArray()
                : Array.Empty<string>(),
            parameters = InheritedParameters(method.GetParameters(), genericParameters),
            returnType = TypeRef(UnwrapByRef(method.ReturnType), requireDelegateSourceShape: false,
                genericParameters: genericParameters, includeTopLevelReferenceNullability: false,
                signatureEvidence: SignatureEvidence(method.ReturnParameter))
                ?? throw new InvalidOperationException($"Native dispatch return '{MethodId(method)}' has no exact physical type."),
            returnPassing = ReturnPassingMode(method.ReturnParameter) ?? "by-value",
        };
    }

    object[] InheritedParameters(ParameterInfo[] parameters, GenericParameterContext genericParameters)
    {
        return parameters.Select(parameter => (object)new
        {
            type = TypeRef(parameter.ParameterType, requireDelegateSourceShape: false,
                genericParameters: genericParameters, includeTopLevelReferenceNullability: false,
                signatureEvidence: SignatureEvidence(parameter))
                ?? throw new InvalidOperationException($"Native inherited parameter '{parameter.Member.Name}.{parameter.Name}' has no exact physical type."),
            passingMode = PassingMode(parameter),
        }).ToArray();
    }

    static string? InheritedAccessibility(MethodBase method)
    {
        return method.IsPublic ? "public" : method.IsFamily ? "protected" :
            method.IsFamilyOrAssembly ? "protected-internal" : null;
    }

    static string? InheritedAccessibility(MethodInfo[] accessors)
    {
        return accessors.Any(accessor => accessor.IsPublic) ? "public" :
            accessors.Any(accessor => accessor.IsFamilyOrAssembly) ? "protected-internal" :
            accessors.Any(accessor => accessor.IsFamily) ? "protected" : null;
    }
}
