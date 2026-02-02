import { DynamoDBClient } from '@aws-sdk/client-dynamodb'

// Create DynamoDB client with local development support
const createDynamoDBClient = (): DynamoDBClient => {
  const config: any = {
    region: process.env.AWS_REGION || 'eu-central-1'
  }

  // For local development with DynamoDB Local
  if (process.env.LOCAL === 'true' && process.env.AWS_ENDPOINT_URL) {
    config.endpoint = process.env.AWS_ENDPOINT_URL
    config.credentials = {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID || 'stockbuddyaccesskey',
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || 'stockbuddysecretaccesskey'
    }
    
    console.log(`🔧 DynamoDB Client configured for LOCAL development:`)
    console.log(`   Endpoint: ${config.endpoint}`)
    console.log(`   Region: ${config.region}`)
    console.log(`   Table: ${process.env.TABLE_NAME}`)
  } else {
    console.log(`☁️  DynamoDB Client configured for AWS:`)
    console.log(`   Region: ${config.region}`)
    console.log(`   Table: ${process.env.TABLE_NAME}`)
  }

  return new DynamoDBClient(config)
}

// Export singleton client instance
export const dynamoDBClient = createDynamoDBClient()

// Export table name for convenience
export const TABLE_NAME = process.env.TABLE_NAME

if (!TABLE_NAME) {
  throw new Error('TABLE_NAME environment variable is required')
}