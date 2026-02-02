import * as cdk from 'aws-cdk-lib'
import { Construct } from 'constructs'
import { BackendLambdaConstruct } from './backend-lambda-construct'
import { BackendAPIConstruct } from './backend-api-construct'
import { MainTableConstruct } from './main-table-construct'
import { S3BucketConstruct } from './bucket-construct'
import { RemindersConstruct } from './reminders-construct'

export class IacStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    if (!props?.env?.account || !props.env.region) {
      throw new Error('Stack props is missing either the environment variable "account" or "region". Please ensure both are provided')
    }

    const envIdentifier = process.env.ENV_IDENTIFIER
    if (!envIdentifier) throw new Error('Missing environment variable "ENV_IDENTIFIER"')
    if (!process.env.CERTIFICATE_ARN) throw new Error('Missing environment variable "CERTIFICATE_ARN"')
    if (!process.env.API_HOSTNAME) throw new Error('Missing environment variable "API_HOSTNAME"')
    if (!process.env.ROUTE_53_HOSTED_ZONE_DOMAIN_NAME) throw new Error('Missing environment variable "ROUTE_53_HOSTED_ZONE_DOMAIN_NAME"')

    const backendLambda = new BackendLambdaConstruct(this, envIdentifier)
    const backendAPI = new BackendAPIConstruct(this, envIdentifier, backendLambda.lambda)

    const mainTableConstruct = new MainTableConstruct(this, envIdentifier)
    mainTableConstruct.table.grantReadWriteData(backendLambda.lambda)

    const bucketConstruct = new S3BucketConstruct(this, envIdentifier)
    bucketConstruct.bucket.grantRead(backendLambda.lambda)

    new RemindersConstruct(this, envIdentifier, mainTableConstruct.table)

    new cdk.CfnOutput(this, 'BackendAPIUrl', {
      value: backendAPI.api.url
    })
  }
}
