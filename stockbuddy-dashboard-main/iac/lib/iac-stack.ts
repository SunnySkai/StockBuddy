import * as cdk from 'aws-cdk-lib'
import { Construct } from 'constructs'
import { FrontendBucketConstruct } from './frontend-bucket-construct';
import { CloudFrontDistributionConstruct } from './cf-distribution-construct';
import { BucketDeploymentConstruct } from './bucket-deployment-construct';

export class IacStack extends cdk.Stack {
  public readonly envName: string
  public readonly frontendBucketConstruct: FrontendBucketConstruct
  public readonly cloudFrontDistributionConstruct: CloudFrontDistributionConstruct
  public readonly bucketDeploymentConstruct: BucketDeploymentConstruct

  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props)

    this.envName = process.env.STACK_ENV ?? 'staging'
    this.frontendBucketConstruct = new FrontendBucketConstruct(this, this.envName)
    this.cloudFrontDistributionConstruct = new CloudFrontDistributionConstruct(this, this.frontendBucketConstruct)
    this.bucketDeploymentConstruct = new BucketDeploymentConstruct(this, this.frontendBucketConstruct, this.cloudFrontDistributionConstruct)
  }
}
