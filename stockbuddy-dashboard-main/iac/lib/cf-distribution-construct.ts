import { Construct } from 'constructs'
import { CfnOutput } from 'aws-cdk-lib'
import { Distribution, ViewerProtocolPolicy } from 'aws-cdk-lib/aws-cloudfront'
import { S3Origin } from 'aws-cdk-lib/aws-cloudfront-origins'
import { FrontendBucketConstruct } from './frontend-bucket-construct'

export class CloudFrontDistributionConstruct extends Construct {
  public readonly distribution: Distribution

  constructor (
    scope: Construct,
    private readonly frontendBucketConstruct: FrontendBucketConstruct
  ) {
    super(scope, 'CloudFrontDistributionConstruct')

    this.distribution = new Distribution(this, 'StockBuddyDashboardAppCloudfrontDistribution', {
      defaultBehavior: {
        origin: new S3Origin(this.frontendBucketConstruct.bucket),
        viewerProtocolPolicy: ViewerProtocolPolicy.REDIRECT_TO_HTTPS
      },
      defaultRootObject: 'index.html',
      errorResponses: [{
        httpStatus: 403,
        responseHttpStatus: 200,
        responsePagePath: '/index.html',
      }, {
        httpStatus: 404,
        responseHttpStatus: 200,
        responsePagePath: '/index.html',
      }]
    })

    new CfnOutput(this, 'StockBuddyDashboardAppCloudFrontURL', {
      value: this.distribution.domainName,
      description: 'The distribution URL',
      exportName: 'StockBuddyDashboardAppCloudfrontURL'
    })
  }
}
