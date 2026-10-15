using System.Reflection;

sealed partial class ReflectionProvider
{
    IEnumerable<object> Members(Type type)
    {
        foreach (var member in Constructors(type))
        {
            yield return member;
        }

        foreach (var member in Properties(type))
        {
            yield return member;
        }

        foreach (var member in Fields(type))
        {
            yield return member;
        }

        foreach (var member in Events(type))
        {
            yield return member;
        }

        foreach (var group in Methods(type).GroupBy(MethodGroupKey))
        {
            var first = group.First();
            var signatures = group.Select(method => MethodSignature(method)).Where(signature => signature is not null).Cast<object>().ToArray();
            if (signatures.Length == 0)
            {
                continue;
            }
            yield return new
            {
                kind = "method",
                sourceName = SourceMemberName(first.Name),
                targetName = first.Name,
                targetId = $"{TargetId(type)}.{first.Name}",
                metadataName = $"{MetadataName(type)}.{first.Name}",
                @static = first.IsStatic ? true : (bool?)null,
                signatures,
            };
        }

        foreach (var member in ExtensionProjectionMembers(type))
        {
            yield return member;
        }

        foreach (var group in Operators(type).GroupBy(OperatorProjectionGroupKey))
        {
            var first = group.First();
            var projection = OperatorSourceProjectionFor(first);
            if (projection is null)
            {
                continue;
            }
            var signatures = group.Select(method =>
            {
                var selected = OperatorSourceProjectionFor(method);
                return selected is null
                    ? null
                    : MethodSignature(method, targetInvocation: new
                    {
                        kind = "native-operator",
                        form = selected.Form,
                        @operator = selected.Operator,
                        operandParameterIndexes = Enumerable.Range(0, method.GetParameters().Length).ToArray(),
                        @checked = selected.Checked ? true : (bool?)null,
                    });
            }).Where(signature => signature is not null).Cast<object>().ToArray();
            if (signatures.Length == 0)
            {
                continue;
            }
            yield return new
            {
                kind = "operator",
                sourceName = projection.SourceName,
                targetName = first.Name,
                targetId = $"{TargetId(type)}.{first.Name}",
                metadataName = $"{MetadataName(type)}.{first.Name}",
                @static = first.IsStatic ? true : (bool?)null,
                sourceStatic = false,
                sourceProjection = "operator-adapter",
                receiverPassing = "target-parameter",
                sourceReceiverParameterIndex = projection.ReceiverParameterIndex,
                signatures,
            };
        }
    }

    object[] UnsupportedMembers(Type type)
    {
        return UnsupportedConstructors(type)
            .Concat(UnsupportedProperties(type))
            .Concat(UnsupportedFields(type))
            .Concat(UnsupportedMethods(type))
            .Concat(UnsupportedOperators(type))
            .Concat(UnsupportedSourceEvents(type))
            .ToArray();
    }

    IEnumerable<object> Constructors(Type type)
    {
        foreach (var constructor in type.GetConstructors(BindingFlags.Public | BindingFlags.Instance | BindingFlags.DeclaredOnly).OrderBy(ConstructorId, StringComparer.Ordinal))
        {
            var signature = ConstructorSignature(type, constructor);
            if (signature is null)
            {
                continue;
            }
            yield return new
            {
                kind = "constructor",
                sourceName = "constructor",
                targetName = ".ctor",
                targetId = ConstructorId(constructor),
                metadataName = ConstructorMetadataName(constructor),
                signatures = new[] { signature },
            };
        }
    }

    IEnumerable<object> UnsupportedConstructors(Type type)
    {
        foreach (var constructor in type.GetConstructors(BindingFlags.Public | BindingFlags.Instance | BindingFlags.DeclaredOnly).OrderBy(ConstructorId, StringComparer.Ordinal))
        {
            var reason = UnsupportedConstructorReason(constructor);
            if (reason is null)
            {
                continue;
            }
            yield return UnsupportedMember(
                "constructor",
                "constructor",
                ".ctor",
                ConstructorId(constructor),
                ConstructorMetadataName(constructor),
                false,
                reason);
        }
    }

    string? UnsupportedConstructorReason(ConstructorInfo constructor)
    {
        return UnsupportedParametersReason(constructor.GetParameters(), "Constructor signature");
    }

    static object UnsupportedMember(
        string memberKind,
        string sourceName,
        string targetName,
        string targetId,
        string metadataName,
        bool isStatic,
        string reason)
    {
        return new
        {
            kind = "unsupported-member",
            memberKind,
            sourceName,
            targetName,
            targetId,
            metadataName,
            @static = isStatic ? true : (bool?)null,
            reason,
        };
    }

}
