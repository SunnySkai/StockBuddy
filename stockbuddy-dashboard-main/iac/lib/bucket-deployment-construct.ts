import { Construct } from 'constructs'
import { BucketDeployment, Source } from 'aws-cdk-lib/aws-s3-deployment'
import { FrontendBucketConstruct } from './frontend-bucket-construct'
import { CloudFrontDistributionConstruct } from './cf-distribution-construct'
import { CfnDistribution } from 'aws-cdk-lib/aws-cloudfront'
import * as route53 from 'aws-cdk-lib/aws-route53'
import * as targets from 'aws-cdk-lib/aws-route53-targets'

const path = './../frontend/dist'

export class BucketDeploymentConstruct extends Construct {
  public readonly bucketDeployment: BucketDeployment

  constructor(
    scope: Construct,
    private readonly frontendBucketConstruct: FrontendBucketConstruct,
    private readonly cloudFrontDistributionConstruct: CloudFrontDistributionConstruct
  ) {
    super(scope, 'BucketDeploymentConstruct')

    this.bucketDeployment = new BucketDeployment(this, 'BucketDeployment', {
      sources: [Source.asset(path)],
      destinationBucket: this.frontendBucketConstruct.bucket,
      distribution: this.cloudFrontDistributionConstruct.distribution,
      distributionPaths: ['/*']
    })

    const uiHostname = process.env.UI_HOSTNAME ?? ''
    if (!uiHostname) {
      throw new Error('UI_HOSTNAME environment variable is not set')
    }

    const hostedZoneDomainName = process.env.ROUTE_53_HOSTED_ZONE_DOMAIN_NAME ?? ''
    if (!hostedZoneDomainName) {
      throw new Error('ROUTE_53_HOSTED_ZONE_DOMAIN_NAME environment variable is not set')
    }

    const hostedZone = route53.HostedZone.fromLookup(this, 'HostedZone', {
      domainName: hostedZoneDomainName
    })

    new route53.ARecord(this, 'AliasRecord', {
      zone: hostedZone,
      recordName: uiHostname,
      target: route53.RecordTarget.fromAlias(new targets.CloudFrontTarget(this.cloudFrontDistributionConstruct.distribution))
    })

    const cfnDistribution = this.cloudFrontDistributionConstruct.distribution.node.defaultChild as CfnDistribution
    cfnDistribution.addOverride('Properties.DistributionConfig.Aliases', [uiHostname])

    const certificateArn = process.env.CERTIFICATE_ARN ?? ''
    if (!certificateArn) {
      throw new Error('CERTIFICATE_ARN environment variable is not set')
    }

    cfnDistribution.addOverride('Properties.DistributionConfig.ViewerCertificate', {
      AcmCertificateArn: certificateArn,
      SslSupportMethod: 'sni-only'
    })
  }
}
