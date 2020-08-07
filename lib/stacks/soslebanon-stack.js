"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SoslebanonStack = void 0;
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic29zbGViYW5vbi1zdGFjay5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbInNvc2xlYmFub24tc3RhY2sudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7O0FBQUEscUNBQXFDO0FBQ3JDLGtEQUFrRDtBQUNsRCw4Q0FBOEM7QUFFOUMsaURBQWlEO0FBQ2pELGdEQUFnRDtBQUNoRCx3Q0FBd0M7QUFDeEMsd0NBQXdDO0FBQ3hDLDZCQUE2QjtBQUM3QiwrQ0FBK0M7QUFDL0Msd0NBQTZEO0FBSTdELE1BQWEsZUFBZ0IsU0FBUSxHQUFHLENBQUMsS0FBSztJQUs1QyxZQUFZLEtBQW9CLEVBQUUsRUFBVSxFQUFFLEtBQXNCO1FBQ2xFLEtBQUssQ0FBQyxLQUFLLEVBQUUsRUFBRSxFQUFFLEtBQUssQ0FBQyxDQUFDO1FBRXhCLElBQUksQ0FBQyxHQUFHLEdBQUcsSUFBSSxLQUFLLENBQUMsT0FBTyxDQUFDLElBQUksRUFBRSxlQUFlLENBQUMsQ0FBQztRQUVwRCxJQUFJLENBQUMsYUFBYSxFQUFFLENBQUM7UUFFckIsSUFBSSxDQUFDLGdCQUFnQixFQUFFLENBQUM7UUFFeEIsTUFBTSxVQUFVLEdBQUcsSUFBSSxRQUFRLENBQUMsS0FBSyxDQUFDLElBQUksRUFBRSxhQUFhLEVBQUU7WUFDekQsU0FBUyxFQUFFLGFBQWE7WUFDeEIsWUFBWSxFQUFFLEVBQUUsSUFBSSxFQUFFLElBQUksRUFBRSxJQUFJLEVBQUUsUUFBUSxDQUFDLGFBQWEsQ0FBQyxNQUFNLEVBQUU7WUFDakUsV0FBVyxFQUFFLFFBQVEsQ0FBQyxXQUFXLENBQUMsZUFBZTtTQUNsRCxDQUFDLENBQUM7UUFFSCxJQUFJLENBQUMsa0JBQWtCLEVBQUUsQ0FBQztJQUM1QixDQUFDO0lBRUQsZ0JBQWdCO1FBQ2QsSUFBSSxDQUFDLFVBQVUsR0FBRyxJQUFJLFFBQVEsQ0FBQyxLQUFLLENBQUMsSUFBSSxFQUFFLGFBQWEsRUFBRTtZQUN4RCxTQUFTLEVBQUUsYUFBYTtZQUN4QixZQUFZLEVBQUUs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Q0FBQyxDQUFDO1FBRTVDLGVBQWUsQ0FBQyxTQUFTLENBQ3ZCLEtBQUssRUFDTCxRQUFRLENBQUMsaUJBQWlCLENBQUMsWUFBWSxFQUFFLEVBQUUsQ0FBQyxFQUM1QyxRQUFRLENBQUMsT0FBTyxDQUNqQixDQUFDO0lBQ0osQ0FBQztDQUNGO0FBL1dELDBDQStXQyIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCAqIGFzIGNkayBmcm9tIFwiQGF3cy1jZGsvY29yZVwiO1xyXG5pbXBvcnQgKiBhcyBkeW5hbW9kYiBmcm9tIFwiQGF3cy1jZGsvYXdzLWR5bmFtb2RiXCI7XHJcbmltcG9ydCAqIGFzIGxhbWJkYSBmcm9tIFwiQGF3cy1jZGsvYXdzLWxhbWJkYVwiO1xyXG5pbXBvcnQgKiBhcyBzMyBmcm9tIFwiQGF3cy1jZGsvYXdzLXMzXCI7XHJcbmltcG9ydCAqIGFzIGFwaWd3IGZyb20gXCJAYXdzLWNkay9hd3MtYXBpZ2F0ZXdheVwiO1xyXG5pbXBvcnQgKiBhcyBjb2duaXRvIGZyb20gXCJAYXdzLWNkay9hd3MtY29nbml0b1wiO1xyXG5pbXBvcnQgKiBhcyBpYW0gZnJvbSBcIkBhd3MtY2RrL2F3cy1pYW1cIjtcclxuaW1wb3J0ICogYXMgc2VzIGZyb20gXCJAYXdzLWNkay9hd3Mtc2VzXCI7XHJcbmltcG9ydCAqIGFzIHBhdGggZnJvbSBcInBhdGhcIjtcclxuaW1wb3J0ICogYXMgZGVmYXVsdHMgZnJvbSBcIi4uL2V4dHJhcy9kZWZhdWx0c1wiO1xyXG5pbXBvcnQgeyBSZW1vdmFsUG9saWN5LCBUYWcsIER1cmF0aW9uIH0gZnJvbSBcIkBhd3MtY2RrL2NvcmVcIjtcclxuaW1wb3J0IHsgTWZhLCBVc2VyUG9vbCB9IGZyb20gXCJAYXdzLWNkay9hd3MtY29nbml0b1wiO1xyXG5pbXBvcnQgeyBJRnVuY3Rpb24gfSBmcm9tIFwiQGF3cy1jZGsvYXdzLWxhbWJkYVwiO1xyXG5cclxuZXhwb3J0IGNsYXNzIFNvc2xlYmFub25TdGFjayBleHRlbmRzIGNkay5TdGFjayB7XHJcbiAgYXBpOiBhcGlndy5SZXN0QXBpO1xyXG4gIHBvc3RzVGFibGU6IGR5bmFtb2RiLlRhYmxlO1xyXG4gIGF1dGhvcml6ZXI6IGFwaWd3LkNmbkF1dGhvcml6ZXI7XHJcblxyXG4gIGNvbnN0cnVjdG9yKHNjb3BlOiBjZGsuQ29uc3RydWN0LCBpZDogc3RyaW5nLCBwcm9wcz86IGNkay5TdGFja1Byb3BzKSB7XHJcbiAgICBzdXBlcihzY29wZSwgaWQsIHByb3BzKTtcclxuXHJcbiAgICB0aGlzLmFwaSA9IG5ldyBhcGlndy5SZXN0QXBpKHRoaXMsIFwiU09TTGViYW5vbkFQSVwiKTtcclxuXHJcbiAgICB0aGlzLmNyZWF0ZUNvZ25pdG8oKTtcclxuXHJcbiAgICB0aGlzLmNyZWF0ZVBvc3RzVGFibGUoKTtcclxuXHJcbiAgICBjb25zdCB0eXBlc1RhYmxlID0gbmV3IGR5bmFtb2RiLlRhYmxlKHRoaXMsIFwidHlwZXMtdGFibGVcIiwge1xyXG4gICAgICB0YWJsZU5hbWU6IFwidHlwZXMtdGFibGVcIixcclxuICAgICAgcGFydGl0aW9uS2V5OiB7IG5hbWU6IFwicGtcIiwgdHlwZTogZHluYW1vZGIuQXR0cmlidXRlVHlwZS5TVFJJTkcgfSxcclxuICAgICAgYmlsbGluZ01vZGU6IGR5bmFtb2RiLkJpbGxpbmdNb2RlLlBBWV9QRVJfUkVRVUVTVCxcclxuICAgIH0pO1xyXG5cclxuICAgIHRoaXMuY3JlYXRlQVBJUmVzb3VyY2VzKCk7XHJcbiAgfVxyXG5cclxuICBjcmVhdGVQb3N0c1RhYmxlKCk6IHZvaWQge1xyXG4gICAgdGhpcy5wb3N0c1RhYmxlID0gbmV3IGR5bmFtb2RiLlRhYmxlKHRoaXMsIFwicG9zdHMtdGFibGVcIiwge1xyXG4gICAgICB0YWJsZU5hbWU6IFwicG9zdHMtdGFibGVcIixcclxuICAgICAgcGFydGl0aW9uS2V5OiB7IG5hbWU6IFwicGtcIiwgdHlwZTogZHluYW1vZGIuQXR0cmlidXRlVHlwZS5TVFJJTkcgfSxcclxuICAgICAgc29ydEtleToge1xyXG4gICAgICAgIG5hbWU6IFwiaWRcIixcclxuICAgICAgICB0eXBlOiBkeW5hbW9kYi5BdHRyaWJ1dGVUeXBlLlNUUklORyxcclxuICAgICAgfSxcclxuICAgICAgYmlsbGluZ01vZGU6IGR5bmFtb2RiLkJpbGxpbmdNb2RlLlBBWV9QRVJfUkVRVUVTVCxcclxuICAgICAgLy8gcmVhZENhcGFjaXR5OiA1LFxyXG4gICAgICAvLyB3cml0ZUNhcGFjaXR5OiA1LFxyXG4gICAgfSk7XHJcbiAgICB0aGlzLnBvc3RzVGFibGUuYWRkTG9jYWxTZWNvbmRhcnlJbmRleCh7XHJcbiAgICAgIGluZGV4TmFtZTogXCJjcmVhdGlvbkRhdGVcIixcclxuICAgICAgc29ydEtleToge1xyXG4gICAgICAgIG5hbWU6IFwiY3JlYXRpb25EYXRlXCIsXHJcbiAgICAgICAgdHlwZTogZHluYW1vZGIuQXR0cmlidXRlVHlwZS5OVU1CRVIsXHJcbiAgICAgIH0sXHJcbiAgICB9KTtcclxuICAgIHRoaXMucG9zdHNUYWJsZS5hZGRMb2NhbFNlY29uZGFyeUluZGV4KHtcclxuICAgICAgaW5kZXhOYW1lOiBcInR5cGVJZFwiLFxyXG4gICAgICBzb3J0S2V5OiB7XHJcbiAgICAgICAgbmFtZTogXCJ0eXBlSWRcIixcclxuICAgICAgICB0eXBlOiBkeW5hbW9kYi5BdHRyaWJ1dGVUeXBlLlNUUklORyxcclxuICAgICAgfSxcclxuICAgIH0pO1xyXG4gIH1cclxuXHJcbiAgY3JlYXRlQ29nbml0bygpOiB2b2lkIHtcclxuICAgIGNvbnN0IGNvbmZTZXQgPSBuZXcgc2VzLkNmbkNvbmZpZ3VyYXRpb25TZXQodGhpcywgXCJzb3NsZWJhbm9uLWNvbmYtc2V0XCIsIHtcclxuICAgICAgbmFtZTogXCJzb3NsZWJhbm9uLXNlcy1jb25mLXNldFwiLFxyXG4gICAgfSk7XHJcblxyXG4gICAgY29uc3QgdXNlclBvb2wgPSBuZXcgY29nbml0by5Vc2VyUG9vbCh0aGlzLCBcInNvc2xlYmFub24tdXNlci1wb29sXCIsIHtcclxuICAgICAgdXNlclBvb2xOYW1lOiBcInNvc2xlYmFub24tdXNlci1wb29sXCIsXHJcbiAgICAgIHNlbGZTaWduVXBFbmFibGVkOiB0cnVlLFxyXG4gICAgICBzaWduSW5BbGlhc2VzOiB7XHJcbiAgICAgICAgdXNlcm5hbWU6IGZhbHNlLFxyXG4gICAgICAgIGVtYWlsOiB0cnVlLFxyXG4gICAgICB9LFxyXG4gICAgICBzdGFuZGFyZEF0dHJpYnV0ZXM6IHtcclxuICAgICAgICBnaXZlbk5hbWU6IHsgbXV0YWJsZTogdHJ1ZSwgcmVxdWlyZWQ6IHRydWUgfSxcclxuICAgICAgICBmYW1pbHlOYW1lOiB7IG11dGFibGU6IHRydWUsIHJlcXVpcmVkOiB0cnVlIH0sXHJcbiAgICAgICAgZW1haWw6IHsgbXV0YWJsZTogdHJ1ZSwgcmVxdWlyZWQ6IHRydWUgfSxcclxuICAgICAgICBwaG9uZU51bWJlcjogeyBtdXRhYmxlOiB0cnVlLCByZXF1aXJlZDogdHJ1ZSB9LFxyXG4gICAgICAgIGFkZHJlc3M6IHsgbXV0YWJsZTogdHJ1ZSwgcmVxdWlyZWQ6IHRydWUgfSxcclxuICAgICAgfSxcclxuICAgICAgY3VzdG9tQXR0cmlidXRlczoge1xyXG4gICAgICAgIHR5cGU6IG5ldyBjb2duaXRvLlN0cmluZ0F0dHJpYnV0ZSh7IG11dGFibGU6IHRydWUgfSksXHJcbiAgICAgIH0sXHJcbiAgICAgIGF1dG9WZXJpZnk6IHtcclxuICAgICAgICBlbWFpbDogdHJ1ZSxcclxuICAgICAgICBwaG9uZTogdHJ1ZSxcclxuICAgICAgfSxcclxuICAgICAgcGFzc3dvcmRQb2xpY3k6IHtcclxuICAgICAgICBtaW5MZW5ndGg6IDgsXHJcbiAgICAgICAgcmVxdWlyZUxvd2VyY2FzZTogZmFsc2UsXHJcbiAgICAgICAgcmVxdWlyZURpZ2l0czogZmFsc2UsXHJcbiAgICAgICAgcmVxdWlyZVN5bWJvbHM6IGZhbHNlLFxyXG4gICAgICAgIHJlcXVpcmVVcHBlcmNhc2U6IGZhbHNlLFxyXG4gICAgICAgIHRlbXBQYXNzd29yZFZhbGlkaXR5OiBEdXJhdGlvbi5kYXlzKDcpLFxyXG4gICAgICB9LFxyXG4gICAgICAvLyBlbWFpbFNldHRpbmdzOiB7XHJcbiAgICAgIC8vICAgZnJvbTogXCJoZWxwZGVza0Bzb3NsZWJhbm9uLmNvbVwiLFxyXG4gICAgICAvLyAgIHJlcGx5VG86IFwiaGVscGRlc2tAc29zbGViYW5vbi5jb21cIixcclxuICAgICAgLy8gfSxcclxuICAgICAgc2lnbkluQ2FzZVNlbnNpdGl2ZTogdHJ1ZSxcclxuICAgICAgYWNjb3VudFJlY292ZXJ5OiBjb2duaXRvLkFjY291bnRSZWNvdmVyeS5FTUFJTF9PTkxZLFxyXG4gICAgfSk7XHJcblxyXG4gICAgY29uc3QgY2ZuVXNlclBvb2wgPSB1c2VyUG9vbC5ub2RlLmRlZmF1bHRDaGlsZCBhcyBjb2duaXRvLkNmblVzZXJQb29sO1xyXG4gICAgLy8gY2ZuVXNlclBvb2wuZW1haWxDb25maWd1cmF0aW9uID0ge1xyXG4gICAgLy8gICBjb25maWd1cmF0aW9uU2V0OiBjb25mU2V0LnJlZixcclxuICAgIC8vICAgZW1haWxTZW5kaW5nQWNjb3VudDogXCJERVZFTE9QRVJcIixcclxuICAgIC8vICAgZnJvbTogXCJoZWxwZGVza0Bzb3NsZWJhbm9uLmNvbVwiLFxyXG4gICAgLy8gICByZXBseVRvRW1haWxBZGRyZXNzOiBcImhlbHBkZXNrQHNvc2xlYmFub24uY29tXCIsXHJcbiAgICAvLyAgIHNvdXJjZUFybjpcclxuICAgIC8vICAgICBcImFybjphd3M6c2VzOmV1LXdlc3QtMToyMTg1NjE4NjE1ODM6aWRlbnRpdHkvaGVscGRlc2tAc29zbGViYW5vbi5jb21cIixcclxuICAgIC8vIH07XHJcblxyXG4gICAgdGhpcy5hdXRob3JpemVyID0gbmV3IGFwaWd3LkNmbkF1dGhvcml6ZXIodGhpcywgXCJBUElHYXRld2F5QXV0aG9yaXplclwiLCB7XHJcbiAgICAgIG5hbWU6IFwiY29nbml0by1hdXRob3JpemVyXCIsXHJcbiAgICAgIGlkZW50aXR5U291cmNlOiBcIm1ldGhvZC5yZXF1ZXN0LmhlYWRlci5BdXRob3JpemF0aW9uXCIsXHJcbiAgICAgIHByb3ZpZGVyQXJuczogW2NmblVzZXJQb29sLmF0dHJBcm5dLFxyXG4gICAgICByZXN0QXBpSWQ6IHRoaXMuYXBpLnJlc3RBcGlJZCxcclxuICAgICAgdHlwZTogYXBpZ3cuQXV0aG9yaXphdGlvblR5cGUuQ09HTklUTyxcclxuICAgIH0pO1xyXG5cclxuICAgIGNvbnN0IHVzZXJQb29sQ2xpZW50ID0gbmV3IGNvZ25pdG8uVXNlclBvb2xDbGllbnQoXHJcbiAgICAgIHRoaXMsXHJcbiAgICAgIFwic29zbGViYW5vbi1jbGllbnRcIixcclxuICAgICAge1xyXG4gICAgICAgIHVzZXJQb29sQ2xpZW50TmFtZTogXCJzb3NsZWJhbm9uLWNsaWVudFwiLFxyXG4gICAgICAgIGdlbmVyYXRlU2VjcmV0OiBmYWxzZSxcclxuICAgICAgICB1c2VyUG9vbDogdXNlclBvb2wsXHJcbiAgICAgIH1cclxuICAgICk7XHJcbiAgICBjb25zdCBpZGVudGl0eVBvb2wgPSBuZXcgY29nbml0by5DZm5JZGVudGl0eVBvb2woXHJcbiAgICAgIHRoaXMsXHJcbiAgICAgIFwic29zbGViYW5vbi1pZGVudGl0eS1wb29sXCIsXHJcbiAgICAgIHtcclxuICAgICAgICBpZGVudGl0eVBvb2xOYW1lOiBcInNvc2xlYmFub24taWRlbnRpdHktcG9vbFwiLFxyXG4gICAgICAgIGFsbG93VW5hdXRoZW50aWNhdGVkSWRlbnRpdGllczogZmFsc2UsXHJcbiAgICAgICAgY29nbml0b0lkZW50aXR5UHJvdmlkZXJzOiBbXHJcbiAgICAgICAgICB7XHJcbiAgICAgICAgICAgIGNsaWVudElkOiB1c2VyUG9vbENsaWVudC51c2VyUG9vbENsaWVudElkLFxyXG4gICAgICAgICAgICBwcm92aWRlck5hbWU6IHVzZXJQb29sLnVzZXJQb29sUHJvdmlkZXJOYW1lLFxyXG4gICAgICAgICAgfSxcclxuICAgICAgICBdLFxyXG4gICAgICB9XHJcbiAgICApO1xyXG4gICAgLy8gY29uc3QgdW5hdXRoZW50aWNhdGVkUm9sZSA9IG5ldyBpYW0uUm9sZShcclxuICAgIC8vICAgdGhpcyxcclxuICAgIC8vICAgXCJDb2duaXRvRGVmYXVsdFVuYXV0aGVudGljYXRlZFJvbGVcIixcclxuICAgIC8vICAge1xyXG4gICAgLy8gICAgIGFzc3VtZWRCeTogbmV3IGlhbS5GZWRlcmF0ZWRQcmluY2lwYWwoXHJcbiAgICAvLyAgICAgICBcImNvZ25pdG8taWRlbnRpdHkuYW1hem9uYXdzLmNvbVwiLFxyXG4gICAgLy8gICAgICAge1xyXG4gICAgLy8gICAgICAgICBTdHJpbmdFcXVhbHM6IHtcclxuICAgIC8vICAgICAgICAgICBcImNvZ25pdG8taWRlbnRpdHkuYW1hem9uYXdzLmNvbTphdWRcIjogaWRlbnRpdHlQb29sLnJlZixcclxuICAgIC8vICAgICAgICAgfSxcclxuICAgIC8vICAgICAgICAgXCJGb3JBbnlWYWx1ZTpTdHJpbmdMaWtlXCI6IHtcclxuICAgIC8vICAgICAgICAgICBcImNvZ25pdG8taWRlbnRpdHkuYW1hem9uYXdzLmNvbTphbXJcIjogXCJ1bmF1dGhlbnRpY2F0ZWRcIixcclxuICAgIC8vICAgICAgICAgfSxcclxuICAgIC8vICAgICAgIH0sXHJcbiAgICAvLyAgICAgICBcInN0czpBc3N1bWVSb2xlV2l0aFdlYklkZW50aXR5XCJcclxuICAgIC8vICAgICApLFxyXG4gICAgLy8gICB9XHJcbiAgICAvLyApO1xyXG4gICAgLy8gdW5hdXRoZW50aWNhdGVkUm9sZS5hZGRUb1BvbGljeShcclxuICAgIC8vICAgbmV3IFBvbGljeVN0YXRlbWVudCh7XHJcbiAgICAvLyAgICAgZWZmZWN0OiBFZmZlY3QuQUxMT1csXHJcbiAgICAvLyAgICAgYWN0aW9uczogW1wibW9iaWxlYW5hbHl0aWNzOlB1dEV2ZW50c1wiLCBcImNvZ25pdG8tc3luYzoqXCJdLFxyXG4gICAgLy8gICAgIHJlc291cmNlczogW1wiKlwiXSxcclxuICAgIC8vICAgfSlcclxuICAgIC8vICk7XHJcblxyXG4gICAgY29uc3QgYXV0aGVudGljYXRlZFJvbGUgPSBuZXcgaWFtLlJvbGUoXHJcbiAgICAgIHRoaXMsXHJcbiAgICAgIFwiQ29nbml0b0RlZmF1bHRBdXRoZW50aWNhdGVkUm9sZVwiLFxyXG4gICAgICB7XHJcbiAgICAgICAgYXNzdW1lZEJ5OiBuZXcgaWFtLkZlZGVyYXRlZFByaW5jaXBhbChcclxuICAgICAgICAgIFwiY29nbml0by1pZGVudGl0eS5hbWF6b25hd3MuY29tXCIsXHJcbiAgICAgICAgICB7XHJcbiAgICAgICAgICAgIFN0cmluZ0VxdWFsczoge1xyXG4gICAgICAgICAgICAgIFwiY29nbml0by1pZGVudGl0eS5hbWF6b25hd3MuY29tOmF1ZFwiOiBpZGVudGl0eVBvb2wucmVmLFxyXG4gICAgICAgICAgICB9LFxyXG4gICAgICAgICAgICBcIkZvckFueVZhbHVlOlN0cmluZ0xpa2VcIjoge1xyXG4gICAgICAgICAgICAgIFwiY29nbml0by1pZGVudGl0eS5hbWF6b25hd3MuY29tOmFtclwiOiBcImF1dGhlbnRpY2F0ZWRcIixcclxuICAgICAgICAgICAgfSxcclxuICAgICAgICAgIH0sXHJcbiAgICAgICAgICBcInN0czpBc3N1bWVSb2xlV2l0aFdlYklkZW50aXR5XCJcclxuICAgICAgICApLFxyXG4gICAgICB9XHJcbiAgICApO1xyXG5cclxuICAgIGF1dGhlbnRpY2F0ZWRSb2xlLmFkZFRvUG9saWN5KFxyXG4gICAgICBuZXcgaWFtLlBvbGljeVN0YXRlbWVudCh7XHJcbiAgICAgICAgZWZmZWN0OiBpYW0uRWZmZWN0LkFMTE9XLFxyXG4gICAgICAgIGFjdGlvbnM6IFtcclxuICAgICAgICAgIFwibW9iaWxlYW5hbHl0aWNzOlB1dEV2ZW50c1wiLFxyXG4gICAgICAgICAgXCJjb2duaXRvLXN5bmM6KlwiLFxyXG4gICAgICAgICAgXCJjb2duaXRvLWlkZW50aXR5OipcIixcclxuICAgICAgICBdLFxyXG4gICAgICAgIHJlc291cmNlczogW1wiKlwiXSxcclxuICAgICAgfSlcclxuICAgICk7XHJcblxyXG4gICAgYXV0aGVudGljYXRlZFJvbGUuYWRkVG9Qb2xpY3koXHJcbiAgICAgIG5ldyBpYW0uUG9saWN5U3RhdGVtZW50KHtcclxuICAgICAgICBlZmZlY3Q6IGlhbS5FZmZlY3QuQUxMT1csXHJcbiAgICAgICAgYWN0aW9uczogW1wibGFtYmRhOkludm9rZUZ1bmN0aW9uXCJdLFxyXG4gICAgICAgIHJlc291cmNlczogW1wiKlwiXSxcclxuICAgICAgfSlcclxuICAgICk7XHJcblxyXG4gICAgY29uc3QgZGVmYXVsdFBvbGljeSA9IG5ldyBjb2duaXRvLkNmbklkZW50aXR5UG9vbFJvbGVBdHRhY2htZW50KFxyXG4gICAgICB0aGlzLFxyXG4gICAgICBcIklkZW50aXR5UG9vbFJvbGVNYXBwaW5nXCIsXHJcbiAgICAgIHtcclxuICAgICAgICBpZGVudGl0eVBvb2xJZDogaWRlbnRpdHlQb29sLnJlZixcclxuICAgICAgICByb2xlczoge1xyXG4gICAgICAgICAgLy8gdW5hdXRoZW50aWNhdGVkOiB1bmF1dGhlbnRpY2F0ZWRSb2xlLnJvbGVBcm4sXHJcbiAgICAgICAgICBhdXRoZW50aWNhdGVkOiBhdXRoZW50aWNhdGVkUm9sZS5yb2xlQXJuLFxyXG4gICAgICAgIH0sXHJcbiAgICAgIH1cclxuICAgICk7XHJcbiAgfVxyXG4gIC8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vXHJcbiAgY3JlYXRlQVBJUmVzb3VyY2VzKCkge1xyXG4gICAgY29uc3QgaGVscEFwaVJlc291cmNlID0gdGhpcy5hcGkucm9vdC5hZGRSZXNvdXJjZShcImhlbHBcIik7XHJcbiAgICBoZWxwQXBpUmVzb3VyY2UuYWRkTWV0aG9kKFxyXG4gICAgICBcIk9QVElPTlNcIixcclxuICAgICAgZGVmYXVsdHMubW9ja0ludGVncmF0aW9uLFxyXG4gICAgICBkZWZhdWx0cy5vcHRpb25zXHJcbiAgICApO1xyXG5cclxuICAgIHRoaXMuZ2V0QWRtaW5Qb3N0c0Z1bmN0aW9uKGhlbHBBcGlSZXNvdXJjZSk7IC8vIEdFVFxyXG4gICAgdGhpcy5jcmVhdGVQb3N0c0Z1bmN0aW9uKGhlbHBBcGlSZXNvdXJjZSk7IC8vIFBPU1RcclxuICAgIHRoaXMuZGVsZXRlUG9zdEZ1bmN0aW9uKGhlbHBBcGlSZXNvdXJjZSk7IC8vIERFTEVURVxyXG5cclxuICAgIGNvbnN0IGxhdGVzdEhlbHBBcGlSZXNvdXJjZSA9IHRoaXMuYXBpLnJvb3QuYWRkUmVzb3VyY2UoXCJsYXRlc3QtaGVscFwiKTtcclxuICAgIGxhdGVzdEhlbHBBcGlSZXNvdXJjZS5hZGRNZXRob2QoXHJcbiAgICAgIFwiT1BUSU9OU1wiLFxyXG4gICAgICBkZWZhdWx0cy5tb2NrSW50ZWdyYXRpb24sXHJcbiAgICAgIGRlZmF1bHRzLm9wdGlvbnNcclxuICAgICk7XHJcblxyXG4gICAgdGhpcy5nZXRMYXRlc3RQb3N0c0Z1bmN0aW9uKGxhdGVzdEhlbHBBcGlSZXNvdXJjZSk7IC8vIEdFVFxyXG5cclxuICAgIGNvbnN0IHR5cGVIZWxwQXBpUmVzb3VyY2UgPSB0aGlzLmFwaS5yb290LmFkZFJlc291cmNlKFwidHlwZS1oZWxwXCIpO1xyXG4gICAgdHlwZUhlbHBBcGlSZXNvdXJjZS5hZGRNZXRob2QoXHJcbiAgICAgIFwiT1BUSU9OU1wiLFxyXG4gICAgICBkZWZhdWx0cy5tb2NrSW50ZWdyYXRpb24sXHJcbiAgICAgIGRlZmF1bHRzLm9wdGlvbnNcclxuICAgICk7XHJcblxyXG4gICAgdGhpcy5nZXRUeXBlUG9zdHNGdW5jdGlvbih0eXBlSGVscEFwaVJlc291cmNlKTsgLy8gR0VUXHJcbiAgfVxyXG5cclxuICBnZXRBZG1pblBvc3RzRnVuY3Rpb24oaGVscEFwaVJlc291cmNlOiBhcGlndy5SZXNvdXJjZSkge1xyXG4gICAgY29uc3QgZ2V0VHlwZVBvc3RzID0gbmV3IGxhbWJkYS5GdW5jdGlvbih0aGlzLCBcImdldC1hZG1pbi1wb3N0c1wiLCB7XHJcbiAgICAgIGZ1bmN0aW9uTmFtZTogXCJnZXQtYWRtaW4tcG9zdHNcIixcclxuICAgICAgcnVudGltZTogbGFtYmRhLlJ1bnRpbWUuTk9ERUpTXzEyX1gsXHJcbiAgICAgIGhhbmRsZXI6IFwiaW5kZXguaGFuZGxlclwiLFxyXG4gICAgICBjb2RlOiBsYW1iZGEuQ29kZS5mcm9tQXNzZXQoXHJcbiAgICAgICAgcGF0aC5qb2luKF9fZGlybmFtZSwgXCIuLi9sYW1iZGFzL2dldC1hZG1pbi1wb3N0c1wiKVxyXG4gICAgICApLFxyXG4gICAgICBlbnZpcm9ubWVudDoge1xyXG4gICAgICAgIFBPU1RTX1RBQkxFOiB0aGlzLnBvc3RzVGFibGUudGFibGVOYW1lLFxyXG4gICAgICB9LFxyXG4gICAgfSk7XHJcblxyXG4gICAgdGhpcy5wb3N0c1RhYmxlLmdyYW50UmVhZERhdGEoZ2V0VHlwZVBvc3RzKTtcclxuXHJcbiAgICBoZWxwQXBpUmVzb3VyY2UuYWRkTWV0aG9kKFxyXG4gICAgICBcIkdFVFwiLFxyXG4gICAgICBkZWZhdWx0cy5sYW1iZGFJbnRlZ3JhdGlvbihnZXRUeXBlUG9zdHMsIHt9KSxcclxuICAgICAge1xyXG4gICAgICAgIC4uLmRlZmF1bHRzLm9wdGlvbnMsXHJcbiAgICAgICAgYXV0aG9yaXphdGlvblR5cGU6IGFwaWd3LkF1dGhvcml6YXRpb25UeXBlLkNPR05JVE8sXHJcbiAgICAgICAgYXV0aG9yaXplcjogeyBhdXRob3JpemVySWQ6IHRoaXMuYXV0aG9yaXplci5yZWYgfSxcclxuICAgICAgfVxyXG4gICAgKTtcclxuICB9XHJcblxyXG4gIGNyZWF0ZVBvc3RzRnVuY3Rpb24oaGVscEFwaVJlc291cmNlOiBhcGlndy5SZXNvdXJjZSkge1xyXG4gICAgY29uc3QgY3JlYXRlUG9zdCA9IG5ldyBsYW1iZGEuRnVuY3Rpb24odGhpcywgXCJjcmVhdGUtcG9zdFwiLCB7XHJcbiAgICAgIGZ1bmN0aW9uTmFtZTogXCJjcmVhdGUtcG9zdFwiLFxyXG4gICAgICBydW50aW1lOiBsYW1iZGEuUnVudGltZS5OT0RFSlNfMTJfWCxcclxuICAgICAgaGFuZGxlcjogXCJpbmRleC5oYW5kbGVyXCIsXHJcbiAgICAgIGNvZGU6IGxhbWJkYS5Db2RlLmZyb21Bc3NldChcclxuICAgICAgICBwYXRoLmpvaW4oX19kaXJuYW1lLCBcIi4uL2xhbWJkYXMvY3JlYXRlLXBvc3RcIilcclxuICAgICAgKSxcclxuICAgICAgZW52aXJvbm1lbnQ6IHtcclxuICAgICAgICBQT1NUU19UQUJMRTogdGhpcy5wb3N0c1RhYmxlLnRhYmxlTmFtZSxcclxuICAgICAgfSxcclxuICAgIH0pO1xyXG5cclxuICAgIHRoaXMucG9zdHNUYWJsZS5ncmFudFJlYWRXcml0ZURhdGEoY3JlYXRlUG9zdCk7XHJcblxyXG4gICAgaGVscEFwaVJlc291cmNlLmFkZE1ldGhvZChcclxuICAgICAgXCJQT1NUXCIsXHJcbiAgICAgIGRlZmF1bHRzLmxhbWJkYUludGVncmF0aW9uKGNyZWF0ZVBvc3QsIHtcclxuICAgICAgICBcImFwcGxpY2F0aW9uL2pzb25cIjpcclxuICAgICAgICAgICd7XCJyZXF1ZXN0Qm9keVwiOiAkaW5wdXQuYm9keSwgXCJvcmdhbml6YXRpb25faWRcIjogXCIkY29udGV4dC5hdXRob3JpemVyLmNsYWltcy5zdWJcIn0nLFxyXG4gICAgICB9KSxcclxuICAgICAge1xyXG4gICAgICAgIC4uLmRlZmF1bHRzLm9wdGlvbnMsXHJcbiAgICAgICAgYXV0aG9yaXphdGlvblR5cGU6IGFwaWd3LkF1dGhvcml6YXRpb25UeXBlLkNPR05JVE8sXHJcbiAgICAgICAgYXV0aG9yaXplcjogeyBhdXRob3JpemVySWQ6IHRoaXMuYXV0aG9yaXplci5yZWYgfSxcclxuICAgICAgfVxyXG4gICAgKTtcclxuICB9XHJcblxyXG4gIGRlbGV0ZVBvc3RGdW5jdGlvbihoZWxwQXBpUmVzb3VyY2U6IGFwaWd3LlJlc291cmNlKSB7XHJcbiAgICBjb25zdCBnZXRUeXBlUG9zdHMgPSBuZXcgbGFtYmRhLkZ1bmN0aW9uKHRoaXMsIFwiZGVsZXRlLXBvc3RcIiwge1xyXG4gICAgICBmdW5jdGlvbk5hbWU6IFwiZGVsZXRlLXBvc3RcIixcclxuICAgICAgcnVudGltZTogbGFtYmRhLlJ1bnRpbWUuTk9ERUpTXzEyX1gsXHJcbiAgICAgIGhhbmRsZXI6IFwiaW5kZXguaGFuZGxlclwiLFxyXG4gICAgICBjb2RlOiBsYW1iZGEuQ29kZS5mcm9tQXNzZXQoXHJcbiAgICAgICAgcGF0aC5qb2luKF9fZGlybmFtZSwgXCIuLi9sYW1iZGFzL2RlbGV0ZS1wb3N0XCIpXHJcbiAgICAgICksXHJcbiAgICAgIGVudmlyb25tZW50OiB7XHJcbiAgICAgICAgUE9TVFNfVEFCTEU6IHRoaXMucG9zdHNUYWJsZS50YWJsZU5hbWUsXHJcbiAgICAgIH0sXHJcbiAgICB9KTtcclxuXHJcbiAgICB0aGlzLnBvc3RzVGFibGUuZ3JhbnRSZWFkRGF0YShnZXRUeXBlUG9zdHMpO1xyXG5cclxuICAgIGhlbHBBcGlSZXNvdXJjZS5hZGRNZXRob2QoXHJcbiAgICAgIFwiREVMRVRFXCIsXHJcbiAgICAgIGRlZmF1bHRzLmxhbWJkYUludGVncmF0aW9uKGdldFR5cGVQb3N0cywge30pLFxyXG4gICAgICB7XHJcbiAgICAgICAgLi4uZGVmYXVsdHMub3B0aW9ucyxcclxuICAgICAgICBhdXRob3JpemF0aW9uVHlwZTogYXBpZ3cuQXV0aG9yaXphdGlvblR5cGUuQ09HTklUTyxcclxuICAgICAgICBhdXRob3JpemVyOiB7IGF1dGhvcml6ZXJJZDogdGhpcy5hdXRob3JpemVyLnJlZiB9LFxyXG4gICAgICB9XHJcbiAgICApO1xyXG4gIH1cclxuXHJcbiAgZ2V0TGF0ZXN0UG9zdHNGdW5jdGlvbihoZWxwQXBpUmVzb3VyY2U6IGFwaWd3LlJlc291cmNlKSB7XHJcbiAgICBjb25zdCBnZXRUeXBlUG9zdHMgPSBuZXcgbGFtYmRhLkZ1bmN0aW9uKHRoaXMsIFwiZ2V0LWxhdGVzdC1wb3N0c1wiLCB7XHJcbiAgICAgIGZ1bmN0aW9uTmFtZTogXCJnZXQtbGF0ZXN0LXBvc3RzXCIsXHJcbiAgICAgIHJ1bnRpbWU6IGxhbWJkYS5SdW50aW1lLk5PREVKU18xMl9YLFxyXG4gICAgICBoYW5kbGVyOiBcImluZGV4LmhhbmRsZXJcIixcclxuICAgICAgY29kZTogbGFtYmRhLkNvZGUuZnJvbUFzc2V0KFxyXG4gICAgICAgIHBhdGguam9pbihfX2Rpcm5hbWUsIFwiLi4vbGFtYmRhcy9nZXQtbGF0ZXN0LXBvc3RzXCIpXHJcbiAgICAgICksXHJcbiAgICAgIGVudmlyb25tZW50OiB7XHJcbiAgICAgICAgUE9TVFNfVEFCTEU6IHRoaXMucG9zdHNUYWJsZS50YWJsZU5hbWUsXHJcbiAgICAgIH0sXHJcbiAgICB9KTtcclxuXHJcbiAgICB0aGlzLnBvc3RzVGFibGUuZ3JhbnRSZWFkRGF0YShnZXRUeXBlUG9zdHMpO1xyXG5cclxuICAgIGhlbHBBcGlSZXNvdXJjZS5hZGRNZXRob2QoXHJcbiAgICAgIFwiR0VUXCIsXHJcbiAgICAgIGRlZmF1bHRzLmxhbWJkYUludGVncmF0aW9uKGdldFR5cGVQb3N0cywge30pLFxyXG4gICAgICBkZWZhdWx0cy5vcHRpb25zXHJcbiAgICApO1xyXG4gIH1cclxuXHJcbiAgZ2V0VHlwZVBvc3RzRnVuY3Rpb24oaGVscEFwaVJlc291cmNlOiBhcGlndy5SZXNvdXJjZSkge1xyXG4gICAgY29uc3QgZ2V0VHlwZVBvc3RzID0gbmV3IGxhbWJkYS5GdW5jdGlvbih0aGlzLCBcImdldC10eXBlLXBvc3RzXCIsIHtcclxuICAgICAgZnVuY3Rpb25OYW1lOiBcImdldC10eXBlLXBvc3RzXCIsXHJcbiAgICAgIHJ1bnRpbWU6IGxhbWJkYS5SdW50aW1lLk5PREVKU18xMl9YLFxyXG4gICAgICBoYW5kbGVyOiBcImluZGV4LmhhbmRsZXJcIixcclxuICAgICAgY29kZTogbGFtYmRhLkNvZGUuZnJvbUFzc2V0KFxyXG4gICAgICAgIHBhdGguam9pbihfX2Rpcm5hbWUsIFwiLi4vbGFtYmRhcy9nZXQtdHlwZS1wb3N0c1wiKVxyXG4gICAgICApLFxyXG4gICAgICBlbnZpcm9ubWVudDoge1xyXG4gICAgICAgIFBPU1RTX1RBQkxFOiB0aGlzLnBvc3RzVGFibGUudGFibGVOYW1lLFxyXG4gICAgICB9LFxyXG4gICAgfSk7XHJcblxyXG4gICAgdGhpcy5wb3N0c1RhYmxlLmdyYW50UmVhZERhdGEoZ2V0VHlwZVBvc3RzKTtcclxuXHJcbiAgICBoZWxwQXBpUmVzb3VyY2UuYWRkTWV0aG9kKFxyXG4gICAgICBcIkdFVFwiLFxyXG4gICAgICBkZWZhdWx0cy5sYW1iZGFJbnRlZ3JhdGlvbihnZXRUeXBlUG9zdHMsIHt9KSxcclxuICAgICAgZGVmYXVsdHMub3B0aW9uc1xyXG4gICAgKTtcclxuICB9XHJcbn1cclxuIl19