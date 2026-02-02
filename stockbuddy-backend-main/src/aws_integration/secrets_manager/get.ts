import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager'

// Create client with local development support
const createSecretsManagerClient = () => {
  const config: any = {
    region: process.env.AWS_REGION || 'eu-central-1'
  }

  // For local development, use local credentials if endpoint is specified
  if (process.env.LOCAL === 'true' && process.env.AWS_ENDPOINT_URL) {
    config.credentials = {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID || 'stockbuddyaccesskey',
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || 'stockbuddysecretaccesskey'
    }
  }

  return new SecretsManagerClient(config)
}

const client = createSecretsManagerClient()

interface Secret {
  [key: string]: string
}

const secretCache = new Map<string, Secret>()

export async function getSecretValue(secretName: string): Promise<Secret> {
  // For local development, use environment variable if available
  if (process.env.LOCAL === 'true' && process.env.APP_SECRET_VALUE) {
    const localSecret = { value: process.env.APP_SECRET_VALUE }
    secretCache.set(secretName, localSecret)
    return localSecret
  }

  if (secretCache.has(secretName)) {
    return secretCache.get(secretName)!
  }

  try {
    const command = new GetSecretValueCommand({ SecretId: secretName })
    const data = await client.send(command)

    let secret: Secret
    if (data.SecretString) {
      secret = JSON.parse(data.SecretString)
    } else if (data.SecretBinary) {
      const buff = Buffer.from(data.SecretBinary as Uint8Array)
      secret = { value: buff.toString('ascii') }
    } else {
      throw new Error('Secret is neither a string nor a binary.')
    }

    secretCache.set(secretName, secret)
    return secret
  } catch (error) {
    // For local development, provide a fallback
    if (process.env.LOCAL === 'true') {
      console.warn(`⚠️  Could not fetch secret '${secretName}' from AWS, using local fallback`)
      const fallbackSecret = { value: 'local-development-secret-key-change-in-production' }
      secretCache.set(secretName, fallbackSecret)
      return fallbackSecret
    }
    throw error
  }
}
