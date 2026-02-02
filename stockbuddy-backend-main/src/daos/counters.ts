import { DynamoDBClient, UpdateItemCommand } from '@aws-sdk/client-dynamodb'
import { marshall, unmarshall } from '@aws-sdk/util-dynamodb'
import { organizationPk } from './organization'

type CounterEntity = 'TRANSACTION' | 'VENDOR' | 'BANK' | 'DIRECTORY_CUSTOMER' | 'DIRECTORY_COUNTERPARTY'

const counterSk = (entity: CounterEntity) => `COUNTER#${entity}`

const requireTableName = (): string => {
  const tableName = process.env.TABLE_NAME
  if (!tableName) {
    throw new Error('Missing env variable: TABLE_NAME')
  }
  return tableName
}

const client = new DynamoDBClient({ region: process.env.AWS_REGION })

export const nextDisplayId = async (
  tenant: string,
  organizationId: string,
  entity: CounterEntity
): Promise<number> => {
  const tableName = requireTableName()
  const now = new Date().toISOString()
  const response = await client.send(new UpdateItemCommand({
    TableName: tableName,
    Key: marshall({
      PK: organizationPk(tenant, organizationId),
      SK: counterSk(entity)
    }),
    UpdateExpression:
      'SET updated_at = :ua, created_at = if_not_exists(created_at, :ua), entity_type = :entity ADD #value :inc',
    ExpressionAttributeNames: {
      '#value': 'current_value'
    },
    ExpressionAttributeValues: marshall({
      ':ua': now,
      ':entity': `COUNTER#${entity}`,
      ':inc': 1
    }),
    ReturnValues: 'UPDATED_NEW'
  }))

  if (!response.Attributes) {
    throw new Error('Unable to generate display id.')
  }
  const attributes = unmarshall(response.Attributes) as { current_value?: number }
  if (typeof attributes.current_value !== 'number') {
    throw new Error('Unable to generate display id.')
  }
  return attributes.current_value
}
