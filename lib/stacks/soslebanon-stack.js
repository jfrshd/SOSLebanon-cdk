"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const cdk = require("@aws-cdk/core");
const dynamodb = require("@aws-cdk/aws-dynamodb");
const lambda = require("@aws-cdk/aws-lambda");
const apigw = require("@aws-cdk/aws-apigateway");
const cognito = require("@aws-cdk/aws-cognito");
const iam = require("@aws-cdk/aws-iam");
const ses = require("@aws-cdk/aws-ses");
const path = require("path");
const defaults = require("../extras/defaults");
const core_1 = require("@aws-cdk/core");
class SoslebanonStack extends cdk.Stack {
    constructor(scope, id, props) {
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
    createPostsTable() {
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
    createCognito() {
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
                tempPasswordValidity: core_1.Duration.days(7),
            },
            // emailSettings: {
            //   from: "helpdesk@soslebanon.com",
            //   replyTo: "helpdesk@soslebanon.com",
            // },
            signInCaseSensitive: true,
            accountRecovery: cognito.AccountRecovery.EMAIL_ONLY,
        });
        const cfnUserPool = userPool.node.defaultChild;
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
        const userPoolClient = new cognito.UserPoolClient(this, "soslebanon-client", {
            userPoolClientName: "soslebanon-client",
            generateSecret: false,
            userPool: userPool,
        });
        const identityPool = new cognito.CfnIdentityPool(this, "soslebanon-identity-pool", {
            identityPoolName: "soslebanon-identity-pool",
            allowUnauthenticatedIdentities: false,
            cognitoIdentityProviders: [
                {
                    clientId: userPoolClient.userPoolClientId,
                    providerName: userPool.userPoolProviderName,
                },
            ],
        });
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
        const authenticatedRole = new iam.Role(this, "CognitoDefaultAuthenticatedRole", {
            assumedBy: new iam.FederatedPrincipal("cognito-identity.amazonaws.com", {
                StringEquals: {
                    "cognito-identity.amazonaws.com:aud": identityPool.ref,
                },
                "ForAnyValue:StringLike": {
                    "cognito-identity.amazonaws.com:amr": "authenticated",
                },
            }, "sts:AssumeRoleWithWebIdentity"),
        });
        authenticatedRole.addToPolicy(new iam.PolicyStatement({
            effect: iam.Effect.ALLOW,
            actions: [
                "mobileanalytics:PutEvents",
                "cognito-sync:*",
                "cognito-identity:*",
            ],
            resources: ["*"],
        }));
        authenticatedRole.addToPolicy(new iam.PolicyStatement({
            effect: iam.Effect.ALLOW,
            actions: ["lambda:InvokeFunction"],
            resources: ["*"],
        }));
        const defaultPolicy = new cognito.CfnIdentityPoolRoleAttachment(this, "IdentityPoolRoleMapping", {
            identityPoolId: identityPool.ref,
            roles: {
                // unauthenticated: unauthenticatedRole.roleArn,
                authenticated: authenticatedRole.roleArn,
            },
        });
    }
    ////////////////////////////////////////////
    createAPIResources() {
        const helpApiResource = this.api.root.addResource("help");
        helpApiResource.addMethod("OPTIONS", defaults.mockIntegration, defaults.options);
        this.getAdminPostsFunction(helpApiResource); // GET
        this.createPostsFunction(helpApiResource); // POST
        this.deletePostFunction(helpApiResource); // DELETE
        const latestHelpApiResource = this.api.root.addResource("latest-help");
        latestHelpApiResource.addMethod("OPTIONS", defaults.mockIntegration, defaults.options);
        this.getLatestPostsFunction(latestHelpApiResource); // GET
        const typeHelpApiResource = this.api.root.addResource("type-help");
        typeHelpApiResource.addMethod("OPTIONS", defaults.mockIntegration, defaults.options);
        this.getTypePostsFunction(typeHelpApiResource); // GET
    }
    getAdminPostsFunction(helpApiResource) {
        const getTypePosts = new lambda.Function(this, "get-admin-posts", {
            functionName: "get-admin-posts",
            runtime: lambda.Runtime.NODEJS_12_X,
            handler: "index.handler",
            code: lambda.Code.fromAsset(path.join(__dirname, "../lambdas/get-admin-posts")),
            environment: {
                POSTS_TABLE: this.postsTable.tableName,
            },
        });
        this.postsTable.grantReadData(getTypePosts);
        helpApiResource.addMethod("GET", defaults.lambdaIntegration(getTypePosts, {
            "application/json": '{\n"sub": "$context.authorizer.claims.sub"\n}',
        }), {
            ...defaults.options,
            authorizationType: apigw.AuthorizationType.COGNITO,
            authorizer: { authorizerId: this.authorizer.ref },
        });
    }
    createPostsFunction(helpApiResource) {
        const createPost = new lambda.Function(this, "create-post", {
            functionName: "create-post",
            runtime: lambda.Runtime.NODEJS_12_X,
            handler: "index.handler",
            code: lambda.Code.fromAsset(path.join(__dirname, "../lambdas/create-post")),
            environment: {
                POSTS_TABLE: this.postsTable.tableName,
            },
        });
        this.postsTable.grantReadWriteData(createPost);
        helpApiResource.addMethod("POST", defaults.lambdaIntegration(createPost, {
            "application/json": '{\n"requestBody": $input.body,\n"sub": "$context.authorizer.claims.sub"\n}',
        }), {
            ...defaults.options,
            authorizationType: apigw.AuthorizationType.COGNITO,
            authorizer: { authorizerId: this.authorizer.ref },
        });
    }
    deletePostFunction(helpApiResource) {
        const getTypePosts = new lambda.Function(this, "delete-post", {
            functionName: "delete-post",
            runtime: lambda.Runtime.NODEJS_12_X,
            handler: "index.handler",
            code: lambda.Code.fromAsset(path.join(__dirname, "../lambdas/delete-post")),
            environment: {
                POSTS_TABLE: this.postsTable.tableName,
            },
        });
        this.postsTable.grantWriteData(getTypePosts);
        helpApiResource.addMethod("DELETE", defaults.lambdaIntegration(getTypePosts, {
            "application/json": `
            #set($hasId = $input.params('id'))
            {
              "sub": "$context.authorizer.claims.sub"
              #if($hasId != ""), "id" : "$input.params('id')"#end
            }
          `,
        }), {
            ...defaults.options,
            authorizationType: apigw.AuthorizationType.COGNITO,
            authorizer: { authorizerId: this.authorizer.ref },
        });
    }
    getLatestPostsFunction(helpApiResource) {
        const getTypePosts = new lambda.Function(this, "get-latest-posts", {
            functionName: "get-latest-posts",
            runtime: lambda.Runtime.NODEJS_12_X,
            handler: "index.handler",
            code: lambda.Code.fromAsset(path.join(__dirname, "../lambdas/get-latest-posts")),
            environment: {
                POSTS_TABLE: this.postsTable.tableName,
            },
        });
        this.postsTable.grantReadData(getTypePosts);
        helpApiResource.addMethod("GET", defaults.lambdaIntegration(getTypePosts, {
            "application/json": `
          #set($hasLastEvaluatedKey = $input.params('lastEvaluatedKey'))
          #set($hasLimit = $input.params('limit'))
          {
            #if($hasLimit != "") "limit" : "$input.params('limit')"#end
            #if($hasLastEvaluatedKey != ""),"lastEvaluatedKey": "$input.params('lastEvaluatedKey')"#end
          }
        `,
        }), defaults.options);
    }
    getTypePostsFunction(helpApiResource) {
        const getTypePosts = new lambda.Function(this, "get-type-posts", {
            functionName: "get-type-posts",
            runtime: lambda.Runtime.NODEJS_12_X,
            handler: "index.handler",
            code: lambda.Code.fromAsset(path.join(__dirname, "../lambdas/get-type-posts")),
            environment: {
                POSTS_TABLE: this.postsTable.tableName,
            },
        });
        this.postsTable.grantReadData(getTypePosts);
        helpApiResource.addMethod("GET", defaults.lambdaIntegration(getTypePosts, {
            "application/json": `
        #set($hasTypeId = $input.params('typeId'))
        #set($hasLastEvaluatedKey = $input.params('lastEvaluatedKey'))
        #set($hasLimit = $input.params('limit'))
        {
          #if($hasTypeId != "") "typeId" : "$input.params('typeId')"#end
          #if($hasLimit != ""),"limit" : "$input.params('limit')"#end
          #if($hasLastEvaluatedKey != ""),"lastEvaluatedKey": "$input.params('lastEvaluatedKey')"#end
        }
      `,
        }), defaults.options);
    }
}
exports.SoslebanonStack = SoslebanonStack;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic29zbGViYW5vbi1zdGFjay5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbInNvc2xlYmFub24tc3RhY2sudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7QUFBQSxxQ0FBcUM7QUFDckMsa0RBQWtEO0FBQ2xELDhDQUE4QztBQUU5QyxpREFBaUQ7QUFDakQsZ0RBQWdEO0FBQ2hELHdDQUF3QztBQUN4Qyx3Q0FBd0M7QUFDeEMsNkJBQTZCO0FBQzdCLCtDQUErQztBQUMvQyx3Q0FBNkQ7QUFJN0QsTUFBYSxlQUFnQixTQUFRLEdBQUcsQ0FBQyxLQUFLO0lBSzVDLFlBQVksS0FBb0IsRUFBRSxFQUFVLEVBQUUsS0FBc0I7UUFDbEUsS0FBSyxDQUFDLEtBQUssRUFBRSxFQUFFLEVBQUUsS0FBSyxDQUFDLENBQUM7UUFFeEIsSUFBSSxDQUFDLEdBQUcsR0FBRyxJQUFJLEtBQUssQ0FBQyxPQUFPLENBQUMsSUFBSSxFQUFFLGVBQWUsQ0FBQyxDQUFDO1FBRXBELElBQUksQ0FBQyxhQUFhLEVBQUUsQ0FBQztRQUVyQixJQUFJLENBQUMsZ0JBQWdCLEVBQUUsQ0FBQztRQUV4QixNQUFNLFVBQVUsR0FBRyxJQUFJLFFBQVEsQ0FBQyxLQUFLLENBQUMsSUFBSSxFQUFFLGFBQWEsRUFBRTtZQUN6RCxTQUFTLEVBQUUsYUFBYTtZQUN4QixZQUFZLEVBQUUsRUFBRSxJQUFJLEVBQUUsSUFBSSxFQUFFLElBQUksRUFBRSxRQUFRLENBQUMsYUFBYSxDQUFDLE1BQU0sRUFBRTtZQUNqRSxXQUFXLEVBQUUsUUFBUSxDQUFDLFdBQVcsQ0FBQyxlQUFlO1NBQ2xELENBQUMsQ0FBQztRQUVILElBQUksQ0FBQyxrQkFBa0IsRUFBRSxDQUFDO0lBQzVCLENBQUM7SUFFRCxnQkFBZ0I7UUFDZCxJQUFJLENBQUMsVUFBVSxHQUFHLElBQUksUUFBUSxDQUFDLEtBQUssQ0FBQyxJQUFJLEVBQUUsYUFBYSxFQUFFO1lBQ3hELFNBQVMsRUFBRSxhQUFhO1lBQ3hCLFlBQVksRUFBRSxF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Q0FBQyxVQUFVLENBQUMsU0FBUzthQUN2QztTQUNGLENBQUMsQ0FBQztRQUVILElBQUksQ0FBQyxVQUFVLENBQUMsYUFBYSxDQUFDLFlBQVksQ0FBQyxDQUFDO1FBRTVDLGVBQWUsQ0FBQyxTQUFTLENBQ3ZCLEtBQUssRUFDTCxRQUFRLENBQUMsaUJBQWlCLENBQUMsWUFBWSxFQUFFO1lBQ3ZDLGtCQUFrQixFQUFFOzs7Ozs7Ozs7T0FTckI7U0FDQSxDQUFDLEVBQ0YsUUFBUSxDQUFDLE9BQU8sQ0FDakIsQ0FBQztJQUNKLENBQUM7Q0FDRjtBQTdZRCwwQ0E2WUMiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgKiBhcyBjZGsgZnJvbSBcIkBhd3MtY2RrL2NvcmVcIjtcbmltcG9ydCAqIGFzIGR5bmFtb2RiIGZyb20gXCJAYXdzLWNkay9hd3MtZHluYW1vZGJcIjtcbmltcG9ydCAqIGFzIGxhbWJkYSBmcm9tIFwiQGF3cy1jZGsvYXdzLWxhbWJkYVwiO1xuaW1wb3J0ICogYXMgczMgZnJvbSBcIkBhd3MtY2RrL2F3cy1zM1wiO1xuaW1wb3J0ICogYXMgYXBpZ3cgZnJvbSBcIkBhd3MtY2RrL2F3cy1hcGlnYXRld2F5XCI7XG5pbXBvcnQgKiBhcyBjb2duaXRvIGZyb20gXCJAYXdzLWNkay9hd3MtY29nbml0b1wiO1xuaW1wb3J0ICogYXMgaWFtIGZyb20gXCJAYXdzLWNkay9hd3MtaWFtXCI7XG5pbXBvcnQgKiBhcyBzZXMgZnJvbSBcIkBhd3MtY2RrL2F3cy1zZXNcIjtcbmltcG9ydCAqIGFzIHBhdGggZnJvbSBcInBhdGhcIjtcbmltcG9ydCAqIGFzIGRlZmF1bHRzIGZyb20gXCIuLi9leHRyYXMvZGVmYXVsdHNcIjtcbmltcG9ydCB7IFJlbW92YWxQb2xpY3ksIFRhZywgRHVyYXRpb24gfSBmcm9tIFwiQGF3cy1jZGsvY29yZVwiO1xuaW1wb3J0IHsgTWZhLCBVc2VyUG9vbCB9IGZyb20gXCJAYXdzLWNkay9hd3MtY29nbml0b1wiO1xuaW1wb3J0IHsgSUZ1bmN0aW9uIH0gZnJvbSBcIkBhd3MtY2RrL2F3cy1sYW1iZGFcIjtcblxuZXhwb3J0IGNsYXNzIFNvc2xlYmFub25TdGFjayBleHRlbmRzIGNkay5TdGFjayB7XG4gIGFwaTogYXBpZ3cuUmVzdEFwaTtcbiAgcG9zdHNUYWJsZTogZHluYW1vZGIuVGFibGU7XG4gIGF1dGhvcml6ZXI6IGFwaWd3LkNmbkF1dGhvcml6ZXI7XG5cbiAgY29uc3RydWN0b3Ioc2NvcGU6IGNkay5Db25zdHJ1Y3QsIGlkOiBzdHJpbmcsIHByb3BzPzogY2RrLlN0YWNrUHJvcHMpIHtcbiAgICBzdXBlcihzY29wZSwgaWQsIHByb3BzKTtcblxuICAgIHRoaXMuYXBpID0gbmV3IGFwaWd3LlJlc3RBcGkodGhpcywgXCJTT1NMZWJhbm9uQVBJXCIpO1xuXG4gICAgdGhpcy5jcmVhdGVDb2duaXRvKCk7XG5cbiAgICB0aGlzLmNyZWF0ZVBvc3RzVGFibGUoKTtcblxuICAgIGNvbnN0IHR5cGVzVGFibGUgPSBuZXcgZHluYW1vZGIuVGFibGUodGhpcywgXCJ0eXBlcy10YWJsZVwiLCB7XG4gICAgICB0YWJsZU5hbWU6IFwidHlwZXMtdGFibGVcIixcbiAgICAgIHBhcnRpdGlvbktleTogeyBuYW1lOiBcInBrXCIsIHR5cGU6IGR5bmFtb2RiLkF0dHJpYnV0ZVR5cGUuU1RSSU5HIH0sXG4gICAgICBiaWxsaW5nTW9kZTogZHluYW1vZGIuQmlsbGluZ01vZGUuUEFZX1BFUl9SRVFVRVNULFxuICAgIH0pO1xuXG4gICAgdGhpcy5jcmVhdGVBUElSZXNvdXJjZXMoKTtcbiAgfVxuXG4gIGNyZWF0ZVBvc3RzVGFibGUoKTogdm9pZCB7XG4gICAgdGhpcy5wb3N0c1RhYmxlID0gbmV3IGR5bmFtb2RiLlRhYmxlKHRoaXMsIFwicG9zdHMtdGFibGVcIiwge1xuICAgICAgdGFibGVOYW1lOiBcInBvc3RzLXRhYmxlXCIsXG4gICAgICBwYXJ0aXRpb25LZXk6IHsgbmFtZTogXCJwa1wiLCB0eXBlOiBkeW5hbW9kYi5BdHRyaWJ1dGVUeXBlLlNUUklORyB9LFxuICAgICAgc29ydEtleToge1xuICAgICAgICBuYW1lOiBcImlkXCIsXG4gICAgICAgIHR5cGU6IGR5bmFtb2RiLkF0dHJpYnV0ZVR5cGUuU1RSSU5HLFxuICAgICAgfSxcbiAgICAgIGJpbGxpbmdNb2RlOiBkeW5hbW9kYi5CaWxsaW5nTW9kZS5QQVlfUEVSX1JFUVVFU1QsXG4gICAgICAvLyByZWFkQ2FwYWNpdHk6IDUsXG4gICAgICAvLyB3cml0ZUNhcGFjaXR5OiA1LFxuICAgIH0pO1xuICAgIHRoaXMucG9zdHNUYWJsZS5hZGRMb2NhbFNlY29uZGFyeUluZGV4KHtcbiAgICAgIGluZGV4TmFtZTogXCJjcmVhdGlvbkRhdGVcIixcbiAgICAgIHNvcnRLZXk6IHtcbiAgICAgICAgbmFtZTogXCJjcmVhdGlvbkRhdGVcIixcbiAgICAgICAgdHlwZTogZHluYW1vZGIuQXR0cmlidXRlVHlwZS5OVU1CRVIsXG4gICAgICB9LFxuICAgIH0pO1xuICAgIHRoaXMucG9zdHNUYWJsZS5hZGRMb2NhbFNlY29uZGFyeUluZGV4KHtcbiAgICAgIGluZGV4TmFtZTogXCJ0eXBlSWRcIixcbiAgICAgIHNvcnRLZXk6IHtcbiAgICAgICAgbmFtZTogXCJ0eXBlSWRcIixcbiAgICAgICAgdHlwZTogZHluYW1vZGIuQXR0cmlidXRlVHlwZS5TVFJJTkcsXG4gICAgICB9LFxuICAgIH0pO1xuICB9XG5cbiAgY3JlYXRlQ29nbml0bygpOiB2b2lkIHtcbiAgICBjb25zdCBjb25mU2V0ID0gbmV3IHNlcy5DZm5Db25maWd1cmF0aW9uU2V0KHRoaXMsIFwic29zbGViYW5vbi1jb25mLXNldFwiLCB7XG4gICAgICBuYW1lOiBcInNvc2xlYmFub24tc2VzLWNvbmYtc2V0XCIsXG4gICAgfSk7XG5cbiAgICBjb25zdCB1c2VyUG9vbCA9IG5ldyBjb2duaXRvLlVzZXJQb29sKHRoaXMsIFwic29zbGViYW5vbi11c2VyLXBvb2xcIiwge1xuICAgICAgdXNlclBvb2xOYW1lOiBcInNvc2xlYmFub24tdXNlci1wb29sXCIsXG4gICAgICBzZWxmU2lnblVwRW5hYmxlZDogdHJ1ZSxcbiAgICAgIHNpZ25JbkFsaWFzZXM6IHtcbiAgICAgICAgdXNlcm5hbWU6IGZhbHNlLFxuICAgICAgICBlbWFpbDogdHJ1ZSxcbiAgICAgIH0sXG4gICAgICBzdGFuZGFyZEF0dHJpYnV0ZXM6IHtcbiAgICAgICAgZ2l2ZW5OYW1lOiB7IG11dGFibGU6IHRydWUsIHJlcXVpcmVkOiB0cnVlIH0sXG4gICAgICAgIGZhbWlseU5hbWU6IHsgbXV0YWJsZTogdHJ1ZSwgcmVxdWlyZWQ6IHRydWUgfSxcbiAgICAgICAgZW1haWw6IHsgbXV0YWJsZTogdHJ1ZSwgcmVxdWlyZWQ6IHRydWUgfSxcbiAgICAgICAgcGhvbmVOdW1iZXI6IHsgbXV0YWJsZTogdHJ1ZSwgcmVxdWlyZWQ6IHRydWUgfSxcbiAgICAgICAgYWRkcmVzczogeyBtdXRhYmxlOiB0cnVlLCByZXF1aXJlZDogdHJ1ZSB9LFxuICAgICAgfSxcbiAgICAgIGN1c3RvbUF0dHJpYnV0ZXM6IHtcbiAgICAgICAgdHlwZTogbmV3IGNvZ25pdG8uU3RyaW5nQXR0cmlidXRlKHsgbXV0YWJsZTogdHJ1ZSB9KSxcbiAgICAgIH0sXG4gICAgICBhdXRvVmVyaWZ5OiB7XG4gICAgICAgIGVtYWlsOiB0cnVlLFxuICAgICAgICBwaG9uZTogdHJ1ZSxcbiAgICAgIH0sXG4gICAgICBwYXNzd29yZFBvbGljeToge1xuICAgICAgICBtaW5MZW5ndGg6IDgsXG4gICAgICAgIHJlcXVpcmVMb3dlcmNhc2U6IGZhbHNlLFxuICAgICAgICByZXF1aXJlRGlnaXRzOiBmYWxzZSxcbiAgICAgICAgcmVxdWlyZVN5bWJvbHM6IGZhbHNlLFxuICAgICAgICByZXF1aXJlVXBwZXJjYXNlOiBmYWxzZSxcbiAgICAgICAgdGVtcFBhc3N3b3JkVmFsaWRpdHk6IER1cmF0aW9uLmRheXMoNyksXG4gICAgICB9LFxuICAgICAgLy8gZW1haWxTZXR0aW5nczoge1xuICAgICAgLy8gICBmcm9tOiBcImhlbHBkZXNrQHNvc2xlYmFub24uY29tXCIsXG4gICAgICAvLyAgIHJlcGx5VG86IFwiaGVscGRlc2tAc29zbGViYW5vbi5jb21cIixcbiAgICAgIC8vIH0sXG4gICAgICBzaWduSW5DYXNlU2Vuc2l0aXZlOiB0cnVlLFxuICAgICAgYWNjb3VudFJlY292ZXJ5OiBjb2duaXRvLkFjY291bnRSZWNvdmVyeS5FTUFJTF9PTkxZLFxuICAgIH0pO1xuXG4gICAgY29uc3QgY2ZuVXNlclBvb2wgPSB1c2VyUG9vbC5ub2RlLmRlZmF1bHRDaGlsZCBhcyBjb2duaXRvLkNmblVzZXJQb29sO1xuICAgIC8vIGNmblVzZXJQb29sLmVtYWlsQ29uZmlndXJhdGlvbiA9IHtcbiAgICAvLyAgIGNvbmZpZ3VyYXRpb25TZXQ6IGNvbmZTZXQucmVmLFxuICAgIC8vICAgZW1haWxTZW5kaW5nQWNjb3VudDogXCJERVZFTE9QRVJcIixcbiAgICAvLyAgIGZyb206IFwiaGVscGRlc2tAc29zbGViYW5vbi5jb21cIixcbiAgICAvLyAgIHJlcGx5VG9FbWFpbEFkZHJlc3M6IFwiaGVscGRlc2tAc29zbGViYW5vbi5jb21cIixcbiAgICAvLyAgIHNvdXJjZUFybjpcbiAgICAvLyAgICAgXCJhcm46YXdzOnNlczpldS13ZXN0LTE6MjE4NTYxODYxNTgzOmlkZW50aXR5L2hlbHBkZXNrQHNvc2xlYmFub24uY29tXCIsXG4gICAgLy8gfTtcblxuICAgIHRoaXMuYXV0aG9yaXplciA9IG5ldyBhcGlndy5DZm5BdXRob3JpemVyKHRoaXMsIFwiQVBJR2F0ZXdheUF1dGhvcml6ZXJcIiwge1xuICAgICAgbmFtZTogXCJjb2duaXRvLWF1dGhvcml6ZXJcIixcbiAgICAgIGlkZW50aXR5U291cmNlOiBcIm1ldGhvZC5yZXF1ZXN0LmhlYWRlci5BdXRob3JpemF0aW9uXCIsXG4gICAgICBwcm92aWRlckFybnM6IFtjZm5Vc2VyUG9vbC5hdHRyQXJuXSxcbiAgICAgIHJlc3RBcGlJZDogdGhpcy5hcGkucmVzdEFwaUlkLFxuICAgICAgdHlwZTogYXBpZ3cuQXV0aG9yaXphdGlvblR5cGUuQ09HTklUTyxcbiAgICB9KTtcblxuICAgIGNvbnN0IHVzZXJQb29sQ2xpZW50ID0gbmV3IGNvZ25pdG8uVXNlclBvb2xDbGllbnQoXG4gICAgICB0aGlzLFxuICAgICAgXCJzb3NsZWJhbm9uLWNsaWVudFwiLFxuICAgICAge1xuICAgICAgICB1c2VyUG9vbENsaWVudE5hbWU6IFwic29zbGViYW5vbi1jbGllbnRcIixcbiAgICAgICAgZ2VuZXJhdGVTZWNyZXQ6IGZhbHNlLFxuICAgICAgICB1c2VyUG9vbDogdXNlclBvb2wsXG4gICAgICB9XG4gICAgKTtcbiAgICBjb25zdCBpZGVudGl0eVBvb2wgPSBuZXcgY29nbml0by5DZm5JZGVudGl0eVBvb2woXG4gICAgICB0aGlzLFxuICAgICAgXCJzb3NsZWJhbm9uLWlkZW50aXR5LXBvb2xcIixcbiAgICAgIHtcbiAgICAgICAgaWRlbnRpdHlQb29sTmFtZTogXCJzb3NsZWJhbm9uLWlkZW50aXR5LXBvb2xcIixcbiAgICAgICAgYWxsb3dVbmF1dGhlbnRpY2F0ZWRJZGVudGl0aWVzOiBmYWxzZSxcbiAgICAgICAgY29nbml0b0lkZW50aXR5UHJvdmlkZXJzOiBbXG4gICAgICAgICAge1xuICAgICAgICAgICAgY2xpZW50SWQ6IHVzZXJQb29sQ2xpZW50LnVzZXJQb29sQ2xpZW50SWQsXG4gICAgICAgICAgICBwcm92aWRlck5hbWU6IHVzZXJQb29sLnVzZXJQb29sUHJvdmlkZXJOYW1lLFxuICAgICAgICAgIH0sXG4gICAgICAgIF0sXG4gICAgICB9XG4gICAgKTtcbiAgICAvLyBjb25zdCB1bmF1dGhlbnRpY2F0ZWRSb2xlID0gbmV3IGlhbS5Sb2xlKFxuICAgIC8vICAgdGhpcyxcbiAgICAvLyAgIFwiQ29nbml0b0RlZmF1bHRVbmF1dGhlbnRpY2F0ZWRSb2xlXCIsXG4gICAgLy8gICB7XG4gICAgLy8gICAgIGFzc3VtZWRCeTogbmV3IGlhbS5GZWRlcmF0ZWRQcmluY2lwYWwoXG4gICAgLy8gICAgICAgXCJjb2duaXRvLWlkZW50aXR5LmFtYXpvbmF3cy5jb21cIixcbiAgICAvLyAgICAgICB7XG4gICAgLy8gICAgICAgICBTdHJpbmdFcXVhbHM6IHtcbiAgICAvLyAgICAgICAgICAgXCJjb2duaXRvLWlkZW50aXR5LmFtYXpvbmF3cy5jb206YXVkXCI6IGlkZW50aXR5UG9vbC5yZWYsXG4gICAgLy8gICAgICAgICB9LFxuICAgIC8vICAgICAgICAgXCJGb3JBbnlWYWx1ZTpTdHJpbmdMaWtlXCI6IHtcbiAgICAvLyAgICAgICAgICAgXCJjb2duaXRvLWlkZW50aXR5LmFtYXpvbmF3cy5jb206YW1yXCI6IFwidW5hdXRoZW50aWNhdGVkXCIsXG4gICAgLy8gICAgICAgICB9LFxuICAgIC8vICAgICAgIH0sXG4gICAgLy8gICAgICAgXCJzdHM6QXNzdW1lUm9sZVdpdGhXZWJJZGVudGl0eVwiXG4gICAgLy8gICAgICksXG4gICAgLy8gICB9XG4gICAgLy8gKTtcbiAgICAvLyB1bmF1dGhlbnRpY2F0ZWRSb2xlLmFkZFRvUG9saWN5KFxuICAgIC8vICAgbmV3IFBvbGljeVN0YXRlbWVudCh7XG4gICAgLy8gICAgIGVmZmVjdDogRWZmZWN0LkFMTE9XLFxuICAgIC8vICAgICBhY3Rpb25zOiBbXCJtb2JpbGVhbmFseXRpY3M6UHV0RXZlbnRzXCIsIFwiY29nbml0by1zeW5jOipcIl0sXG4gICAgLy8gICAgIHJlc291cmNlczogW1wiKlwiXSxcbiAgICAvLyAgIH0pXG4gICAgLy8gKTtcblxuICAgIGNvbnN0IGF1dGhlbnRpY2F0ZWRSb2xlID0gbmV3IGlhbS5Sb2xlKFxuICAgICAgdGhpcyxcbiAgICAgIFwiQ29nbml0b0RlZmF1bHRBdXRoZW50aWNhdGVkUm9sZVwiLFxuICAgICAge1xuICAgICAgICBhc3N1bWVkQnk6IG5ldyBpYW0uRmVkZXJhdGVkUHJpbmNpcGFsKFxuICAgICAgICAgIFwiY29nbml0by1pZGVudGl0eS5hbWF6b25hd3MuY29tXCIsXG4gICAgICAgICAge1xuICAgICAgICAgICAgU3RyaW5nRXF1YWxzOiB7XG4gICAgICAgICAgICAgIFwiY29nbml0by1pZGVudGl0eS5hbWF6b25hd3MuY29tOmF1ZFwiOiBpZGVudGl0eVBvb2wucmVmLFxuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIFwiRm9yQW55VmFsdWU6U3RyaW5nTGlrZVwiOiB7XG4gICAgICAgICAgICAgIFwiY29nbml0by1pZGVudGl0eS5hbWF6b25hd3MuY29tOmFtclwiOiBcImF1dGhlbnRpY2F0ZWRcIixcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgfSxcbiAgICAgICAgICBcInN0czpBc3N1bWVSb2xlV2l0aFdlYklkZW50aXR5XCJcbiAgICAgICAgKSxcbiAgICAgIH1cbiAgICApO1xuXG4gICAgYXV0aGVudGljYXRlZFJvbGUuYWRkVG9Qb2xpY3koXG4gICAgICBuZXcgaWFtLlBvbGljeVN0YXRlbWVudCh7XG4gICAgICAgIGVmZmVjdDogaWFtLkVmZmVjdC5BTExPVyxcbiAgICAgICAgYWN0aW9uczogW1xuICAgICAgICAgIFwibW9iaWxlYW5hbHl0aWNzOlB1dEV2ZW50c1wiLFxuICAgICAgICAgIFwiY29nbml0by1zeW5jOipcIixcbiAgICAgICAgICBcImNvZ25pdG8taWRlbnRpdHk6KlwiLFxuICAgICAgICBdLFxuICAgICAgICByZXNvdXJjZXM6IFtcIipcIl0sXG4gICAgICB9KVxuICAgICk7XG5cbiAgICBhdXRoZW50aWNhdGVkUm9sZS5hZGRUb1BvbGljeShcbiAgICAgIG5ldyBpYW0uUG9saWN5U3RhdGVtZW50KHtcbiAgICAgICAgZWZmZWN0OiBpYW0uRWZmZWN0LkFMTE9XLFxuICAgICAgICBhY3Rpb25zOiBbXCJsYW1iZGE6SW52b2tlRnVuY3Rpb25cIl0sXG4gICAgICAgIHJlc291cmNlczogW1wiKlwiXSxcbiAgICAgIH0pXG4gICAgKTtcblxuICAgIGNvbnN0IGRlZmF1bHRQb2xpY3kgPSBuZXcgY29nbml0by5DZm5JZGVudGl0eVBvb2xSb2xlQXR0YWNobWVudChcbiAgICAgIHRoaXMsXG4gICAgICBcIklkZW50aXR5UG9vbFJvbGVNYXBwaW5nXCIsXG4gICAgICB7XG4gICAgICAgIGlkZW50aXR5UG9vbElkOiBpZGVudGl0eVBvb2wucmVmLFxuICAgICAgICByb2xlczoge1xuICAgICAgICAgIC8vIHVuYXV0aGVudGljYXRlZDogdW5hdXRoZW50aWNhdGVkUm9sZS5yb2xlQXJuLFxuICAgICAgICAgIGF1dGhlbnRpY2F0ZWQ6IGF1dGhlbnRpY2F0ZWRSb2xlLnJvbGVBcm4sXG4gICAgICAgIH0sXG4gICAgICB9XG4gICAgKTtcbiAgfVxuICAvLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vL1xuICBjcmVhdGVBUElSZXNvdXJjZXMoKSB7XG4gICAgY29uc3QgaGVscEFwaVJlc291cmNlID0gdGhpcy5hcGkucm9vdC5hZGRSZXNvdXJjZShcImhlbHBcIik7XG4gICAgaGVscEFwaVJlc291cmNlLmFkZE1ldGhvZChcbiAgICAgIFwiT1BUSU9OU1wiLFxuICAgICAgZGVmYXVsdHMubW9ja0ludGVncmF0aW9uLFxuICAgICAgZGVmYXVsdHMub3B0aW9uc1xuICAgICk7XG5cbiAgICB0aGlzLmdldEFkbWluUG9zdHNGdW5jdGlvbihoZWxwQXBpUmVzb3VyY2UpOyAvLyBHRVRcbiAgICB0aGlzLmNyZWF0ZVBvc3RzRnVuY3Rpb24oaGVscEFwaVJlc291cmNlKTsgLy8gUE9TVFxuICAgIHRoaXMuZGVsZXRlUG9zdEZ1bmN0aW9uKGhlbHBBcGlSZXNvdXJjZSk7IC8vIERFTEVURVxuXG4gICAgY29uc3QgbGF0ZXN0SGVscEFwaVJlc291cmNlID0gdGhpcy5hcGkucm9vdC5hZGRSZXNvdXJjZShcImxhdGVzdC1oZWxwXCIpO1xuICAgIGxhdGVzdEhlbHBBcGlSZXNvdXJjZS5hZGRNZXRob2QoXG4gICAgICBcIk9QVElPTlNcIixcbiAgICAgIGRlZmF1bHRzLm1vY2tJbnRlZ3JhdGlvbixcbiAgICAgIGRlZmF1bHRzLm9wdGlvbnNcbiAgICApO1xuXG4gICAgdGhpcy5nZXRMYXRlc3RQb3N0c0Z1bmN0aW9uKGxhdGVzdEhlbHBBcGlSZXNvdXJjZSk7IC8vIEdFVFxuXG4gICAgY29uc3QgdHlwZUhlbHBBcGlSZXNvdXJjZSA9IHRoaXMuYXBpLnJvb3QuYWRkUmVzb3VyY2UoXCJ0eXBlLWhlbHBcIik7XG4gICAgdHlwZUhlbHBBcGlSZXNvdXJjZS5hZGRNZXRob2QoXG4gICAgICBcIk9QVElPTlNcIixcbiAgICAgIGRlZmF1bHRzLm1vY2tJbnRlZ3JhdGlvbixcbiAgICAgIGRlZmF1bHRzLm9wdGlvbnNcbiAgICApO1xuXG4gICAgdGhpcy5nZXRUeXBlUG9zdHNGdW5jdGlvbih0eXBlSGVscEFwaVJlc291cmNlKTsgLy8gR0VUXG4gIH1cblxuICBnZXRBZG1pblBvc3RzRnVuY3Rpb24oaGVscEFwaVJlc291cmNlOiBhcGlndy5SZXNvdXJjZSkge1xuICAgIGNvbnN0IGdldFR5cGVQb3N0cyA9IG5ldyBsYW1iZGEuRnVuY3Rpb24odGhpcywgXCJnZXQtYWRtaW4tcG9zdHNcIiwge1xuICAgICAgZnVuY3Rpb25OYW1lOiBcImdldC1hZG1pbi1wb3N0c1wiLFxuICAgICAgcnVudGltZTogbGFtYmRhLlJ1bnRpbWUuTk9ERUpTXzEyX1gsXG4gICAgICBoYW5kbGVyOiBcImluZGV4LmhhbmRsZXJcIixcbiAgICAgIGNvZGU6IGxhbWJkYS5Db2RlLmZyb21Bc3NldChcbiAgICAgICAgcGF0aC5qb2luKF9fZGlybmFtZSwgXCIuLi9sYW1iZGFzL2dldC1hZG1pbi1wb3N0c1wiKVxuICAgICAgKSxcbiAgICAgIGVudmlyb25tZW50OiB7XG4gICAgICAgIFBPU1RTX1RBQkxFOiB0aGlzLnBvc3RzVGFibGUudGFibGVOYW1lLFxuICAgICAgfSxcbiAgICB9KTtcblxuICAgIHRoaXMucG9zdHNUYWJsZS5ncmFudFJlYWREYXRhKGdldFR5cGVQb3N0cyk7XG5cbiAgICBoZWxwQXBpUmVzb3VyY2UuYWRkTWV0aG9kKFxuICAgICAgXCJHRVRcIixcbiAgICAgIGRlZmF1bHRzLmxhbWJkYUludGVncmF0aW9uKGdldFR5cGVQb3N0cywge1xuICAgICAgICBcImFwcGxpY2F0aW9uL2pzb25cIjogJ3tcXG5cInN1YlwiOiBcIiRjb250ZXh0LmF1dGhvcml6ZXIuY2xhaW1zLnN1YlwiXFxufScsXG4gICAgICB9KSxcbiAgICAgIHtcbiAgICAgICAgLi4uZGVmYXVsdHMub3B0aW9ucyxcbiAgICAgICAgYXV0aG9yaXphdGlvblR5cGU6IGFwaWd3LkF1dGhvcml6YXRpb25UeXBlLkNPR05JVE8sXG4gICAgICAgIGF1dGhvcml6ZXI6IHsgYXV0aG9yaXplcklkOiB0aGlzLmF1dGhvcml6ZXIucmVmIH0sXG4gICAgICB9XG4gICAgKTtcbiAgfVxuXG4gIGNyZWF0ZVBvc3RzRnVuY3Rpb24oaGVscEFwaVJlc291cmNlOiBhcGlndy5SZXNvdXJjZSkge1xuICAgIGNvbnN0IGNyZWF0ZVBvc3QgPSBuZXcgbGFtYmRhLkZ1bmN0aW9uKHRoaXMsIFwiY3JlYXRlLXBvc3RcIiwge1xuICAgICAgZnVuY3Rpb25OYW1lOiBcImNyZWF0ZS1wb3N0XCIsXG4gICAgICBydW50aW1lOiBsYW1iZGEuUnVudGltZS5OT0RFSlNfMTJfWCxcbiAgICAgIGhhbmRsZXI6IFwiaW5kZXguaGFuZGxlclwiLFxuICAgICAgY29kZTogbGFtYmRhLkNvZGUuZnJvbUFzc2V0KFxuICAgICAgICBwYXRoLmpvaW4oX19kaXJuYW1lLCBcIi4uL2xhbWJkYXMvY3JlYXRlLXBvc3RcIilcbiAgICAgICksXG4gICAgICBlbnZpcm9ubWVudDoge1xuICAgICAgICBQT1NUU19UQUJMRTogdGhpcy5wb3N0c1RhYmxlLnRhYmxlTmFtZSxcbiAgICAgIH0sXG4gICAgfSk7XG5cbiAgICB0aGlzLnBvc3RzVGFibGUuZ3JhbnRSZWFkV3JpdGVEYXRhKGNyZWF0ZVBvc3QpO1xuXG4gICAgaGVscEFwaVJlc291cmNlLmFkZE1ldGhvZChcbiAgICAgIFwiUE9TVFwiLFxuICAgICAgZGVmYXVsdHMubGFtYmRhSW50ZWdyYXRpb24oY3JlYXRlUG9zdCwge1xuICAgICAgICBcImFwcGxpY2F0aW9uL2pzb25cIjpcbiAgICAgICAgICAne1xcblwicmVxdWVzdEJvZHlcIjogJGlucHV0LmJvZHksXFxuXCJzdWJcIjogXCIkY29udGV4dC5hdXRob3JpemVyLmNsYWltcy5zdWJcIlxcbn0nLFxuICAgICAgfSksXG4gICAgICB7XG4gICAgICAgIC4uLmRlZmF1bHRzLm9wdGlvbnMsXG4gICAgICAgIGF1dGhvcml6YXRpb25UeXBlOiBhcGlndy5BdXRob3JpemF0aW9uVHlwZS5DT0dOSVRPLFxuICAgICAgICBhdXRob3JpemVyOiB7IGF1dGhvcml6ZXJJZDogdGhpcy5hdXRob3JpemVyLnJlZiB9LFxuICAgICAgfVxuICAgICk7XG4gIH1cblxuICBkZWxldGVQb3N0RnVuY3Rpb24oaGVscEFwaVJlc291cmNlOiBhcGlndy5SZXNvdXJjZSkge1xuICAgIGNvbnN0IGdldFR5cGVQb3N0cyA9IG5ldyBsYW1iZGEuRnVuY3Rpb24odGhpcywgXCJkZWxldGUtcG9zdFwiLCB7XG4gICAgICBmdW5jdGlvbk5hbWU6IFwiZGVsZXRlLXBvc3RcIixcbiAgICAgIHJ1bnRpbWU6IGxhbWJkYS5SdW50aW1lLk5PREVKU18xMl9YLFxuICAgICAgaGFuZGxlcjogXCJpbmRleC5oYW5kbGVyXCIsXG4gICAgICBjb2RlOiBsYW1iZGEuQ29kZS5mcm9tQXNzZXQoXG4gICAgICAgIHBhdGguam9pbihfX2Rpcm5hbWUsIFwiLi4vbGFtYmRhcy9kZWxldGUtcG9zdFwiKVxuICAgICAgKSxcbiAgICAgIGVudmlyb25tZW50OiB7XG4gICAgICAgIFBPU1RTX1RBQkxFOiB0aGlzLnBvc3RzVGFibGUudGFibGVOYW1lLFxuICAgICAgfSxcbiAgICB9KTtcblxuICAgIHRoaXMucG9zdHNUYWJsZS5ncmFudFdyaXRlRGF0YShnZXRUeXBlUG9zdHMpO1xuXG4gICAgaGVscEFwaVJlc291cmNlLmFkZE1ldGhvZChcbiAgICAgIFwiREVMRVRFXCIsXG4gICAgICBkZWZhdWx0cy5sYW1iZGFJbnRlZ3JhdGlvbihnZXRUeXBlUG9zdHMsIHtcbiAgICAgICAgXCJhcHBsaWNhdGlvbi9qc29uXCI6IGBcbiAgICAgICAgICAgICNzZXQoJGhhc0lkID0gJGlucHV0LnBhcmFtcygnaWQnKSlcbiAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgXCJzdWJcIjogXCIkY29udGV4dC5hdXRob3JpemVyLmNsYWltcy5zdWJcIlxuICAgICAgICAgICAgICAjaWYoJGhhc0lkICE9IFwiXCIpLCBcImlkXCIgOiBcIiRpbnB1dC5wYXJhbXMoJ2lkJylcIiNlbmRcbiAgICAgICAgICAgIH1cbiAgICAgICAgICBgLFxuICAgICAgfSksXG4gICAgICB7XG4gICAgICAgIC4uLmRlZmF1bHRzLm9wdGlvbnMsXG4gICAgICAgIGF1dGhvcml6YXRpb25UeXBlOiBhcGlndy5BdXRob3JpemF0aW9uVHlwZS5DT0dOSVRPLFxuICAgICAgICBhdXRob3JpemVyOiB7IGF1dGhvcml6ZXJJZDogdGhpcy5hdXRob3JpemVyLnJlZiB9LFxuICAgICAgfVxuICAgICk7XG4gIH1cblxuICBnZXRMYXRlc3RQb3N0c0Z1bmN0aW9uKGhlbHBBcGlSZXNvdXJjZTogYXBpZ3cuUmVzb3VyY2UpIHtcbiAgICBjb25zdCBnZXRUeXBlUG9zdHMgPSBuZXcgbGFtYmRhLkZ1bmN0aW9uKHRoaXMsIFwiZ2V0LWxhdGVzdC1wb3N0c1wiLCB7XG4gICAgICBmdW5jdGlvbk5hbWU6IFwiZ2V0LWxhdGVzdC1wb3N0c1wiLFxuICAgICAgcnVudGltZTogbGFtYmRhLlJ1bnRpbWUuTk9ERUpTXzEyX1gsXG4gICAgICBoYW5kbGVyOiBcImluZGV4LmhhbmRsZXJcIixcbiAgICAgIGNvZGU6IGxhbWJkYS5Db2RlLmZyb21Bc3NldChcbiAgICAgICAgcGF0aC5qb2luKF9fZGlybmFtZSwgXCIuLi9sYW1iZGFzL2dldC1sYXRlc3QtcG9zdHNcIilcbiAgICAgICksXG4gICAgICBlbnZpcm9ubWVudDoge1xuICAgICAgICBQT1NUU19UQUJMRTogdGhpcy5wb3N0c1RhYmxlLnRhYmxlTmFtZSxcbiAgICAgIH0sXG4gICAgfSk7XG5cbiAgICB0aGlzLnBvc3RzVGFibGUuZ3JhbnRSZWFkRGF0YShnZXRUeXBlUG9zdHMpO1xuXG4gICAgaGVscEFwaVJlc291cmNlLmFkZE1ldGhvZChcbiAgICAgIFwiR0VUXCIsXG4gICAgICBkZWZhdWx0cy5sYW1iZGFJbnRlZ3JhdGlvbihnZXRUeXBlUG9zdHMsIHtcbiAgICAgICAgXCJhcHBsaWNhdGlvbi9qc29uXCI6IGBcbiAgICAgICAgICAjc2V0KCRoYXNMYXN0RXZhbHVhdGVkS2V5ID0gJGlucHV0LnBhcmFtcygnbGFzdEV2YWx1YXRlZEtleScpKVxuICAgICAgICAgICNzZXQoJGhhc0xpbWl0ID0gJGlucHV0LnBhcmFtcygnbGltaXQnKSlcbiAgICAgICAgICB7XG4gICAgICAgICAgICAjaWYoJGhhc0xpbWl0ICE9IFwiXCIpIFwibGltaXRcIiA6IFwiJGlucHV0LnBhcmFtcygnbGltaXQnKVwiI2VuZFxuICAgICAgICAgICAgI2lmKCRoYXNMYXN0RXZhbHVhdGVkS2V5ICE9IFwiXCIpLFwibGFzdEV2YWx1YXRlZEtleVwiOiBcIiRpbnB1dC5wYXJhbXMoJ2xhc3RFdmFsdWF0ZWRLZXknKVwiI2VuZFxuICAgICAgICAgIH1cbiAgICAgICAgYCxcbiAgICAgIH0pLFxuICAgICAgZGVmYXVsdHMub3B0aW9uc1xuICAgICk7XG4gIH1cblxuICBnZXRUeXBlUG9zdHNGdW5jdGlvbihoZWxwQXBpUmVzb3VyY2U6IGFwaWd3LlJlc291cmNlKSB7XG4gICAgY29uc3QgZ2V0VHlwZVBvc3RzID0gbmV3IGxhbWJkYS5GdW5jdGlvbih0aGlzLCBcImdldC10eXBlLXBvc3RzXCIsIHtcbiAgICAgIGZ1bmN0aW9uTmFtZTogXCJnZXQtdHlwZS1wb3N0c1wiLFxuICAgICAgcnVudGltZTogbGFtYmRhLlJ1bnRpbWUuTk9ERUpTXzEyX1gsXG4gICAgICBoYW5kbGVyOiBcImluZGV4LmhhbmRsZXJcIixcbiAgICAgIGNvZGU6IGxhbWJkYS5Db2RlLmZyb21Bc3NldChcbiAgICAgICAgcGF0aC5qb2luKF9fZGlybmFtZSwgXCIuLi9sYW1iZGFzL2dldC10eXBlLXBvc3RzXCIpXG4gICAgICApLFxuICAgICAgZW52aXJvbm1lbnQ6IHtcbiAgICAgICAgUE9TVFNfVEFCTEU6IHRoaXMucG9zdHNUYWJsZS50YWJsZU5hbWUsXG4gICAgICB9LFxuICAgIH0pO1xuXG4gICAgdGhpcy5wb3N0c1RhYmxlLmdyYW50UmVhZERhdGEoZ2V0VHlwZVBvc3RzKTtcblxuICAgIGhlbHBBcGlSZXNvdXJjZS5hZGRNZXRob2QoXG4gICAgICBcIkdFVFwiLFxuICAgICAgZGVmYXVsdHMubGFtYmRhSW50ZWdyYXRpb24oZ2V0VHlwZVBvc3RzLCB7XG4gICAgICAgIFwiYXBwbGljYXRpb24vanNvblwiOiBgXG4gICAgICAgICNzZXQoJGhhc1R5cGVJZCA9ICRpbnB1dC5wYXJhbXMoJ3R5cGVJZCcpKVxuICAgICAgICAjc2V0KCRoYXNMYXN0RXZhbHVhdGVkS2V5ID0gJGlucHV0LnBhcmFtcygnbGFzdEV2YWx1YXRlZEtleScpKVxuICAgICAgICAjc2V0KCRoYXNMaW1pdCA9ICRpbnB1dC5wYXJhbXMoJ2xpbWl0JykpXG4gICAgICAgIHtcbiAgICAgICAgICAjaWYoJGhhc1R5cGVJZCAhPSBcIlwiKSBcInR5cGVJZFwiIDogXCIkaW5wdXQucGFyYW1zKCd0eXBlSWQnKVwiI2VuZFxuICAgICAgICAgICNpZigkaGFzTGltaXQgIT0gXCJcIiksXCJsaW1pdFwiIDogXCIkaW5wdXQucGFyYW1zKCdsaW1pdCcpXCIjZW5kXG4gICAgICAgICAgI2lmKCRoYXNMYXN0RXZhbHVhdGVkS2V5ICE9IFwiXCIpLFwibGFzdEV2YWx1YXRlZEtleVwiOiBcIiRpbnB1dC5wYXJhbXMoJ2xhc3RFdmFsdWF0ZWRLZXknKVwiI2VuZFxuICAgICAgICB9XG4gICAgICBgLFxuICAgICAgfSksXG4gICAgICBkZWZhdWx0cy5vcHRpb25zXG4gICAgKTtcbiAgfVxufVxuIl19