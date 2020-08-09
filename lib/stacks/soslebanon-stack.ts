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
  settingsTable: dynamodb.Table;
  authorizer: apigw.CfnAuthorizer;
  userPool: cognito.UserPool;

  constructor(scope: cdk.Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);
    this.api = new apigw.RestApi(this, "SOSLebanonAPI");
    this.createCognito();
    this.createPostsTable();
    this.createTypestable();
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
    });
    this.postsTable.addLocalSecondaryIndex({
      indexName: "creationDate",
      sortKey: {
        name: "creationDate",
        type: dynamodb.AttributeType.NUMBER,
      },
    });
    this.postsTable.addLocalSecondaryIndex({
      indexName: "typeId",
      sortKey: {
        name: "typeId",
        type: dynamodb.AttributeType.STRING,
      },
    });
  }

  createTypestable(): void {
    this.settingsTable = new dynamodb.Table(this, "setting-table", {
      tableName: "setting-table",
      partitionKey: { name: "pk", type: dynamodb.AttributeType.STRING },
      sortKey: {
        name: "id",
        type: dynamodb.AttributeType.STRING,
      },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
    });
  }

  createCognito(): void {
    const confSet = new ses.CfnConfigurationSet(this, "soslebanon-conf-set", {
      name: "soslebanon-ses-conf-set",
    });

    this.userPool = new cognito.UserPool(this, "soslebanon-user-pool", {
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

    const cfnUserPool = this.userPool.node.defaultChild as cognito.CfnUserPool;
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
        userPool: this.userPool,
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
            providerName: this.userPool.userPoolProviderName,
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

  createAPIResources() {
    const adminApiResource = this.api.root.addResource("admin");
    adminApiResource.addMethod(
      "OPTIONS",
      defaults.mockIntegration,
      defaults.options
    );

    this.getAdminPostsFunction(adminApiResource); // GET
    this.createPostsFunction(adminApiResource); // POST
    this.deletePostFunction(adminApiResource); // DELETE

    ///////////////////////////////////////////////////////////////////////////////////
    const postApiResource = this.api.root.addResource("post");
    postApiResource.addMethod(
      "OPTIONS",
      defaults.mockIntegration,
      defaults.options
    );

    this.getPostFunction(postApiResource); // GET

    ///////////////////////////////////////////////////////////////////////////////////
    const typeApiResource = this.api.root.addResource("type");
    typeApiResource.addMethod(
      "OPTIONS",
      defaults.mockIntegration,
      defaults.options
    );

    this.getTypesFunction(typeApiResource); // GET

    ///////////////////////////////////////////////////////////////////////////////////
    const locationApiResource = this.api.root.addResource("location");
    locationApiResource.addMethod(
      "OPTIONS",
      defaults.mockIntegration,
      defaults.options
    );

    this.getLocationsFunction(locationApiResource); // GET

    ///////////////////////////////////////////////////////////////////////////////////
    const latestPostsApiResource = this.api.root.addResource("latest-post");
    latestPostsApiResource.addMethod(
      "OPTIONS",
      defaults.mockIntegration,
      defaults.options
    );

    this.getLatestPostsFunction(latestPostsApiResource); // GET

    ///////////////////////////////////////////////////////////////////////////////////
    const typePostApiResource = this.api.root.addResource("type-post");
    typePostApiResource.addMethod(
      "OPTIONS",
      defaults.mockIntegration,
      defaults.options
    );

    this.getTypePostsFunction(typePostApiResource); // GET
  }
  // lambda functions
  getAdminPostsFunction(adminApiResource: apigw.Resource) {
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

    adminApiResource.addMethod(
      "GET",
      defaults.lambdaIntegration(getTypePosts, {
        "application/json": '{\n"sub": "$context.authorizer.claims.sub"\n}',
      }),
      {
        ...defaults.options,
        authorizationType: apigw.AuthorizationType.COGNITO,
        authorizer: { authorizerId: this.authorizer.ref },
      }
    );
  }

  createPostsFunction(adminApiResource: apigw.Resource) {
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

    adminApiResource.addMethod(
      "POST",
      defaults.lambdaIntegration(createPost, {
        "application/json":
          '{\n"requestBody": $input.body,\n"sub": "$context.authorizer.claims.sub"\n}',
      }),
      {
        ...defaults.options,
        authorizationType: apigw.AuthorizationType.COGNITO,
        authorizer: { authorizerId: this.authorizer.ref },
      }
    );
  }

  deletePostFunction(adminApiResource: apigw.Resource) {
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

    this.postsTable.grantWriteData(getTypePosts);

    adminApiResource.addMethod(
      "DELETE",
      defaults.lambdaIntegration(getTypePosts, {
        "application/json": `
            #set($hasId = $input.params('id'))
            {
              "sub": "$context.authorizer.claims.sub"
              #if($hasId != ""), "id" : "$input.params('id')"#end
            }
          `,
      }),
      {
        ...defaults.options,
        authorizationType: apigw.AuthorizationType.COGNITO,
        authorizer: { authorizerId: this.authorizer.ref },
      }
    );
  }

  getLatestPostsFunction(latestPostsApiResource: apigw.Resource) {
    const getTypePosts = new lambda.Function(this, "get-latest-posts", {
      functionName: "get-latest-posts",
      runtime: lambda.Runtime.NODEJS_12_X,
      handler: "index.handler",
      code: lambda.Code.fromAsset(
        path.join(__dirname, "../lambdas/get-latest-posts")
      ),
      environment: {
        POSTS_TABLE: this.postsTable.tableName,
        identityPoolId: this.userPool.userPoolId,
      },
    });

    this.postsTable.grantReadData(getTypePosts);

    latestPostsApiResource.addMethod(
      "GET",
      defaults.lambdaIntegration(getTypePosts, {
        "application/json": `
        #set($hasLastEvaluatedKey = $input.params('LastEvaluatedKey'))
        #set($hasLimit = $input.params('limit'))
        #set($hasTypeId = $input.params('typeId'))
        #set($hasKeyword = $input.params('keyword'))
        {
        #if($hasLimit != "") "limit" : "$input.params('limit')"#end
        #if($hasTypeId != ""), "typeId" : "$input.params('typeId')"#end
        #if($hasKeyword != ""), "keyword" : "$input.params('keyword')"#end
        #if($hasLastEvaluatedKey != ""), "LastEvaluatedKey" : "$input.params('LastEvaluatedKey')"#end
        }
        `,
      }),
      defaults.options
    );
  }

  getPostFunction(postApiResource: apigw.Resource) {
    const getPost = new lambda.Function(this, "get-post", {
      functionName: "get-post",
      runtime: lambda.Runtime.NODEJS_12_X,
      handler: "index.handler",
      code: lambda.Code.fromAsset(path.join(__dirname, "../lambdas/get-post")),
      environment: {
        POSTS_TABLE: this.postsTable.tableName,
      },
    });

    this.postsTable.grantReadData(getPost);

    postApiResource.addMethod(
      "GET",
      defaults.lambdaIntegration(getPost, {
        "application/json": `
          #set($hasId = $input.params('id'))
          {
            #if($hasId != "") "id" : "$input.params('id')"#end
          }
        `,
      }),
      defaults.options
    );
  }

  getTypesFunction(typeApiResource: apigw.Resource) {
    const getTypes = new lambda.Function(this, "get-types", {
      functionName: "get-types",
      runtime: lambda.Runtime.NODEJS_12_X,
      handler: "index.handler",
      code: lambda.Code.fromAsset(path.join(__dirname, "../lambdas/get-types")),
      environment: {
        SETTINGS_TABLE: this.settingsTable.tableName,
      },
    });

    this.settingsTable.grantReadData(getTypes);

    typeApiResource.addMethod(
      "GET",
      defaults.lambdaIntegration(getTypes, {}),
      defaults.options
    );
  }

  getLocationsFunction(locationApiResource: apigw.Resource) {
    const getLocations = new lambda.Function(this, "get-locations", {
      functionName: "get-locations",
      runtime: lambda.Runtime.NODEJS_12_X,
      handler: "index.handler",
      code: lambda.Code.fromAsset(
        path.join(__dirname, "../lambdas/get-locations")
      ),
      environment: {
        SETTINGS_TABLE: this.settingsTable.tableName,
      },
    });

    this.settingsTable.grantReadData(getLocations);

    locationApiResource.addMethod(
      "GET",
      defaults.lambdaIntegration(getLocations, {}),
      defaults.options
    );
  }

  getTypePostsFunction(postApiResource: apigw.Resource) {
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

    postApiResource.addMethod(
      "GET",
      defaults.lambdaIntegration(getTypePosts, {
        "application/json": `
        #set($hasTypeId = $input.params('typeId'))
        #set($hasLastEvaluatedKey = $input.params('LastEvaluatedKey'))
        #set($hasLimit = $input.params('limit'))
        {
          #if($hasTypeId != "") "typeId" : "$input.params('typeId')"#end
          #if($hasLimit != ""),"limit" : "$input.params('limit')"#end
          #if($hasLastEvaluatedKey != ""),"LastEvaluatedKey": "$input.params('LastEvaluatedKey')"#end
        }
      `,
      }),
      defaults.options
    );
  }
}
