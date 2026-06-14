using System.Security.Claims;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.AspNetCore.Authentication.OpenIdConnect;
using Microsoft.AspNetCore.Mvc;

namespace SapAssistant.Api.Endpoints;

public static class AccountEndpoints
{
    public static IEndpointRouteBuilder MapAccountEndpoints(this IEndpointRouteBuilder app, IConfiguration cfg, IHostEnvironment env)
    {
        var frontendBaseUrl = cfg["FrontendBaseUrl"] ?? "/";

        app.MapGet("/signin", ([FromQuery] string? returnUrl, HttpContext http, ILoggerFactory loggerFactory) =>
        {
            var logger = loggerFactory.CreateLogger("SapAuth.Signin");
            var safeReturnUrl = SafeReturnUrl(returnUrl, frontendBaseUrl);

            var incomingCookies = string.Join(",", http.Request.Cookies.Keys);
            logger.LogInformation(
                "/signin entered. IsAuthenticated={Auth} ReturnUrl={Ret} IncomingCookies=[{Cookies}]",
                http.User.Identity?.IsAuthenticated == true,
                safeReturnUrl,
                incomingCookies);

            // If the user already has a valid session, do NOT issue a fresh OIDC
            // challenge. Every challenge sets a new Correlation+Nonce cookie pair;
            // repeated re-entry piles up stale cookies and can push a domain past
            // its browser cookie quota, silently dropping the cookies the new
            // flow needs. Just send the user to their destination.
            if (http.User.Identity?.IsAuthenticated == true)
            {
                logger.LogInformation("/signin short-circuit: already authenticated, redirecting to {Ret}", safeReturnUrl);
                return Results.Redirect(safeReturnUrl);
            }

            logger.LogInformation("/signin issuing OIDC challenge with RedirectUri={Ret}", safeReturnUrl);
            return Results.Challenge(
                new AuthenticationProperties { RedirectUri = safeReturnUrl },
                [OpenIdConnectDefaults.AuthenticationScheme]);
        }).ExcludeFromDescription();

        app.MapGet("/signout", () =>
            Results.SignOut(
                new AuthenticationProperties { RedirectUri = frontendBaseUrl },
                [CookieAuthenticationDefaults.AuthenticationScheme, OpenIdConnectDefaults.AuthenticationScheme]))
            .ExcludeFromDescription();

        app.MapGet("/api/me", (ClaimsPrincipal user) =>
        {
            if (user.Identity?.IsAuthenticated != true)
            {
                return Results.Unauthorized();
            }
            return Results.Ok(new
            {
                isAuthenticated = true,
                name = user.FindFirstValue("name") ?? user.Identity.Name,
                email = user.FindFirstValue("preferred_username")
                        ?? user.FindFirstValue(ClaimTypes.Email),
                provider = "microsoft",
            });
        }).WithName("Me");

        // Only register the dev-mode root redirect when the SPA lives on a
        // different origin (Aspire dev: FrontendBaseUrl=http://localhost:5173).
        // If FrontendBaseUrl is "/" or a relative path, the SPA is served from
        // wwwroot/ on this same origin and the static-file middleware handles
        // `/` -> index.html. Redirecting `/` -> `/` here would cause
        // ERR_TOO_MANY_REDIRECTS.
        if ((env.IsDevelopment() || env.EnvironmentName == "Testing")
            && Uri.TryCreate(frontendBaseUrl, UriKind.Absolute, out _))
        {
            app.MapGet("/", () => Results.Redirect(frontendBaseUrl)).ExcludeFromDescription();
        }

        return app;
    }

    private static string SafeReturnUrl(string? candidate, string frontendBaseUrl)
        => SafeReturnUrlInternal(candidate, frontendBaseUrl);

    // Visible to tests; do not call from production code outside MapAccountEndpoints.
    internal static string SafeReturnUrlInternal(string? candidate, string frontendBaseUrl)
    {
        if (string.IsNullOrWhiteSpace(candidate))
        {
            return frontendBaseUrl;
        }

        // Reject any candidate the .NET Uri parser will not classify as a clean
        // relative path or http(s) absolute URL. In particular: on Windows,
        // `Uri.TryCreate("/contest", UriKind.Absolute, ...)` returns true and
        // produces `file:///contest`, which Edge then refuses to follow after
        // the OIDC callback with ERR_UNSAFE_REDIRECT.

        // Same-origin absolute URLs (http/https only).
        if (Uri.TryCreate(candidate, UriKind.Absolute, out var abs) &&
            (abs.Scheme == Uri.UriSchemeHttp || abs.Scheme == Uri.UriSchemeHttps) &&
            Uri.TryCreate(frontendBaseUrl, UriKind.Absolute, out var feBase) &&
            (feBase.Scheme == Uri.UriSchemeHttp || feBase.Scheme == Uri.UriSchemeHttps) &&
            abs.Host == feBase.Host)
        {
            return abs.ToString();
        }

        // Relative path on this origin. Only accept candidates that start with a
        // single `/` and have no scheme/authority component, so we never
        // accidentally redirect to `//evil.com/...` (protocol-relative) or a
        // back-slash variant Windows would normalize into a UNC path.
        if (candidate.StartsWith('/')
            && !candidate.StartsWith("//", StringComparison.Ordinal)
            && !candidate.StartsWith("/\\", StringComparison.Ordinal))
        {
            // FrontendBaseUrl="/" → return "/contest" as-is (a clean relative
            // URL the browser will resolve against the current origin).
            // FrontendBaseUrl="https://app.example.com" → return absolute.
            if (Uri.TryCreate(frontendBaseUrl, UriKind.Absolute, out var feAbs) &&
                (feAbs.Scheme == Uri.UriSchemeHttp || feAbs.Scheme == Uri.UriSchemeHttps))
            {
                return new Uri(feAbs, candidate).ToString();
            }
            return candidate;
        }

        return frontendBaseUrl;
    }
}
