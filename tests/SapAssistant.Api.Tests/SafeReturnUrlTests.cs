using SapAssistant.Api.Endpoints;

namespace SapAssistant.Api.Tests;

public class SafeReturnUrlTests
{
    // Regression: on Windows .NET, Uri.TryCreate("/contest", UriKind.Absolute, ...)
    // returns true and produces `file:///contest`. The previous SafeReturnUrl
    // implementation accepted that and handed `file:///contest` to OIDC as the
    // RedirectUri. After the IdP callback, Edge refused to follow the redirect
    // with ERR_UNSAFE_REDIRECT. The result MUST stay scoped to the app origin.
    [Theory]
    [InlineData("/contest", "/", "/contest")]
    [InlineData("/contest", "https://app.example.com", "https://app.example.com/contest")]
    [InlineData("/contest", "http://localhost:5173", "http://localhost:5173/contest")]
    [InlineData("/", "/", "/")]
    [InlineData("/", "https://app.example.com", "https://app.example.com/")]
    public void Relative_paths_resolve_against_frontend_base_without_file_scheme(
        string candidate, string frontendBaseUrl, string expected)
    {
        var actual = AccountEndpoints.SafeReturnUrlInternal(candidate, frontendBaseUrl);
        Assert.Equal(expected, actual);
        Assert.DoesNotContain("file:", actual, StringComparison.OrdinalIgnoreCase);
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("   ")]
    public void Empty_candidate_returns_frontend_base(string? candidate)
    {
        Assert.Equal("/", AccountEndpoints.SafeReturnUrlInternal(candidate, "/"));
        Assert.Equal("https://app.example.com",
            AccountEndpoints.SafeReturnUrlInternal(candidate, "https://app.example.com"));
    }

    // Same-origin absolute URLs are allowed; cross-origin and dangerous schemes
    // fall back to the frontend base so we never open-redirect the user.
    [Theory]
    [InlineData("https://app.example.com/contest", "https://app.example.com", "https://app.example.com/contest")]
    [InlineData("https://evil.com/steal", "https://app.example.com", "https://app.example.com")]
    [InlineData("//evil.com/steal", "/", "/")]
    [InlineData("/\\evil.com/steal", "/", "/")]
    [InlineData("file:///etc/passwd", "/", "/")]
    [InlineData("javascript:alert(1)", "/", "/")]
    public void Dangerous_candidates_fall_back_to_frontend_base(
        string candidate, string frontendBaseUrl, string expected)
    {
        var actual = AccountEndpoints.SafeReturnUrlInternal(candidate, frontendBaseUrl);
        Assert.Equal(expected, actual);
    }
}
