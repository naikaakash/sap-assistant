// =============================================================================
// sap-assistant — production infrastructure.
//
// One file on purpose: small project, easy to read top to bottom.
//
// Resources:
//   - Log Analytics workspace (free tier 5GB/day cap)
//   - Application Insights (workspace-based)
//   - User-assigned Managed Identity (UAMI) → used by Container App
//   - Container Apps Environment (Consumption workload profile, scale-to-zero)
//   - Container App pulling a public image from GHCR
//   - Key Vault RBAC: UAMI gets "Key Vault Secrets User"
//
// The Key Vault itself already exists (sapassistantkv01) and is RBAC-mode; we
// only add the role assignment here. CI/CD updates the Container App image tag
// via `az containerapp update --image ...`.
// =============================================================================

targetScope = 'resourceGroup'

@description('Short app name; used as the base for every resource name.')
param appName string = 'sapassistant'

@description('Azure region for all resources.')
param location string = resourceGroup().location

@description('Name of the existing Key Vault that holds OAuth secrets.')
param keyVaultName string = 'sapassistantkv01'

@description('Fully qualified container image, e.g. ghcr.io/naikaakash/sap-assistant:latest. The first deploy uses a placeholder; CI overrides with --image.')
param containerImage string = 'mcr.microsoft.com/k8se/quickstart:latest'

@description('Daily ingestion cap (GB) for Log Analytics to protect cost.')
param logAnalyticsDailyCapGb int = 1

@description('Entra ID tenant authority for the issuer URL. Use "common" for multi-tenant/MSA apps, or a specific tenant GUID for single-tenant apps. Default matches the existing Entra app (signInAudience=AzureADandPersonalMicrosoftAccount).')
param entraTenantId string = 'common'

@description('Comma-separated allowlist of emails / UPNs permitted to sign in. Checked in Auth.js `signIn` callback against profile.email, profile.preferred_username, and user.email (case-insensitive). Empty = open (NOT recommended in prod).')
param authAllowedEmails string = 'aakash_a_naik@yahoo.com'

@description('Data source for the procurement app. "sql" reads/writes Azure SQL; "csv" falls back to bundled CSV + local JSON files.')
@allowed([ 'sql', 'csv' ])
param dataSource string = 'sql'

@description('Azure SQL logical server name (no .database.windows.net suffix).')
param sqlServerName string = 'sapassistant-sql-2606142214'

@description('Azure SQL database name.')
param sqlDatabaseName string = 'procurement'

@description('Azure OpenAI resource name (subdomain of openai.azure.com).')
param aoaiResource string = 'sapassistant-aoai'

@description('Azure OpenAI deployment name (per-model endpoint).')
param aoaiDeployment string = 'gpt-41-nano'

// -----------------------------------------------------------------------------
// Naming
// -----------------------------------------------------------------------------
var uamiName        = '${appName}-uami'
var lawName         = '${appName}-law'
var appiName        = '${appName}-appi'
var envName         = '${appName}-env'
var appResourceName = '${appName}-app'

// -----------------------------------------------------------------------------
// User-assigned Managed Identity
// -----------------------------------------------------------------------------
resource uami 'Microsoft.ManagedIdentity/userAssignedIdentities@2024-11-30' = {
  name: uamiName
  location: location
}

// -----------------------------------------------------------------------------
// Log Analytics + App Insights
// -----------------------------------------------------------------------------
resource law 'Microsoft.OperationalInsights/workspaces@2023-09-01' = {
  name: lawName
  location: location
  properties: {
    sku: { name: 'PerGB2018' }
    retentionInDays: 30
    workspaceCapping: { dailyQuotaGb: logAnalyticsDailyCapGb }
    features: { enableLogAccessUsingOnlyResourcePermissions: true }
  }
}

resource appi 'Microsoft.Insights/components@2020-02-02' = {
  name: appiName
  location: location
  kind: 'web'
  properties: {
    Application_Type: 'web'
    WorkspaceResourceId: law.id
  }
}

// -----------------------------------------------------------------------------
// Container Apps Environment (Consumption profile, scale to zero)
// -----------------------------------------------------------------------------
resource env 'Microsoft.App/managedEnvironments@2024-10-02-preview' = {
  name: envName
  location: location
  properties: {
    appLogsConfiguration: {
      destination: 'log-analytics'
      logAnalyticsConfiguration: {
        customerId: law.properties.customerId
        sharedKey: law.listKeys().primarySharedKey
      }
    }
    workloadProfiles: [
      {
        name: 'Consumption'
        workloadProfileType: 'Consumption'
      }
    ]
  }
}

