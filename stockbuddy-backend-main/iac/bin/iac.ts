#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib'
import { IacStack } from '../lib/iac-stack'

if (!process.env.ENV_IDENTIFIER) {
  throw new Error('Missing env variable: ENV_IDENTIFIER')
}

const environment = process.env.ENV_IDENTIFIER
const stackName = environment === 'staging'
  ? 'StockBuddyBackendStack-Staging'
  : 'StockBuddyBackendStack-Prod'

const app = new cdk.App()
new IacStack(app, stackName, {
  stackName: stackName,
  env: {
    account: process.env.AWS_ACCOUNT_ID,
    region: process.env.AWS_REGION
  }
})
