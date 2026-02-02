import { Construct } from 'constructs'
import { BlockPublicAccess, Bucket } from 'aws-cdk-lib/aws-s3'
import { RemovalPolicy } from 'aws-cdk-lib'
import { Effect, PolicyStatement, AnyPrincipal } from 'aws-cdk-lib/aws-iam'

export class S3BucketConstruct extends Construct {
  public bucket: Bucket

  constructor(scope: Construct, envName: string) {
    super(scope, 'S3BucketConstruct')

    this.bucket = new Bucket(this, `StockBuddyRawBucket-${envName}`, {
      bucketName: `stockbuddy-raw-bucket-${envName}`,
      versioned: true,
      removalPolicy: envName !== 'prod' ? RemovalPolicy.DESTROY : RemovalPolicy.RETAIN,
      autoDeleteObjects: envName !== 'prod',
      blockPublicAccess: BlockPublicAccess.BLOCK_ACLS
    })

    this.addPermission()
  }

  private addPermission() {
    const policy = new PolicyStatement({
      effect: Effect.ALLOW,
      actions: ['s3:GetObject', 's3:PutObject'],
      resources: [this.bucket.arnForObjects('*')],
      principals: [new AnyPrincipal()]
    })

    this.bucket.addToResourcePolicy(policy)
  }
}
