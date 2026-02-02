import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'

const BUCKET_NAME = `tixworld-raw-bucket-${process.env.ENV_IDENTIFIER}`
const EXPIRATION_TIME_IN_SECONDS = 60

const client = new S3Client({ region: process.env.AWS_REGION })

export async function getPresignedUrl(fileKey: string, contentType: string) {
  const params = {
    Bucket: BUCKET_NAME,
    Key: fileKey,
    ContentType: contentType
  }

  const command = new PutObjectCommand(params)

  try {
    const url = await getSignedUrl(client, command, { expiresIn: EXPIRATION_TIME_IN_SECONDS })
    return url
  } catch (error) {
    throw error
  }
}
