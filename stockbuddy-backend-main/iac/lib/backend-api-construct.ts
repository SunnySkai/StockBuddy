import { LambdaRestApi } from 'aws-cdk-lib/aws-apigateway'
import { Certificate, ICertificate } from 'aws-cdk-lib/aws-certificatemanager'
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs'
import { ARecord, HostedZone, RecordTarget } from 'aws-cdk-lib/aws-route53'
import { ApiGateway } from 'aws-cdk-lib/aws-route53-targets'
import { Construct } from 'constructs'

export class BackendAPIConstruct extends Construct {
  private envName: string
  private backendLambda: NodejsFunction
  public api: LambdaRestApi

  constructor(scope: Construct, envName: string, backendLambda: NodejsFunction) {
    super(scope, 'BackendAPIConstruct')
    this.envName = envName
    this.backendLambda = backendLambda

    this.api = this.createAPI()
    this.configureCustomDomain()
  }

  private createAPI(): LambdaRestApi {
    return new LambdaRestApi(this, `BackendAPI-${this.envName}`, {
      handler: this.backendLambda,
      deployOptions: { stageName: this.envName },
      domainName: {
        domainName: process.env.API_HOSTNAME ?? '',
        certificate: this.getCertificate()
      }
    })
  }

  private getCertificate(): ICertificate {
    return Certificate.fromCertificateArn(this, 'Certificate', process.env.CERTIFICATE_ARN ?? '')
  }

  private configureCustomDomain(): void {
    const hostedZoneDomainName = process.env.ROUTE_53_HOSTED_ZONE_DOMAIN_NAME ?? ''
    const zone = HostedZone.fromLookup(this, 'Zone', { domainName: hostedZoneDomainName })
    new ARecord(this, 'AliasRecord', {
      recordName: process.env.API_HOSTNAME,
      target: RecordTarget.fromAlias(new ApiGateway(this.api)),
      zone: zone
    })
  }
}
