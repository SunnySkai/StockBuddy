import { Duration } from 'aws-cdk-lib'
import { Effect, PolicyStatement, Role, ServicePrincipal } from 'aws-cdk-lib/aws-iam'
import { Rule, Schedule } from 'aws-cdk-lib/aws-events'
import { LambdaFunction } from 'aws-cdk-lib/aws-events-targets'
import { Runtime } from 'aws-cdk-lib/aws-lambda'
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs'
import { Table } from 'aws-cdk-lib/aws-dynamodb'
import { Construct } from 'constructs'
import * as path from 'path'

export class RemindersConstruct extends Construct {
  public readonly lambda: NodejsFunction

  constructor(scope: Construct, envName: string, table: Table) {
    super(scope, 'RemindersConstruct')

    const role = new Role(this, `RemindersLambdaRole-${envName}`, {
      assumedBy: new ServicePrincipal('lambda.amazonaws.com')
    })

    // Grant permissions to write logs to CloudWatch
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

    // Allow Lambda to read/write the main table (for events + mark sent)
    table.grantReadWriteData(role)

    // Allow sending emails via SES
    role.addToPolicy(new PolicyStatement({
      effect: Effect.ALLOW,
      actions: ['ses:SendEmail', 'ses:SendRawEmail'],
      resources: ['*']
    }))

    this.lambda = new NodejsFunction(this, `StockBuddyRemindersLambda-${envName}`, {
      functionName: `StockBuddyRemindersLambda-${envName}`,
      runtime: Runtime.NODEJS_LATEST,
      handler: 'handler',
      entry: path.join(__dirname, '..', '..', 'src', 'lambdas', 'reminders', 'index.ts'),
      depsLockFilePath: path.join(__dirname, '..', '..', 'src', 'package-lock.json'),
      timeout: Duration.seconds(30),
      memorySize: 256,
      role,
      environment: {
        ENV_IDENTIFIER: process.env.ENV_IDENTIFIER ?? envName,
        TABLE_NAME: process.env.TABLE_NAME ?? '',
        DEFAULT_TENANT: 'STOCKBUDDY'
      }
    })

    // In production, wire up the scheduled trigger; in other envs,
    // the Lambda exists but is invoked manually to avoid extra cost/noise.
    if (envName === 'prod') {
      const rule = new Rule(this, `PersonalEventsRemindersRule-${envName}`, {
        // Run at HH:00, HH:05, HH:10, ... (every 5 minutes)
        schedule: Schedule.cron({
          minute: '0/5',
          hour: '*'
        })
      })

      rule.addTarget(new LambdaFunction(this.lambda))
    }
  }
}
