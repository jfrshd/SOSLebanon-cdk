import * as cdk from "@aws-cdk/core";
import * as dynamodb from "@aws-cdk/aws-dynamodb";
import * as lambda from "@aws-cdk/aws-lambda";
import * as s3 from "@aws-cdk/aws-s3";
import * as apigw from "@aws-cdk/aws-apigateway";
import * as cognito from "@aws-cdk/aws-cognito";
import * as iam from "@aws-cdk/aws-iam";
import * as ses from "@aws-cdk/aws-ses";
import * as path from "path";
import * as defaults from "../extras/defaults";
import { RemovalPolicy, Tag, Duration } from "@aws-cdk/core";
import { Mfa, UserPool } from "@aws-cdk/aws-cognito";
import { IFunction } from "@aws-cdk/aws-lambda";

export class SoslebanonStack extends cdk.Stack {
  api: apigw.RestApi;
  postsTable: dynamodb.Table;
  authorizer: apigw.CfnAuthorizer;

  constructor(scope: cdk.Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    this.api = new apigw.RestApi(this, "SOSLebanonAPI");

    this.createCognito();

    this.createPostsTable();

    const typesTable = new dynamodb.Table(this, "types-table", {
      tableName: "types-table",
      partitionKey: { name: "pk", type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
    });

    this.createAPIResources();
  }

  createPostsTable(): void {
    this.postsTable = new dynamodb.Table(this, "posts-table", {
      tableName: "posts-table",
      partitionKey: { name: "pk", type: dynamodb.AttributeType.STRING },
      sortKey: {
        name: "id",
        type: dynamodb.AttributeType.STRING,
      },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      // readCapacity: 5,
      // writeCapacity: 5,
    });
    this.postsTable.addLocalSecondaryIndex({
      indexName: "creationDate",
      sortKey: {
        name: "creationDate",
        type: dynamodb.AttributeType.NUMBER,
      },
    });
    this.postsTable.addLocalSecondaryIndex({
      indexName: "type",
      sortKey: {
        name: "type",
        type: dynamodb.AttributeType.STRING,
      },
    });
  }

  createCognito(): void {
    const confSet = new ses.CfnConfigurationSet(this, "soslebanon-conf-set", {
      name: "soslebanon-ses-conf-set",
    });

    const userPool = new cognito.UserPool(this, "soslebanon-user-pool", {
      userPoolName: "soslebanon-user-pool",
      selfSignUpEnabled: true,
      signInAliases: {
        username: false,
        email: true,
      },
      standardAttributes: {
        givenName: { mutable: true, required: true },
        familyName: { mutable: true, required: true },
        email: { mutable: true, required: true },
        phoneNumber: { mutable: true, required: true },
        address: { mutable: true, required: true },
      },
      customAttributes: {
        type: new cognito.StringAttribute({ mutable: true }),
      },
      autoVerify: {
        email: true,
        phone: true,
      },
      passwordPolicy: {
        minLength: 8,
        requireLowercase: false,
        requireDigits: false,
        requireSymbols: false,
        requireUppercase: false,
        tempPasswordValidity: Duration.days(7),
      },
      // emailSettings: {
      //   from: "helpdesk@soslebanon.com",
      //   replyTo: "helpdesk@soslebanon.com",
      // },
      signInCaseSensitive: true,
      accountRecovery: cognito.AccountRecovery.EMAIL_ONLY,
    });

    const cfnUserPool = userPool.node.defaultChild as cognito.CfnUserPool;
    // cfnUserPool.emailConfiguration = {
    //   configurationSet: confSet.ref,
    //   emailSendingAccount: "DEVELOPER",
    //   from: "helpdesk@soslebanon.com",
    //   replyToEmailAddress: "helpdesk@soslebanon.com",
    //   sourceArn:
    //     "arn:aws:ses:eu-west-1:218561861583:identity/helpdesk@soslebanon.com",
    // };

    this.authorizer = new apigw.CfnAuthorizer(this, "APIGatewayAuthorizer", {
      name: "cognito-authorizer",
      identitySource: "method.request.header.Authorization",
      providerArns: [cfnUserPool.attrArn],
      restApiId: this.api.restApiId,
      type: apigw.AuthorizationType.COGNITO,
    });

    const userPoolClient = new cognito.UserPoolClient(
      this,
      "soslebanon-client",
      {
        userPoolClientName: "soslebanon-client",
        generateSecret: false,
        userPool: userPool,
      }
    );
    const identityPool = new cognito.CfnIdentityPool(
      this,
      "soslebanon-identity-pool",
      {
        identityPoolName: "soslebanon-identity-pool",
        allowUnauthenticatedIdentities: false,
        cognitoIdentityProviders: [
          {
            clientId: userPoolClient.userPoolClientId,
            providerName: userPool.userPoolProviderName,
          },
        ],
      }
    );
    // const unauthenticatedRole = new iam.Role(
    //   this,
    //   "CognitoDefaultUnauthenticatedRole",
    //   {
    //     assumedBy: new iam.FederatedPrincipal(
    //       "cognito-identity.amazonaws.com",
    //       {
    //         StringEquals: {
    //           "cognito-identity.amazonaws.com:aud": identityPool.ref,
    //         },
    //         "ForAnyValue:StringLike": {
    //           "cognito-identity.amazonaws.com:amr": "unauthenticated",
    //         },
    //       },
    //       "sts:AssumeRoleWithWebIdentity"
    //     ),
    //   }
    // );
    // unauthenticatedRole.addToPolicy(
    //   new PolicyStatement({
    //     effect: Effect.ALLOW,
    //     actions: ["mobileanalytics:PutEvents", "cognito-sync:*"],
    //     resources: ["*"],
    //   })
    // );

    const authenticatedRole = new iam.Role(
      this,
      "CognitoDefaultAuthenticatedRole",
      {
        assumedBy: new iam.FederatedPrincipal(
          "cognito-identity.amazonaws.com",
          {
            StringEquals: {
              "cognito-identity.amazonaws.com:aud": identityPool.ref,
            },
            "ForAnyValue:StringLike": {
              "cognito-identity.amazonaws.com:amr": "authenticated",
            },
          },
          "sts:AssumeRoleWithWebIdentity"
        ),
      }
    );

    authenticatedRole.addToPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
          "mobileanalytics:PutEvents",
          "cognito-sync:*",
          "cognito-identity:*",
        ],
        resources: ["*"],
      })
    );

    authenticatedRole.addToPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ["lambda:InvokeFunction"],
        resources: ["*"],
      })
    );

    const defaultPolicy = new cognito.CfnIdentityPoolRoleAttachment(
      this,
      "IdentityPoolRoleMapping",
      {
        identityPoolId: identityPool.ref,
        roles: {
          // unauthenticated: unauthenticatedRole.roleArn,
          authenticated: authenticatedRole.roleArn,
        },
      }
    );
  }
  ////////////////////////////////////////////
  createAPIResources() {
    const helpApiResource = this.api.root.addResource("help");
    helpApiResource.addMethod(
      "OPTIONS",
      defaults.mockIntegration,
      defaults.options
    );

    this.getAdminPostsFunction(helpApiResource); // GET
    this.createPostsFunction(helpApiResource); // POST
    this.deletePostFunction(helpApiResource); // DELETE

    const latestHelpApiResource = this.api.root.addResource("latest-help");
    latestHelpApiResource.addMethod(
      "OPTIONS",
      defaults.mockIntegration,
      defaults.options
    );

    this.getLatestPostsFunction(latestHelpApiResource); // GET

    const typeHelpApiResource = this.api.root.addResource("type-help");
    typeHelpApiResource.addMethod(
      "OPTIONS",
      defaults.mockIntegration,
      defaults.options
    );

    this.getTypePostsFunction(typeHelpApiResource); // GET
  }

  getAdminPostsFunction(helpApiResource: apigw.Resource) {
    const getTypePosts = new lambda.Function(this, "get-admin-posts", {
      functionName: "get-admin-posts",
      runtime: lambda.Runtime.NODEJS_12_X,
      handler: "index.handler",
      code: lambda.Code.fromAsset(
        path.join(__dirname, "../lambdas/get-admin-posts")
      ),
      environment: {
        POSTS_TABLE: this.postsTable.tableName,
      },
    });

    this.postsTable.grantReadData(getTypePosts);

    helpApiResource.addMethod(
      "GET",
      defaults.lambdaIntegration(getTypePosts, {}),
      {
        ...defaults.options,
        authorizationType: apigw.AuthorizationType.COGNITO,
        authorizer: { authorizerId: this.authorizer.ref },
      }
    );
  }

  createPostsFunction(helpApiResource: apigw.Resource) {
    const createPost = new lambda.Function(this, "create-post", {
      functionName: "create-post",
      runtime: lambda.Runtime.NODEJS_12_X,
      handler: "index.handler",
      code: lambda.Code.fromAsset(
        path.join(__dirname, "../lambdas/create-post")
      ),
      environment: {
        POSTS_TABLE: this.postsTable.tableName,
      },
    });

    this.postsTable.grantReadWriteData(createPost);

    helpApiResource.addMethod(
      "POST",
      defaults.lambdaIntegration(createPost, {
        "application/json":
          '{"requestBody": $input.body, "organization_id": "$context.authorizer.claims.sub"}',
      }),
      {
        ...defaults.options,
        authorizationType: apigw.AuthorizationType.COGNITO,
        authorizer: { authorizerId: this.authorizer.ref },
      }
    );
  }

  deletePostFunction(helpApiResource: apigw.Resource) {
    const getTypePosts = new lambda.Function(this, "delete-post", {
      functionName: "delete-post",
      runtime: lambda.Runtime.NODEJS_12_X,
      handler: "index.handler",
      code: lambda.Code.fromAsset(
        path.join(__dirname, "../lambdas/delete-post")
      ),
      environment: {
        POSTS_TABLE: this.postsTable.tableName,
      },
    });

    this.postsTable.grantReadData(getTypePosts);

    helpApiResource.addMethod(
      "DELETE",
      defaults.lambdaIntegration(getTypePosts, {}),
      {
        ...defaults.options,
        authorizationType: apigw.AuthorizationType.COGNITO,
        authorizer: { authorizerId: this.authorizer.ref },
      }
    );
  }

  getLatestPostsFunction(helpApiResource: apigw.Resource) {
    const getTypePosts = new lambda.Function(this, "get-latest-posts", {
      functionName: "get-latest-posts",
      runtime: lambda.Runtime.NODEJS_12_X,
      handler: "index.handler",
      code: lambda.Code.fromAsset(
        path.join(__dirname, "../lambdas/get-latest-posts")
      ),
      environment: {
        POSTS_TABLE: this.postsTable.tableName,
      },
    });

    this.postsTable.grantReadData(getTypePosts);

    helpApiResource.addMethod(
      "GET",
      defaults.lambdaIntegration(getTypePosts, {}),
      defaults.options
    );
  }

  getTypePostsFunction(helpApiResource: apigw.Resource) {
    const getTypePosts = new lambda.Function(this, "get-type-posts", {
      functionName: "get-type-posts",
      runtime: lambda.Runtime.NODEJS_12_X,
      handler: "index.handler",
      code: lambda.Code.fromAsset(
        path.join(__dirname, "../lambdas/get-type-posts")
      ),
      environment: {
        POSTS_TABLE: this.postsTable.tableName,
      },
    });

    this.postsTable.grantReadData(getTypePosts);

    helpApiResource.addMethod(
      "GET",
      defaults.lambdaIntegration(getTypePosts, {}),
      defaults.options
    );
  }
}
