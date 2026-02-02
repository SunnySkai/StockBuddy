import { DynamoDBClient, GetItemCommand, PutItemCommand, DeleteItemCommand } from '@aws-sdk/client-dynamodb'
import { marshall, unmarshall } from '@aws-sdk/util-dynamodb'
import { OTP } from '../models/otp'

const TABLE_NAME = process.env.TABLE_NAME

const otpPk = (tenant: string, code: string) => `TENANT#${tenant}#OTP#${code}`

const client = new DynamoDBClient({ region: process.env.AWS_REGION })

export async function insertOtpCode(tenant: string, code: number, email: string, expiryDate: Date): Promise<void> {
  await client.send(new PutItemCommand({
    TableName: TABLE_NAME,
    Item: marshall({
      PK: otpPk(tenant, email),
      SK: 'CODE',
      code,
      expiry_date: expiryDate.toISOString(),
      created_at: new Date().toISOString()
    })
  }))
}

export async function getOtpByEmail(tenant: string, email: string): Promise<OTP | null> {
  const res = await client.send(new GetItemCommand({
    TableName: TABLE_NAME,
    Key: marshall({ PK: otpPk(tenant, email), SK: 'CODE' })
  }))
  return res.Item ? unmarshall(res.Item) as OTP : null
}

export async function deleteOtp(tenant: string, email: string): Promise<void> {
  await client.send(new DeleteItemCommand({
    TableName: TABLE_NAME,
    Key: marshall({ PK: otpPk(tenant, email), SK: 'CODE' })
  }))
}
