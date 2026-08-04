using System.Linq.Expressions;

namespace Shared;

public sealed class Widget
{
    public int Count() => 101;
}

public class ProviderBase
{
    public string ProviderName { get; set; } = "";
}

public sealed class ProviderPayload
{
    public string Name { get; set; } = "";
}

public sealed class ProviderStore
{
    public ProviderPayload? Find() => null;

    public string[] Names() => ["alpha", "beta", "alpha"];
}

public sealed class NarrowVisitor : ExpressionVisitor
{
    public override Expression? Visit(Expression? node) => base.Visit(node);
}
