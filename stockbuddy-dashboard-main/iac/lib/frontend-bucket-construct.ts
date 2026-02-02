import { Construct } from 'constructs'
import { CfnOutput, RemovalPolicy } from 'aws-cdk-lib'
import { BlockPublicAccess, Bucket } from 'aws-cdk-lib/aws-s3'

export class FrontendBucketConstruct extends Construct {
  public readonly bucket: Bucket

  constructor(scope: Construct, envName: string) {
    super(scope, 'FrontendBucketConstruct')

    this.bucket = new Bucket(this, 'StockBuddyFrontendBucket', {
      bucketName: `stock-buddy-web-bucket-${envName}`,
      autoDeleteObjects: true,
      blockPublicAccess: BlockPublicAccess.BLOCK_ALL,
      removalPolicy: RemovalPolicy.DESTROY
    })

    new CfnOutput(this, 'StockBuddyDashboardFrontendBucketName', {
      value: this.bucket.bucketName,
      description: 'Bucket holding stock buddy frontend app assets',
      exportName: 'StockBuddyDashboardFrontendBucketName'
    })
  }
}
