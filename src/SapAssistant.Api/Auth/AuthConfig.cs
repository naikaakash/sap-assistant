using Azure.Identity;
using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.AspNetCore.Authentication.OpenIdConnect;
using Microsoft.Identity.Web;

namespace SapAssistant.Api.Auth;

/// <summary>
/// Wires up Azure Key Vault → Microsoft Entra OIDC → cookie sessions.
///
/// Local dev: uses your `az login` credentials to read secrets from Key Vault.
/// Prod (Container Apps): uses the system-assigned managed identity.
/// Tests: skipped entirely if KeyVault:Name is not configured.
/// </summary>
public static class AuthConfig
{
    public static IServiceCollection AddSapAuth(this IServiceCollection services, IConfigurationManager configuration, IHostEnvironment env)
    {
        var keyVaultName = configuration["KeyVault:Name"];
        var disableAuth = configuration.GetValue<bool>("Auth:Disable")
                           || env.EnvironmentName == "Testing";

        if (disableAuth || string.IsNullOrWhiteSpace(keyVaultName))
        {
            services
                .AddAuthentication(CookieAuthenticationDefaults.AuthenticationScheme)
                .AddCookie(o => ConfigureCookie(o, env));
            services.AddAuthorization();
            return services;
        }

        configuration.AddAzureKeyVault(
            new Uri($"https://{keyVaultName}.vault.azure.net/"),
            new DefaultAzureCredential());

        var azureAdSettings = new Dictionary<string, string?>
        {
            ["AzureAd:Instance"] = "https://login.microsoftonline.com/",
            ["AzureAd:TenantId"] = configuration["OAuth-Microsoft-TenantId"] ?? "common",
            ["AzureAd:ClientId"] = configuration["OAuth-Microsoft-ClientId"],
            ["AzureAd:ClientSecret"] = configuration["OAuth-Microsoft-ClientSecret"],
            ["AzureAd:CallbackPath"] = "/signin-oidc",
            ["AzureAd:SignedOutCallbackPath"] = "/signout-callback-oidc",
        };
        configuration.AddInMemoryCollection(azureAdSettings);

        services
            .AddAuthentication(CookieAuthenticationDefaults.AuthenticationScheme)
            .AddMicrosoftIdentityWebApp(configuration.GetSection("AzureAd"));

        // Force authorization code flow with query response mode. Two reasons:
        //   1. Modern best practice (PKCE-capable, tokens never in URL fragment / form body).
        //   2. The callback arrives as a top-level GET redirect from login.microsoftonline.com,
        //      so the OIDC correlation/nonce cookies can be SameSite=Lax. That sidesteps
        //      browsers (Edge, Safari) that block third-party cookies — form_post would
        //      require SameSite=None+Secure cookies on a cross-site POST, which get dropped
        //      when third-party cookies are blocked, causing "Correlation failed".
        services.Configure<OpenIdConnectOptions>(
            OpenIdConnectDefaults.AuthenticationScheme,
            o =>
            {
                o.ResponseType = "code";
                o.ResponseMode = "query";
                o.UsePkce = true;
                o.SaveTokens = true;

                // Defense in depth: never let a remote auth failure produce an opaque 500
                // (Edge renders that as ERR_UNSAFE_REDIRECT). Redirect to / with a query
                // string the SPA can read and surface to the user.
                o.Events.OnRemoteFailure = ctx =>
                {
                    ctx.HandleResponse();
                    var reason = Uri.EscapeDataString(ctx.Failure?.Message ?? "unknown");
                    ctx.Response.Redirect($"/?auth=error&reason={reason}");
                    return Task.CompletedTask;
                };
                o.Events.OnAccessDenied = ctx =>
                {
                    ctx.HandleResponse();
                    ctx.Response.Redirect("/?auth=denied");
                    return Task.CompletedTask;
                };
            });

        // Microsoft.Identity.Web wires the plain "Cookies" scheme — configure THAT, not the
        // ASP.NET Identity application cookie. Use Configure<TOptions>(scheme, ...) so it
        // overrides anything M.I.W. set.
        services.Configure<CookieAuthenticationOptions>(
            CookieAuthenticationDefaults.AuthenticationScheme,
            o => ConfigureCookie(o, env));

        services.AddAuthorization();
        return services;
    }

    private static void ConfigureCookie(Microsoft.AspNetCore.Authentication.Cookies.CookieAuthenticationOptions o, IHostEnvironment env)
    {
        o.Cookie.Name = "sap-assistant-auth";
        o.Cookie.HttpOnly = true;
        o.Cookie.SameSite = SameSiteMode.Lax;
        o.Cookie.SecurePolicy = env.IsDevelopment() || env.EnvironmentName == "Testing"
            ? CookieSecurePolicy.SameAsRequest
            : CookieSecurePolicy.Always;
        o.SlidingExpiration = true;
        o.ExpireTimeSpan = TimeSpan.FromDays(14);
        o.Events.OnRedirectToLogin = ctx =>
        {
            if (ctx.Request.Path.StartsWithSegments("/api"))
            {
                ctx.Response.StatusCode = StatusCodes.Status401Unauthorized;
                return Task.CompletedTask;
            }
            ctx.Response.Redirect(ctx.RedirectUri);
            return Task.CompletedTask;
        };
    }
}
