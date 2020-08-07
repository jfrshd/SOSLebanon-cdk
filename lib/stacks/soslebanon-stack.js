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
        helpApiResource.addMethod("GET", defaults.lambdaIntegration(getTypePosts, {}), {
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
            "application/json": '{"requestBody": $input.body, "organization_id": "$context.authorizer.claims.sub"}',
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
        this.postsTable.grantReadData(getTypePosts);
        helpApiResource.addMethod("DELETE", defaults.lambdaIntegration(getTypePosts, {}), {
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
        helpApiResource.addMethod("GET", defaults.lambdaIntegration(getTypePosts, {}), defaults.options);
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
        helpApiResource.addMethod("GET", defaults.lambdaIntegration(getTypePosts, {}), defaults.options);
    }
}
exports.SoslebanonStack = SoslebanonStack;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic29zbGViYW5vbi1zdGFjay5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbInNvc2xlYmFub24tc3RhY2sudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7QUFBQSxxQ0FBcUM7QUFDckMsa0RBQWtEO0FBQ2xELDhDQUE4QztBQUU5QyxpREFBaUQ7QUFDakQsZ0RBQWdEO0FBQ2hELHdDQUF3QztBQUN4Qyx3Q0FBd0M7QUFDeEMsNkJBQTZCO0FBQzdCLCtDQUErQztBQUMvQyx3Q0FBNkQ7QUFJN0QsTUFBYSxlQUFnQixTQUFRLEdBQUcsQ0FBQyxLQUFLO0lBSzVDLFlBQVksS0FBb0IsRUFBRSxFQUFVLEVBQUUsS0FBc0I7UUFDbEUsS0FBSyxDQUFDLEtBQUssRUFBRSxFQUFFLEVBQUUsS0FBSyxDQUFDLENBQUM7UUFFeEIsSUFBSSxDQUFDLEdBQUcsR0FBRyxJQUFJLEtBQUssQ0FBQyxPQUFPLENBQUMsSUFBSSxFQUFFLGVBQWUsQ0FBQyxDQUFDO1FBRXBELElBQUksQ0FBQyxhQUFhLEVBQUUsQ0FBQztRQUVyQixJQUFJLENBQUMsZ0JBQWdCLEVBQUUsQ0FBQztRQUV4QixNQUFNLFVBQVUsR0FBRyxJQUFJLFFBQVEsQ0FBQyxLQUFLLENBQUMsSUFBSSxFQUFFLGFBQWEsRUFBRTtZQUN6RCxTQUFTLEVBQUUsYUFBYTtZQUN4QixZQUFZLEVBQUUsRUFBRSxJQUFJLEVBQUUsSUFBSSxFQUFFLElBQUksRUFBRSxRQUFRLENBQUMsYUFBYSxDQUFDLE1BQU0sRUFBRTtZQUNqRSxXQUFXLEVBQUUsUUFBUSxDQUFDLFdBQVcsQ0FBQyxlQUFlO1NBQ2xELENBQUMsQ0FBQztRQUVILElBQUksQ0FBQyxrQkFBa0IsRUFBRSxDQUFDO0lBQzVCLENBQUM7SUFFRCxnQkFBZ0I7UUFDZCxJQUFJLENBQUMsVUFBVSxHQUFHLElBQUksUUFBUSxDQUFDLEtBQUssQ0FBQyxJQUFJLEVBQUUsYUFBYSxFQUFFO1lBQ3hELFNBQVMsRUFBRSxhQUFhO1lBQ3hCLFlBQVksRUFBRSxF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QUFDLENBQUM7UUFFNUMsZUFBZSxDQUFDLFNBQVMsQ0FDdkIsS0FBSyxFQUNMLFFBQVEsQ0FBQyxpQkFBaUIsQ0FBQyxZQUFZLEVBQUUsRUFBRSxDQUFDLEVBQzVDLFFBQVEsQ0FBQyxPQUFPLENBQ2pCLENBQUM7SUFDSixDQUFDO0NBQ0Y7QUEvV0QsMENBK1dDIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0ICogYXMgY2RrIGZyb20gXCJAYXdzLWNkay9jb3JlXCI7XHJcbmltcG9ydCAqIGFzIGR5bmFtb2RiIGZyb20gXCJAYXdzLWNkay9hd3MtZHluYW1vZGJcIjtcclxuaW1wb3J0ICogYXMgbGFtYmRhIGZyb20gXCJAYXdzLWNkay9hd3MtbGFtYmRhXCI7XHJcbmltcG9ydCAqIGFzIHMzIGZyb20gXCJAYXdzLWNkay9hd3MtczNcIjtcclxuaW1wb3J0ICogYXMgYXBpZ3cgZnJvbSBcIkBhd3MtY2RrL2F3cy1hcGlnYXRld2F5XCI7XHJcbmltcG9ydCAqIGFzIGNvZ25pdG8gZnJvbSBcIkBhd3MtY2RrL2F3cy1jb2duaXRvXCI7XHJcbmltcG9ydCAqIGFzIGlhbSBmcm9tIFwiQGF3cy1jZGsvYXdzLWlhbVwiO1xyXG5pbXBvcnQgKiBhcyBzZXMgZnJvbSBcIkBhd3MtY2RrL2F3cy1zZXNcIjtcclxuaW1wb3J0ICogYXMgcGF0aCBmcm9tIFwicGF0aFwiO1xyXG5pbXBvcnQgKiBhcyBkZWZhdWx0cyBmcm9tIFwiLi4vZXh0cmFzL2RlZmF1bHRzXCI7XHJcbmltcG9ydCB7IFJlbW92YWxQb2xpY3ksIFRhZywgRHVyYXRpb24gfSBmcm9tIFwiQGF3cy1jZGsvY29yZVwiO1xyXG5pbXBvcnQgeyBNZmEsIFVzZXJQb29sIH0gZnJvbSBcIkBhd3MtY2RrL2F3cy1jb2duaXRvXCI7XHJcbmltcG9ydCB7IElGdW5jdGlvbiB9IGZyb20gXCJAYXdzLWNkay9hd3MtbGFtYmRhXCI7XHJcblxyXG5leHBvcnQgY2xhc3MgU29zbGViYW5vblN0YWNrIGV4dGVuZHMgY2RrLlN0YWNrIHtcclxuICBhcGk6IGFwaWd3LlJlc3RBcGk7XHJcbiAgcG9zdHNUYWJsZTogZHluYW1vZGIuVGFibGU7XHJcbiAgYXV0aG9yaXplcjogYXBpZ3cuQ2ZuQXV0aG9yaXplcjtcclxuXHJcbiAgY29uc3RydWN0b3Ioc2NvcGU6IGNkay5Db25zdHJ1Y3QsIGlkOiBzdHJpbmcsIHByb3BzPzogY2RrLlN0YWNrUHJvcHMpIHtcclxuICAgIHN1cGVyKHNjb3BlLCBpZCwgcHJvcHMpO1xyXG5cclxuICAgIHRoaXMuYXBpID0gbmV3IGFwaWd3LlJlc3RBcGkodGhpcywgXCJTT1NMZWJhbm9uQVBJXCIpO1xyXG5cclxuICAgIHRoaXMuY3JlYXRlQ29nbml0bygpO1xyXG5cclxuICAgIHRoaXMuY3JlYXRlUG9zdHNUYWJsZSgpO1xyXG5cclxuICAgIGNvbnN0IHR5cGVzVGFibGUgPSBuZXcgZHluYW1vZGIuVGFibGUodGhpcywgXCJ0eXBlcy10YWJsZVwiLCB7XHJcbiAgICAgIHRhYmxlTmFtZTogXCJ0eXBlcy10YWJsZVwiLFxyXG4gICAgICBwYXJ0aXRpb25LZXk6IHsgbmFtZTogXCJwa1wiLCB0eXBlOiBkeW5hbW9kYi5BdHRyaWJ1dGVUeXBlLlNUUklORyB9LFxyXG4gICAgICBiaWxsaW5nTW9kZTogZHluYW1vZGIuQmlsbGluZ01vZGUuUEFZX1BFUl9SRVFVRVNULFxyXG4gICAgfSk7XHJcblxyXG4gICAgdGhpcy5jcmVhdGVBUElSZXNvdXJjZXMoKTtcclxuICB9XHJcblxyXG4gIGNyZWF0ZVBvc3RzVGFibGUoKTogdm9pZCB7XHJcbiAgICB0aGlzLnBvc3RzVGFibGUgPSBuZXcgZHluYW1vZGIuVGFibGUodGhpcywgXCJwb3N0cy10YWJsZVwiLCB7XHJcbiAgICAgIHRhYmxlTmFtZTogXCJwb3N0cy10YWJsZVwiLFxyXG4gICAgICBwYXJ0aXRpb25LZXk6IHsgbmFtZTogXCJwa1wiLCB0eXBlOiBkeW5hbW9kYi5BdHRyaWJ1dGVUeXBlLlNUUklORyB9LFxyXG4gICAgICBzb3J0S2V5OiB7XHJcbiAgICAgICAgbmFtZTogXCJpZFwiLFxyXG4gICAgICAgIHR5cGU6IGR5bmFtb2RiLkF0dHJpYnV0ZVR5cGUuU1RSSU5HLFxyXG4gICAgICB9LFxyXG4gICAgICBiaWxsaW5nTW9kZTogZHluYW1vZGIuQmlsbGluZ01vZGUuUEFZX1BFUl9SRVFVRVNULFxyXG4gICAgICAvLyByZWFkQ2FwYWNpdHk6IDUsXHJcbiAgICAgIC8vIHdyaXRlQ2FwYWNpdHk6IDUsXHJcbiAgICB9KTtcclxuICAgIHRoaXMucG9zdHNUYWJsZS5hZGRMb2NhbFNlY29uZGFyeUluZGV4KHtcclxuICAgICAgaW5kZXhOYW1lOiBcImNyZWF0aW9uRGF0ZVwiLFxyXG4gICAgICBzb3J0S2V5OiB7XHJcbiAgICAgICAgbmFtZTogXCJjcmVhdGlvbkRhdGVcIixcclxuICAgICAgICB0eXBlOiBkeW5hbW9kYi5BdHRyaWJ1dGVUeXBlLk5VTUJFUixcclxuICAgICAgfSxcclxuICAgIH0pO1xyXG4gICAgdGhpcy5wb3N0c1RhYmxlLmFkZExvY2FsU2Vjb25kYXJ5SW5kZXgoe1xyXG4gICAgICBpbmRleE5hbWU6IFwidHlwZUlkXCIsXHJcbiAgICAgIHNvcnRLZXk6IHtcclxuICAgICAgICBuYW1lOiBcInR5cGVJZFwiLFxyXG4gICAgICAgIHR5cGU6IGR5bmFtb2RiLkF0dHJpYnV0ZVR5cGUuU1RSSU5HLFxyXG4gICAgICB9LFxyXG4gICAgfSk7XHJcbiAgfVxyXG5cclxuICBjcmVhdGVDb2duaXRvKCk6IHZvaWQge1xyXG4gICAgY29uc3QgY29uZlNldCA9IG5ldyBzZXMuQ2ZuQ29uZmlndXJhdGlvblNldCh0aGlzLCBcInNvc2xlYmFub24tY29uZi1zZXRcIiwge1xyXG4gICAgICBuYW1lOiBcInNvc2xlYmFub24tc2VzLWNvbmYtc2V0XCIsXHJcbiAgICB9KTtcclxuXHJcbiAgICBjb25zdCB1c2VyUG9vbCA9IG5ldyBjb2duaXRvLlVzZXJQb29sKHRoaXMsIFwic29zbGViYW5vbi11c2VyLXBvb2xcIiwge1xyXG4gICAgICB1c2VyUG9vbE5hbWU6IFwic29zbGViYW5vbi11c2VyLXBvb2xcIixcclxuICAgICAgc2VsZlNpZ25VcEVuYWJsZWQ6IHRydWUsXHJcbiAgICAgIHNpZ25JbkFsaWFzZXM6IHtcclxuICAgICAgICB1c2VybmFtZTogZmFsc2UsXHJcbiAgICAgICAgZW1haWw6IHRydWUsXHJcbiAgICAgIH0sXHJcbiAgICAgIHN0YW5kYXJkQXR0cmlidXRlczoge1xyXG4gICAgICAgIGdpdmVuTmFtZTogeyBtdXRhYmxlOiB0cnVlLCByZXF1aXJlZDogdHJ1ZSB9LFxyXG4gICAgICAgIGZhbWlseU5hbWU6IHsgbXV0YWJsZTogdHJ1ZSwgcmVxdWlyZWQ6IHRydWUgfSxcclxuICAgICAgICBlbWFpbDogeyBtdXRhYmxlOiB0cnVlLCByZXF1aXJlZDogdHJ1ZSB9LFxyXG4gICAgICAgIHBob25lTnVtYmVyOiB7IG11dGFibGU6IHRydWUsIHJlcXVpcmVkOiB0cnVlIH0sXHJcbiAgICAgICAgYWRkcmVzczogeyBtdXRhYmxlOiB0cnVlLCByZXF1aXJlZDogdHJ1ZSB9LFxyXG4gICAgICB9LFxyXG4gICAgICBjdXN0b21BdHRyaWJ1dGVzOiB7XHJcbiAgICAgICAgdHlwZTogbmV3IGNvZ25pdG8uU3RyaW5nQXR0cmlidXRlKHsgbXV0YWJsZTogdHJ1ZSB9KSxcclxuICAgICAgfSxcclxuICAgICAgYXV0b1ZlcmlmeToge1xyXG4gICAgICAgIGVtYWlsOiB0cnVlLFxyXG4gICAgICAgIHBob25lOiB0cnVlLFxyXG4gICAgICB9LFxyXG4gICAgICBwYXNzd29yZFBvbGljeToge1xyXG4gICAgICAgIG1pbkxlbmd0aDogOCxcclxuICAgICAgICByZXF1aXJlTG93ZXJjYXNlOiBmYWxzZSxcclxuICAgICAgICByZXF1aXJlRGlnaXRzOiBmYWxzZSxcclxuICAgICAgICByZXF1aXJlU3ltYm9sczogZmFsc2UsXHJcbiAgICAgICAgcmVxdWlyZVVwcGVyY2FzZTogZmFsc2UsXHJcbiAgICAgICAgdGVtcFBhc3N3b3JkVmFsaWRpdHk6IER1cmF0aW9uLmRheXMoNyksXHJcbiAgICAgIH0sXHJcbiAgICAgIC8vIGVtYWlsU2V0dGluZ3M6IHtcclxuICAgICAgLy8gICBmcm9tOiBcImhlbHBkZXNrQHNvc2xlYmFub24uY29tXCIsXHJcbiAgICAgIC8vICAgcmVwbHlUbzogXCJoZWxwZGVza0Bzb3NsZWJhbm9uLmNvbVwiLFxyXG4gICAgICAvLyB9LFxyXG4gICAgICBzaWduSW5DYXNlU2Vuc2l0aXZlOiB0cnVlLFxyXG4gICAgICBhY2NvdW50UmVjb3Zlcnk6IGNvZ25pdG8uQWNjb3VudFJlY292ZXJ5LkVNQUlMX09OTFksXHJcbiAgICB9KTtcclxuXHJcbiAgICBjb25zdCBjZm5Vc2VyUG9vbCA9IHVzZXJQb29sLm5vZGUuZGVmYXVsdENoaWxkIGFzIGNvZ25pdG8uQ2ZuVXNlclBvb2w7XHJcbiAgICAvLyBjZm5Vc2VyUG9vbC5lbWFpbENvbmZpZ3VyYXRpb24gPSB7XHJcbiAgICAvLyAgIGNvbmZpZ3VyYXRpb25TZXQ6IGNvbmZTZXQucmVmLFxyXG4gICAgLy8gICBlbWFpbFNlbmRpbmdBY2NvdW50OiBcIkRFVkVMT1BFUlwiLFxyXG4gICAgLy8gICBmcm9tOiBcImhlbHBkZXNrQHNvc2xlYmFub24uY29tXCIsXHJcbiAgICAvLyAgIHJlcGx5VG9FbWFpbEFkZHJlc3M6IFwiaGVscGRlc2tAc29zbGViYW5vbi5jb21cIixcclxuICAgIC8vICAgc291cmNlQXJuOlxyXG4gICAgLy8gICAgIFwiYXJuOmF3czpzZXM6ZXUtd2VzdC0xOjIxODU2MTg2MTU4MzppZGVudGl0eS9oZWxwZGVza0Bzb3NsZWJhbm9uLmNvbVwiLFxyXG4gICAgLy8gfTtcclxuXHJcbiAgICB0aGlzLmF1dGhvcml6ZXIgPSBuZXcgYXBpZ3cuQ2ZuQXV0aG9yaXplcih0aGlzLCBcIkFQSUdhdGV3YXlBdXRob3JpemVyXCIsIHtcclxuICAgICAgbmFtZTogXCJjb2duaXRvLWF1dGhvcml6ZXJcIixcclxuICAgICAgaWRlbnRpdHlTb3VyY2U6IFwibWV0aG9kLnJlcXVlc3QuaGVhZGVyLkF1dGhvcml6YXRpb25cIixcclxuICAgICAgcHJvdmlkZXJBcm5zOiBbY2ZuVXNlclBvb2wuYXR0ckFybl0sXHJcbiAgICAgIHJlc3RBcGlJZDogdGhpcy5hcGkucmVzdEFwaUlkLFxyXG4gICAgICB0eXBlOiBhcGlndy5BdXRob3JpemF0aW9uVHlwZS5DT0dOSVRPLFxyXG4gICAgfSk7XHJcblxyXG4gICAgY29uc3QgdXNlclBvb2xDbGllbnQgPSBuZXcgY29nbml0by5Vc2VyUG9vbENsaWVudChcclxuICAgICAgdGhpcyxcclxuICAgICAgXCJzb3NsZWJhbm9uLWNsaWVudFwiLFxyXG4gICAgICB7XHJcbiAgICAgICAgdXNlclBvb2xDbGllbnROYW1lOiBcInNvc2xlYmFub24tY2xpZW50XCIsXHJcbiAgICAgICAgZ2VuZXJhdGVTZWNyZXQ6IGZhbHNlLFxyXG4gICAgICAgIHVzZXJQb29sOiB1c2VyUG9vbCxcclxuICAgICAgfVxyXG4gICAgKTtcclxuICAgIGNvbnN0IGlkZW50aXR5UG9vbCA9IG5ldyBjb2duaXRvLkNmbklkZW50aXR5UG9vbChcclxuICAgICAgdGhpcyxcclxuICAgICAgXCJzb3NsZWJhbm9uLWlkZW50aXR5LXBvb2xcIixcclxuICAgICAge1xyXG4gICAgICAgIGlkZW50aXR5UG9vbE5hbWU6IFwic29zbGViYW5vbi1pZGVudGl0eS1wb29sXCIsXHJcbiAgICAgICAgYWxsb3dVbmF1dGhlbnRpY2F0ZWRJZGVudGl0aWVzOiBmYWxzZSxcclxuICAgICAgICBjb2duaXRvSWRlbnRpdHlQcm92aWRlcnM6IFtcclxuICAgICAgICAgIHtcclxuICAgICAgICAgICAgY2xpZW50SWQ6IHVzZXJQb29sQ2xpZW50LnVzZXJQb29sQ2xpZW50SWQsXHJcbiAgICAgICAgICAgIHByb3ZpZGVyTmFtZTogdXNlclBvb2wudXNlclBvb2xQcm92aWRlck5hbWUsXHJcbiAgICAgICAgICB9LFxyXG4gICAgICAgIF0sXHJcbiAgICAgIH1cclxuICAgICk7XHJcbiAgICAvLyBjb25zdCB1bmF1dGhlbnRpY2F0ZWRSb2xlID0gbmV3IGlhbS5Sb2xlKFxyXG4gICAgLy8gICB0aGlzLFxyXG4gICAgLy8gICBcIkNvZ25pdG9EZWZhdWx0VW5hdXRoZW50aWNhdGVkUm9sZVwiLFxyXG4gICAgLy8gICB7XHJcbiAgICAvLyAgICAgYXNzdW1lZEJ5OiBuZXcgaWFtLkZlZGVyYXRlZFByaW5jaXBhbChcclxuICAgIC8vICAgICAgIFwiY29nbml0by1pZGVudGl0eS5hbWF6b25hd3MuY29tXCIsXHJcbiAgICAvLyAgICAgICB7XHJcbiAgICAvLyAgICAgICAgIFN0cmluZ0VxdWFsczoge1xyXG4gICAgLy8gICAgICAgICAgIFwiY29nbml0by1pZGVudGl0eS5hbWF6b25hd3MuY29tOmF1ZFwiOiBpZGVudGl0eVBvb2wucmVmLFxyXG4gICAgLy8gICAgICAgICB9LFxyXG4gICAgLy8gICAgICAgICBcIkZvckFueVZhbHVlOlN0cmluZ0xpa2VcIjoge1xyXG4gICAgLy8gICAgICAgICAgIFwiY29nbml0by1pZGVudGl0eS5hbWF6b25hd3MuY29tOmFtclwiOiBcInVuYXV0aGVudGljYXRlZFwiLFxyXG4gICAgLy8gICAgICAgICB9LFxyXG4gICAgLy8gICAgICAgfSxcclxuICAgIC8vICAgICAgIFwic3RzOkFzc3VtZVJvbGVXaXRoV2ViSWRlbnRpdHlcIlxyXG4gICAgLy8gICAgICksXHJcbiAgICAvLyAgIH1cclxuICAgIC8vICk7XHJcbiAgICAvLyB1bmF1dGhlbnRpY2F0ZWRSb2xlLmFkZFRvUG9saWN5KFxyXG4gICAgLy8gICBuZXcgUG9saWN5U3RhdGVtZW50KHtcclxuICAgIC8vICAgICBlZmZlY3Q6IEVmZmVjdC5BTExPVyxcclxuICAgIC8vICAgICBhY3Rpb25zOiBbXCJtb2JpbGVhbmFseXRpY3M6UHV0RXZlbnRzXCIsIFwiY29nbml0by1zeW5jOipcIl0sXHJcbiAgICAvLyAgICAgcmVzb3VyY2VzOiBbXCIqXCJdLFxyXG4gICAgLy8gICB9KVxyXG4gICAgLy8gKTtcclxuXHJcbiAgICBjb25zdCBhdXRoZW50aWNhdGVkUm9sZSA9IG5ldyBpYW0uUm9sZShcclxuICAgICAgdGhpcyxcclxuICAgICAgXCJDb2duaXRvRGVmYXVsdEF1dGhlbnRpY2F0ZWRSb2xlXCIsXHJcbiAgICAgIHtcclxuICAgICAgICBhc3N1bWVkQnk6IG5ldyBpYW0uRmVkZXJhdGVkUHJpbmNpcGFsKFxyXG4gICAgICAgICAgXCJjb2duaXRvLWlkZW50aXR5LmFtYXpvbmF3cy5jb21cIixcclxuICAgICAgICAgIHtcclxuICAgICAgICAgICAgU3RyaW5nRXF1YWxzOiB7XHJcbiAgICAgICAgICAgICAgXCJjb2duaXRvLWlkZW50aXR5LmFtYXpvbmF3cy5jb206YXVkXCI6IGlkZW50aXR5UG9vbC5yZWYsXHJcbiAgICAgICAgICAgIH0sXHJcbiAgICAgICAgICAgIFwiRm9yQW55VmFsdWU6U3RyaW5nTGlrZVwiOiB7XHJcbiAgICAgICAgICAgICAgXCJjb2duaXRvLWlkZW50aXR5LmFtYXpvbmF3cy5jb206YW1yXCI6IFwiYXV0aGVudGljYXRlZFwiLFxyXG4gICAgICAgICAgICB9LFxyXG4gICAgICAgICAgfSxcclxuICAgICAgICAgIFwic3RzOkFzc3VtZVJvbGVXaXRoV2ViSWRlbnRpdHlcIlxyXG4gICAgICAgICksXHJcbiAgICAgIH1cclxuICAgICk7XHJcblxyXG4gICAgYXV0aGVudGljYXRlZFJvbGUuYWRkVG9Qb2xpY3koXHJcbiAgICAgIG5ldyBpYW0uUG9saWN5U3RhdGVtZW50KHtcclxuICAgICAgICBlZmZlY3Q6IGlhbS5FZmZlY3QuQUxMT1csXHJcbiAgICAgICAgYWN0aW9uczogW1xyXG4gICAgICAgICAgXCJtb2JpbGVhbmFseXRpY3M6UHV0RXZlbnRzXCIsXHJcbiAgICAgICAgICBcImNvZ25pdG8tc3luYzoqXCIsXHJcbiAgICAgICAgICBcImNvZ25pdG8taWRlbnRpdHk6KlwiLFxyXG4gICAgICAgIF0sXHJcbiAgICAgICAgcmVzb3VyY2VzOiBbXCIqXCJdLFxyXG4gICAgICB9KVxyXG4gICAgKTtcclxuXHJcbiAgICBhdXRoZW50aWNhdGVkUm9sZS5hZGRUb1BvbGljeShcclxuICAgICAgbmV3IGlhbS5Qb2xpY3lTdGF0ZW1lbnQoe1xyXG4gICAgICAgIGVmZmVjdDogaWFtLkVmZmVjdC5BTExPVyxcclxuICAgICAgICBhY3Rpb25zOiBbXCJsYW1iZGE6SW52b2tlRnVuY3Rpb25cIl0sXHJcbiAgICAgICAgcmVzb3VyY2VzOiBbXCIqXCJdLFxyXG4gICAgICB9KVxyXG4gICAgKTtcclxuXHJcbiAgICBjb25zdCBkZWZhdWx0UG9saWN5ID0gbmV3IGNvZ25pdG8uQ2ZuSWRlbnRpdHlQb29sUm9sZUF0dGFjaG1lbnQoXHJcbiAgICAgIHRoaXMsXHJcbiAgICAgIFwiSWRlbnRpdHlQb29sUm9sZU1hcHBpbmdcIixcclxuICAgICAge1xyXG4gICAgICAgIGlkZW50aXR5UG9vbElkOiBpZGVudGl0eVBvb2wucmVmLFxyXG4gICAgICAgIHJvbGVzOiB7XHJcbiAgICAgICAgICAvLyB1bmF1dGhlbnRpY2F0ZWQ6IHVuYXV0aGVudGljYXRlZFJvbGUucm9sZUFybixcclxuICAgICAgICAgIGF1dGhlbnRpY2F0ZWQ6IGF1dGhlbnRpY2F0ZWRSb2xlLnJvbGVBcm4sXHJcbiAgICAgICAgfSxcclxuICAgICAgfVxyXG4gICAgKTtcclxuICB9XHJcbiAgLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy9cclxuICBjcmVhdGVBUElSZXNvdXJjZXMoKSB7XHJcbiAgICBjb25zdCBoZWxwQXBpUmVzb3VyY2UgPSB0aGlzLmFwaS5yb290LmFkZFJlc291cmNlKFwiaGVscFwiKTtcclxuICAgIGhlbHBBcGlSZXNvdXJjZS5hZGRNZXRob2QoXHJcbiAgICAgIFwiT1BUSU9OU1wiLFxyXG4gICAgICBkZWZhdWx0cy5tb2NrSW50ZWdyYXRpb24sXHJcbiAgICAgIGRlZmF1bHRzLm9wdGlvbnNcclxuICAgICk7XHJcblxyXG4gICAgdGhpcy5nZXRBZG1pblBvc3RzRnVuY3Rpb24oaGVscEFwaVJlc291cmNlKTsgLy8gR0VUXHJcbiAgICB0aGlzLmNyZWF0ZVBvc3RzRnVuY3Rpb24oaGVscEFwaVJlc291cmNlKTsgLy8gUE9TVFxyXG4gICAgdGhpcy5kZWxldGVQb3N0RnVuY3Rpb24oaGVscEFwaVJlc291cmNlKTsgLy8gREVMRVRFXHJcblxyXG4gICAgY29uc3QgbGF0ZXN0SGVscEFwaVJlc291cmNlID0gdGhpcy5hcGkucm9vdC5hZGRSZXNvdXJjZShcImxhdGVzdC1oZWxwXCIpO1xyXG4gICAgbGF0ZXN0SGVscEFwaVJlc291cmNlLmFkZE1ldGhvZChcclxuICAgICAgXCJPUFRJT05TXCIsXHJcbiAgICAgIGRlZmF1bHRzLm1vY2tJbnRlZ3JhdGlvbixcclxuICAgICAgZGVmYXVsdHMub3B0aW9uc1xyXG4gICAgKTtcclxuXHJcbiAgICB0aGlzLmdldExhdGVzdFBvc3RzRnVuY3Rpb24obGF0ZXN0SGVscEFwaVJlc291cmNlKTsgLy8gR0VUXHJcblxyXG4gICAgY29uc3QgdHlwZUhlbHBBcGlSZXNvdXJjZSA9IHRoaXMuYXBpLnJvb3QuYWRkUmVzb3VyY2UoXCJ0eXBlLWhlbHBcIik7XHJcbiAgICB0eXBlSGVscEFwaVJlc291cmNlLmFkZE1ldGhvZChcclxuICAgICAgXCJPUFRJT05TXCIsXHJcbiAgICAgIGRlZmF1bHRzLm1vY2tJbnRlZ3JhdGlvbixcclxuICAgICAgZGVmYXVsdHMub3B0aW9uc1xyXG4gICAgKTtcclxuXHJcbiAgICB0aGlzLmdldFR5cGVQb3N0c0Z1bmN0aW9uKHR5cGVIZWxwQXBpUmVzb3VyY2UpOyAvLyBHRVRcclxuICB9XHJcblxyXG4gIGdldEFkbWluUG9zdHNGdW5jdGlvbihoZWxwQXBpUmVzb3VyY2U6IGFwaWd3LlJlc291cmNlKSB7XHJcbiAgICBjb25zdCBnZXRUeXBlUG9zdHMgPSBuZXcgbGFtYmRhLkZ1bmN0aW9uKHRoaXMsIFwiZ2V0LWFkbWluLXBvc3RzXCIsIHtcclxuICAgICAgZnVuY3Rpb25OYW1lOiBcImdldC1hZG1pbi1wb3N0c1wiLFxyXG4gICAgICBydW50aW1lOiBsYW1iZGEuUnVudGltZS5OT0RFSlNfMTJfWCxcclxuICAgICAgaGFuZGxlcjogXCJpbmRleC5oYW5kbGVyXCIsXHJcbiAgICAgIGNvZGU6IGxhbWJkYS5Db2RlLmZyb21Bc3NldChcclxuICAgICAgICBwYXRoLmpvaW4oX19kaXJuYW1lLCBcIi4uL2xhbWJkYXMvZ2V0LWFkbWluLXBvc3RzXCIpXHJcbiAgICAgICksXHJcbiAgICAgIGVudmlyb25tZW50OiB7XHJcbiAgICAgICAgUE9TVFNfVEFCTEU6IHRoaXMucG9zdHNUYWJsZS50YWJsZU5hbWUsXHJcbiAgICAgIH0sXHJcbiAgICB9KTtcclxuXHJcbiAgICB0aGlzLnBvc3RzVGFibGUuZ3JhbnRSZWFkRGF0YShnZXRUeXBlUG9zdHMpO1xyXG5cclxuICAgIGhlbHBBcGlSZXNvdXJjZS5hZGRNZXRob2QoXHJcbiAgICAgIFwiR0VUXCIsXHJcbiAgICAgIGRlZmF1bHRzLmxhbWJkYUludGVncmF0aW9uKGdldFR5cGVQb3N0cywge30pLFxyXG4gICAgICB7XHJcbiAgICAgICAgLi4uZGVmYXVsdHMub3B0aW9ucyxcclxuICAgICAgICBhdXRob3JpemF0aW9uVHlwZTogYXBpZ3cuQXV0aG9yaXphdGlvblR5cGUuQ09HTklUTyxcclxuICAgICAgICBhdXRob3JpemVyOiB7IGF1dGhvcml6ZXJJZDogdGhpcy5hdXRob3JpemVyLnJlZiB9LFxyXG4gICAgICB9XHJcbiAgICApO1xyXG4gIH1cclxuXHJcbiAgY3JlYXRlUG9zdHNGdW5jdGlvbihoZWxwQXBpUmVzb3VyY2U6IGFwaWd3LlJlc291cmNlKSB7XHJcbiAgICBjb25zdCBjcmVhdGVQb3N0ID0gbmV3IGxhbWJkYS5GdW5jdGlvbih0aGlzLCBcImNyZWF0ZS1wb3N0XCIsIHtcclxuICAgICAgZnVuY3Rpb25OYW1lOiBcImNyZWF0ZS1wb3N0XCIsXHJcbiAgICAgIHJ1bnRpbWU6IGxhbWJkYS5SdW50aW1lLk5PREVKU18xMl9YLFxyXG4gICAgICBoYW5kbGVyOiBcImluZGV4LmhhbmRsZXJcIixcclxuICAgICAgY29kZTogbGFtYmRhLkNvZGUuZnJvbUFzc2V0KFxyXG4gICAgICAgIHBhdGguam9pbihfX2Rpcm5hbWUsIFwiLi4vbGFtYmRhcy9jcmVhdGUtcG9zdFwiKVxyXG4gICAgICApLFxyXG4gICAgICBlbnZpcm9ubWVudDoge1xyXG4gICAgICAgIFBPU1RTX1RBQkxFOiB0aGlzLnBvc3RzVGFibGUudGFibGVOYW1lLFxyXG4gICAgICB9LFxyXG4gICAgfSk7XHJcblxyXG4gICAgdGhpcy5wb3N0c1RhYmxlLmdyYW50UmVhZFdyaXRlRGF0YShjcmVhdGVQb3N0KTtcclxuXHJcbiAgICBoZWxwQXBpUmVzb3VyY2UuYWRkTWV0aG9kKFxyXG4gICAgICBcIlBPU1RcIixcclxuICAgICAgZGVmYXVsdHMubGFtYmRhSW50ZWdyYXRpb24oY3JlYXRlUG9zdCwge1xyXG4gICAgICAgIFwiYXBwbGljYXRpb24vanNvblwiOlxyXG4gICAgICAgICAgJ3tcInJlcXVlc3RCb2R5XCI6ICRpbnB1dC5ib2R5LCBcIm9yZ2FuaXphdGlvbl9pZFwiOiBcIiRjb250ZXh0LmF1dGhvcml6ZXIuY2xhaW1zLnN1YlwifScsXHJcbiAgICAgIH0pLFxyXG4gICAgICB7XHJcbiAgICAgICAgLi4uZGVmYXVsdHMub3B0aW9ucyxcclxuICAgICAgICBhdXRob3JpemF0aW9uVHlwZTogYXBpZ3cuQXV0aG9yaXphdGlvblR5cGUuQ09HTklUTyxcclxuICAgICAgICBhdXRob3JpemVyOiB7IGF1dGhvcml6ZXJJZDogdGhpcy5hdXRob3JpemVyLnJlZiB9LFxyXG4gICAgICB9XHJcbiAgICApO1xyXG4gIH1cclxuXHJcbiAgZGVsZXRlUG9zdEZ1bmN0aW9uKGhlbHBBcGlSZXNvdXJjZTogYXBpZ3cuUmVzb3VyY2UpIHtcclxuICAgIGNvbnN0IGdldFR5cGVQb3N0cyA9IG5ldyBsYW1iZGEuRnVuY3Rpb24odGhpcywgXCJkZWxldGUtcG9zdFwiLCB7XHJcbiAgICAgIGZ1bmN0aW9uTmFtZTogXCJkZWxldGUtcG9zdFwiLFxyXG4gICAgICBydW50aW1lOiBsYW1iZGEuUnVudGltZS5OT0RFSlNfMTJfWCxcclxuICAgICAgaGFuZGxlcjogXCJpbmRleC5oYW5kbGVyXCIsXHJcbiAgICAgIGNvZGU6IGxhbWJkYS5Db2RlLmZyb21Bc3NldChcclxuICAgICAgICBwYXRoLmpvaW4oX19kaXJuYW1lLCBcIi4uL2xhbWJkYXMvZGVsZXRlLXBvc3RcIilcclxuICAgICAgKSxcclxuICAgICAgZW52aXJvbm1lbnQ6IHtcclxuICAgICAgICBQT1NUU19UQUJMRTogdGhpcy5wb3N0c1RhYmxlLnRhYmxlTmFtZSxcclxuICAgICAgfSxcclxuICAgIH0pO1xyXG5cclxuICAgIHRoaXMucG9zdHNUYWJsZS5ncmFudFJlYWREYXRhKGdldFR5cGVQb3N0cyk7XHJcblxyXG4gICAgaGVscEFwaVJlc291cmNlLmFkZE1ldGhvZChcclxuICAgICAgXCJERUxFVEVcIixcclxuICAgICAgZGVmYXVsdHMubGFtYmRhSW50ZWdyYXRpb24oZ2V0VHlwZVBvc3RzLCB7fSksXHJcbiAgICAgIHtcclxuICAgICAgICAuLi5kZWZhdWx0cy5vcHRpb25zLFxyXG4gICAgICAgIGF1dGhvcml6YXRpb25UeXBlOiBhcGlndy5BdXRob3JpemF0aW9uVHlwZS5DT0dOSVRPLFxyXG4gICAgICAgIGF1dGhvcml6ZXI6IHsgYXV0aG9yaXplcklkOiB0aGlzLmF1dGhvcml6ZXIucmVmIH0sXHJcbiAgICAgIH1cclxuICAgICk7XHJcbiAgfVxyXG5cclxuICBnZXRMYXRlc3RQb3N0c0Z1bmN0aW9uKGhlbHBBcGlSZXNvdXJjZTogYXBpZ3cuUmVzb3VyY2UpIHtcclxuICAgIGNvbnN0IGdldFR5cGVQb3N0cyA9IG5ldyBsYW1iZGEuRnVuY3Rpb24odGhpcywgXCJnZXQtbGF0ZXN0LXBvc3RzXCIsIHtcclxuICAgICAgZnVuY3Rpb25OYW1lOiBcImdldC1sYXRlc3QtcG9zdHNcIixcclxuICAgICAgcnVudGltZTogbGFtYmRhLlJ1bnRpbWUuTk9ERUpTXzEyX1gsXHJcbiAgICAgIGhhbmRsZXI6IFwiaW5kZXguaGFuZGxlclwiLFxyXG4gICAgICBjb2RlOiBsYW1iZGEuQ29kZS5mcm9tQXNzZXQoXHJcbiAgICAgICAgcGF0aC5qb2luKF9fZGlybmFtZSwgXCIuLi9sYW1iZGFzL2dldC1sYXRlc3QtcG9zdHNcIilcclxuICAgICAgKSxcclxuICAgICAgZW52aXJvbm1lbnQ6IHtcclxuICAgICAgICBQT1NUU19UQUJMRTogdGhpcy5wb3N0c1RhYmxlLnRhYmxlTmFtZSxcclxuICAgICAgfSxcclxuICAgIH0pO1xyXG5cclxuICAgIHRoaXMucG9zdHNUYWJsZS5ncmFudFJlYWREYXRhKGdldFR5cGVQb3N0cyk7XHJcblxyXG4gICAgaGVscEFwaVJlc291cmNlLmFkZE1ldGhvZChcclxuICAgICAgXCJHRVRcIixcclxuICAgICAgZGVmYXVsdHMubGFtYmRhSW50ZWdyYXRpb24oZ2V0VHlwZVBvc3RzLCB7fSksXHJcbiAgICAgIGRlZmF1bHRzLm9wdGlvbnNcclxuICAgICk7XHJcbiAgfVxyXG5cclxuICBnZXRUeXBlUG9zdHNGdW5jdGlvbihoZWxwQXBpUmVzb3VyY2U6IGFwaWd3LlJlc291cmNlKSB7XHJcbiAgICBjb25zdCBnZXRUeXBlUG9zdHMgPSBuZXcgbGFtYmRhLkZ1bmN0aW9uKHRoaXMsIFwiZ2V0LXR5cGUtcG9zdHNcIiwge1xyXG4gICAgICBmdW5jdGlvbk5hbWU6IFwiZ2V0LXR5cGUtcG9zdHNcIixcclxuICAgICAgcnVudGltZTogbGFtYmRhLlJ1bnRpbWUuTk9ERUpTXzEyX1gsXHJcbiAgICAgIGhhbmRsZXI6IFwiaW5kZXguaGFuZGxlclwiLFxyXG4gICAgICBjb2RlOiBsYW1iZGEuQ29kZS5mcm9tQXNzZXQoXHJcbiAgICAgICAgcGF0aC5qb2luKF9fZGlybmFtZSwgXCIuLi9sYW1iZGFzL2dldC10eXBlLXBvc3RzXCIpXHJcbiAgICAgICksXHJcbiAgICAgIGVudmlyb25tZW50OiB7XHJcbiAgICAgICAgUE9TVFNfVEFCTEU6IHRoaXMucG9zdHNUYWJsZS50YWJsZU5hbWUsXHJcbiAgICAgIH0sXHJcbiAgICB9KTtcclxuXHJcbiAgICB0aGlzLnBvc3RzVGFibGUuZ3JhbnRSZWFkRGF0YShnZXRUeXBlUG9zdHMpO1xyXG5cclxuICAgIGhlbHBBcGlSZXNvdXJjZS5hZGRNZXRob2QoXHJcbiAgICAgIFwiR0VUXCIsXHJcbiAgICAgIGRlZmF1bHRzLmxhbWJkYUludGVncmF0aW9uKGdldFR5cGVQb3N0cywge30pLFxyXG4gICAgICBkZWZhdWx0cy5vcHRpb25zXHJcbiAgICApO1xyXG4gIH1cclxufVxyXG4iXX0=