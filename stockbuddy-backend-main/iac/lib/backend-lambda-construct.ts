import { Duration } from 'aws-cdk-lib'
import { Role, ServicePrincipal, PolicyStatement, Effect } from 'aws-cdk-lib/aws-iam'
import { Runtime } from 'aws-cdk-lib/aws-lambda'
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs'
import { Secret } from 'aws-cdk-lib/aws-secretsmanager'
import { Construct } from 'constructs'
import * as path from 'path'

export class BackendLambdaConstruct extends Construct {
  private envName: string
  public lambda: NodejsFunction

  constructor(scope: Construct, envName: string) {
    super(scope, 'BackendLambdaConstruct')
    this.envName = envName

    const lambdaRole: Role = this.createRole()
    this.attachCloudWatchLogsPolicy(lambdaRole)
    this.lambda = this.createLambda(lambdaRole)
    this.grantSecretsManagerAccess()
  }

  private createRole(): Role {
    return new Role(this, 'LambdaExecutionRole', {
      assumedBy: new ServicePrincipal('lambda.amazonaws.com')
    })
  }

  // Explicitly grant permissions to write logs to CloudWatch
  private attachCloudWatchLogsPolicy(role: Role): void {
    role.addToPolicy(
      new PolicyStatement({
        effect: Effect.ALLOW,
        actions: [
          'logs:CreateLogGroup',
          'logs:CreateLogStream',
          'logs:PutLogEvents'
        ],
        resources: ['*']
      })
    )
  }

  private createLambda(lambdaRole: Role): NodejsFunction {
    return new NodejsFunction(this, `StockBuddyBackendLambda-${this.envName}`, {
      functionName: `StockBuddyBackendLambda-${this.envName}`,
      runtime: Runtime.NODEJS_LATEST,
      handler: 'handler',
      entry: path.join(__dirname, '..', '..', 'src', 'lambdas', 'backend', 'index.ts'),
      depsLockFilePath: path.join(__dirname, '..', '..', 'src', 'package-lock.json'),
      timeout: Duration.minutes(1),
      memorySize: 1024,
      role: lambdaRole,
      environment: {
        ENV_IDENTIFIER: process.env.ENV_IDENTIFIER ?? 'staging',
        TABLE_NAME: process.env.TABLE_NAME ?? '',
        APP_SECRET_NAME: process.env.APP_SECRET_NAME ?? '',
        API_FOOTBALL_PROVIDER: process.env.API_FOOTBALL_PROVIDER ?? '',
        API_FOOTBALL_BASE_URL: process.env.API_FOOTBALL_BASE_URL ?? '',
        API_FOOTBALL_KEY:  process.env.API_FOOTBALL_KEY ?? ''
      }
    })
  }

  private grantSecretsManagerAccess(): void {
    Secret.fromSecretNameV2(
      this,
      'AppSecretName',
      this.envName === 'prod' ? 'APP_SECRET_NAME' : 'TEST_APP_SECRET_NAME'
    ).grantRead(this.lambda)
  }
}
