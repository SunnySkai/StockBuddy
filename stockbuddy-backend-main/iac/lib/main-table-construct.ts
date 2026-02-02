import { Construct } from 'constructs';
import { AttributeType, Table, BillingMode, ProjectionType } from 'aws-cdk-lib/aws-dynamodb';

export class MainTableConstruct extends Construct {
  public envName: string
  public table: Table

  constructor(scope: Construct, envName: string) {
    super(scope, 'MainTableConstruct')

    this.table = new Table(this, `StockBuddyTable-${envName}`, {
      tableName: `StockBuddyTable-${envName}`,
      partitionKey: {
        name: 'PK',
        type: AttributeType.STRING
      },
      sortKey: {
        name: 'SK',
        type: AttributeType.STRING
      },
      billingMode: BillingMode.PAY_PER_REQUEST
    })

    this.table.addGlobalSecondaryIndex({
      indexName: 'GSI1',
      partitionKey: {
        name: 'PK1',
        type: AttributeType.STRING
      },
      sortKey: {
        name: 'SK1',
        type: AttributeType.STRING
      },
      projectionType: ProjectionType.ALL
    })

    this.table.addGlobalSecondaryIndex({
      indexName: 'GSI2',
      partitionKey: {
        name: 'PK2',
        type: AttributeType.STRING
      },
      sortKey: {
        name: 'SK2',
        type: AttributeType.STRING
      },
      projectionType: ProjectionType.ALL
    })

    this.table.addGlobalSecondaryIndex({
      indexName: 'GSI3',
      partitionKey: {
        name: 'PK3',
        type: AttributeType.STRING
      },
      sortKey: {
        name: 'SK3',
        type: AttributeType.STRING
      },
      projectionType: ProjectionType.ALL
    })

    this.table.addGlobalSecondaryIndex({
      indexName: 'GSI4',
      partitionKey: {
        name: 'PK4',
        type: AttributeType.STRING
      },
      sortKey: {
        name: 'SK4',
        type: AttributeType.STRING
      },
      projectionType: ProjectionType.ALL
    })
  }
}