// -----------------------------------------------------------------------------
// Container App
// Public ingress, HTTPS-only, autoscale 0→3 on HTTP concurrency.
// FrontendBaseUrl is itself; same origin serves SPA + API.
// -----------------------------------------------------------------------------
resource app 'Microsoft.App/containerApps@2024-10-02-preview' = {
  name: appResourceName
  location: location
  identity: {
    type: 'UserAssigned'
    userAssignedIdentities: {
      '${uami.id}': {}
    }
  }
  properties: {
    managedEnvironmentId: env.id
    workloadProfileName: 'Consumption'
    configuration: {
      activeRevisionsMode: 'Single'
      ingress: {
        external: true
        targetPort: 8080
        transport: 'auto'
        allowInsecure: false
      }
      secrets: [
        {
          name: 'auth-secret'
          keyVaultUrl: '${kv.properties.vaultUri}secrets/AUTH-SECRET'
          identity: uami.id
        }
        {
          name: 'entra-client-id'
          keyVaultUrl: '${kv.properties.vaultUri}secrets/OAuth-Microsoft-ClientId'
          identity: uami.id
        }
        {
          name: 'entra-client-secret'
          keyVaultUrl: '${kv.properties.vaultUri}secrets/OAuth-Microsoft-ClientSecret'
          identity: uami.id
        }
        {
          name: 'aoai-key'
          keyVaultUrl: '${kv.properties.vaultUri}secrets/AOAI-Key'
          identity: uami.id
        }
        {
          name: 'sql-conn'
          keyVaultUrl: '${kv.properties.vaultUri}secrets/SQL-ConnectionString'
          identity: uami.id
        }
      ]
    }
    template: {
      containers: [
        {
          name: 'web'
          image: containerImage
          resources: {
            cpu: json('0.5')
            memory: '1Gi'
          }
          env: [
            { name: 'NODE_ENV',                       value: 'production' }
            { name: 'PORT',                           value: '8080' }
            { name: 'HOSTNAME',                       value: '0.0.0.0' }
            { name: 'AUTH_TRUST_HOST',                value: 'true' }
            { name: 'AUTH_URL',                       value: 'https://${appResourceName}.${env.properties.defaultDomain}' }
            { name: 'AUTH_MICROSOFT_ENTRA_ID_ISSUER', value: 'https://login.microsoftonline.com/${entraTenantId}/v2.0' }
            { name: 'AUTH_SECRET',                    secretRef: 'auth-secret' }
            { name: 'AUTH_MICROSOFT_ENTRA_ID_ID',     secretRef: 'entra-client-id' }
            { name: 'AUTH_MICROSOFT_ENTRA_ID_SECRET', secretRef: 'entra-client-secret' }
            { name: 'AUTH_ALLOWED_EMAILS',            value: authAllowedEmails }
            { name: 'AZURE_CLIENT_ID',                value: uami.properties.clientId }
            { name: 'APPLICATIONINSIGHTS_CONNECTION_STRING', value: appi.properties.ConnectionString }
            { name: 'NEXT_TELEMETRY_DISABLED',        value: '1' }
            // ---- Data layer (Phase 3) ----
            { name: 'DATA_SOURCE',                    value: dataSource }
            { name: 'SQL_SERVER',                     value: '${sqlServerName}.database.windows.net' }
            { name: 'SQL_DATABASE',                   value: sqlDatabaseName }
            { name: 'SQL_CONNECTION_STRING',          secretRef: 'sql-conn' }
            // ---- Azure OpenAI ----
            { name: 'AZURE_OPENAI_RESOURCE',          value: aoaiResource }
            { name: 'AZURE_OPENAI_DEPLOYMENT',        value: aoaiDeployment }
            { name: 'AZURE_OPENAI_KEY',               secretRef: 'aoai-key' }
          ]
        }
      ]
      scale: {
        minReplicas: 1
        maxReplicas: 3
        rules: [
          {
            name: 'http-concurrency'
            http: {
              metadata: { concurrentRequests: '50' }
            }
          }
        ]
      }
    }
  }
}

// -----------------------------------------------------------------------------
// Key Vault role: UAMI → Key Vault Secrets User on the existing vault.
// (RoleDefinitionId is constant across all subscriptions.)
// -----------------------------------------------------------------------------
resource kv 'Microsoft.KeyVault/vaults@2024-04-01-preview' existing = {
  name: keyVaultName
}

var kvSecretsUserRoleId = '4633458b-17de-408a-b874-0445c86b69e6'

resource kvRole 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  scope: kv
  name: guid(kv.id, uami.id, kvSecretsUserRoleId)
  properties: {
    principalId: uami.properties.principalId
    principalType: 'ServicePrincipal'
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', kvSecretsUserRoleId)
  }
}

// -----------------------------------------------------------------------------
// Outputs (consumed by CI logs + manual smoke testing)
// -----------------------------------------------------------------------------
output containerAppName     string = app.name
output containerAppFqdn     string = app.properties.configuration.ingress.fqdn
output containerAppUrl      string = 'https://${app.properties.configuration.ingress.fqdn}'
output uamiClientId         string = uami.properties.clientId
output uamiPrincipalId      string = uami.properties.principalId
output envName              string = env.name
output appInsightsName      string = appi.name
