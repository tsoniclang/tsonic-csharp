using System.Reflection;

sealed partial class ReflectionProvider
{
    sealed class GenericParameterContext
    {
        readonly IReadOnlyDictionary<Type, Type> substitutions;
        readonly IReadOnlyDictionary<Type, string> sourceNames;
        readonly ISet<Type> omittedMethodParameters;

        GenericParameterContext(
            IReadOnlyDictionary<Type, Type> substitutions,
            IReadOnlyDictionary<Type, string> sourceNames,
            ISet<Type> omittedMethodParameters)
        {
            this.substitutions = substitutions;
            this.sourceNames = sourceNames;
            this.omittedMethodParameters = omittedMethodParameters;
        }

        public static GenericParameterContext Empty { get; } = new(
            new Dictionary<Type, Type>(),
            new Dictionary<Type, string>(),
            new HashSet<Type>());

        public static GenericParameterContext ForMethod(MethodInfo method, Type sourceOwnerType)
        {
            return Create(method, sourceOwnerType, new Dictionary<Type, Type>());
        }

        public static GenericParameterContext ForExtensionProjection(MethodInfo method, Type receiverType)
        {
            var receiverParameter = method.GetParameters().FirstOrDefault();
            var substitutions = receiverParameter is null
                ? new Dictionary<Type, Type>()
                : ReceiverGenericParameterSubstitutions(UnwrapByRef(receiverParameter.ParameterType), receiverType);
            return Create(method, receiverType, substitutions);
        }

        public bool TryGetSubstitution(Type parameter, out Type substitution)
        {
            return substitutions.TryGetValue(parameter, out substitution!);
        }

        public bool IsOmitted(Type parameter)
        {
            return omittedMethodParameters.Contains(parameter);
        }

        public string SourceName(Type parameter)
        {
            return sourceNames.TryGetValue(parameter, out var name) ? name : parameter.Name;
        }

        public GenericParameterContext WithConstructedTypeArguments(Type genericTypeDefinition, Type constructedType)
        {
            if (!genericTypeDefinition.IsGenericTypeDefinition || !constructedType.IsGenericType)
            {
                throw new InvalidOperationException("Delegate type substitution requires a generic type definition and a constructed generic type.");
            }
            if (constructedType.GetGenericTypeDefinition() != genericTypeDefinition)
            {
                throw new InvalidOperationException($"Delegate type '{constructedType}' does not close '{genericTypeDefinition}'.");
            }
            var parameters = genericTypeDefinition.GetGenericArguments();
            var arguments = constructedType.GetGenericArguments();
            if (parameters.Length != arguments.Length)
            {
                throw new InvalidOperationException($"Delegate generic type '{constructedType}' has an inconsistent generic arity.");
            }

            var nextSubstitutions = new Dictionary<Type, Type>(substitutions);
            var nextOmitted = new HashSet<Type>(omittedMethodParameters);
            for (var index = 0; index < parameters.Length; index++)
            {
                nextSubstitutions[parameters[index]] = arguments[index];
                nextOmitted.Add(parameters[index]);
            }
            return new GenericParameterContext(
                nextSubstitutions,
                new Dictionary<Type, string>(sourceNames),
                nextOmitted);
        }

        static GenericParameterContext Create(
            MethodInfo method,
            Type sourceOwnerType,
            IReadOnlyDictionary<Type, Type> substitutions)
        {
            var parentNames = sourceOwnerType.IsGenericType
                ? sourceOwnerType.GetGenericArguments()
                    .Where(parameter => parameter.IsGenericParameter)
                    .Select(parameter => parameter.Name)
                    .ToHashSet(StringComparer.Ordinal)
                : new HashSet<string>(StringComparer.Ordinal);
            var usedNames = new HashSet<string>(parentNames, StringComparer.Ordinal);
            var sourceNames = new Dictionary<Type, string>();
            var omitted = new HashSet<Type>(substitutions.Keys);

            if (method.IsGenericMethodDefinition)
            {
                foreach (var parameter in method.GetGenericArguments().Where(parameter => parameter.IsGenericParameter))
                {
                    if (substitutions.ContainsKey(parameter))
                    {
                        continue;
                    }
                    var name = parameter.Name;
                    if (usedNames.Contains(name))
                    {
                        name = UniqueTypeParameterName(name, usedNames);
                    }
                    usedNames.Add(name);
                    if (name != parameter.Name)
                    {
                        sourceNames[parameter] = name;
                    }
                }
            }

            return new GenericParameterContext(substitutions, sourceNames, omitted);
        }

        static string UniqueTypeParameterName(string baseName, HashSet<string> usedNames)
        {
            var candidate = $"{baseName}Method";
            if (!usedNames.Contains(candidate))
            {
                return candidate;
            }
            for (var index = 2; ; index++)
            {
                candidate = $"{baseName}Method{index}";
                if (!usedNames.Contains(candidate))
                {
                    return candidate;
                }
            }
        }

        static Dictionary<Type, Type> ReceiverGenericParameterSubstitutions(Type receiverParameterType, Type receiverType)
        {
            var substitutions = new Dictionary<Type, Type>();
            var matchedReceiverType = MatchingReceiverType(receiverParameterType, receiverType);
            if (matchedReceiverType is not null)
            {
                CollectGenericParameterSubstitutions(receiverParameterType, matchedReceiverType, substitutions);
            }
            return substitutions;
        }

        static Type? MatchingReceiverType(Type receiverParameterType, Type receiverType)
        {
            if (!receiverParameterType.IsGenericType)
            {
                return null;
            }
            var receiverParameterDefinition = receiverParameterType.GetGenericTypeDefinition();
            if (receiverType.IsGenericType && receiverType.GetGenericTypeDefinition() == receiverParameterDefinition)
            {
                return receiverType;
            }
            return receiverType.GetInterfaces().FirstOrDefault(candidate =>
                candidate.IsGenericType && candidate.GetGenericTypeDefinition() == receiverParameterDefinition);
        }

        static void CollectGenericParameterSubstitutions(
            Type receiverParameterType,
            Type receiverType,
            Dictionary<Type, Type> substitutions)
        {
            receiverParameterType = UnwrapByRef(receiverParameterType);
            receiverType = UnwrapByRef(receiverType);

            if (receiverParameterType.IsGenericParameter && receiverParameterType.DeclaringMethod is not null)
            {
                substitutions[receiverParameterType] = receiverType;
                return;
            }
            if (receiverParameterType.HasElementType && receiverType.HasElementType)
            {
                CollectGenericParameterSubstitutions(receiverParameterType.GetElementType()!, receiverType.GetElementType()!, substitutions);
                return;
            }
            if (!receiverParameterType.IsGenericType || !receiverType.IsGenericType)
            {
                return;
            }
            if (receiverParameterType.GetGenericTypeDefinition() != receiverType.GetGenericTypeDefinition())
            {
                return;
            }
            var receiverParameterArguments = receiverParameterType.GetGenericArguments();
            var receiverArguments = receiverType.GetGenericArguments();
            for (var index = 0; index < receiverParameterArguments.Length && index < receiverArguments.Length; index++)
            {
                CollectGenericParameterSubstitutions(receiverParameterArguments[index], receiverArguments[index], substitutions);
            }
        }
    }
}
