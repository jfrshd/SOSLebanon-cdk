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
        this.createTypestable();
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
    createTypestable() {
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
    createCognito() {
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
                tempPasswordValidity: core_1.Duration.days(7),
            },
            // emailSettings: {
            //   from: "helpdesk@soslebanon.com",
            //   replyTo: "helpdesk@soslebanon.com",
            // },
            signInCaseSensitive: true,
            accountRecovery: cognito.AccountRecovery.EMAIL_ONLY,
        });
        const cfnUserPool = this.userPool.node.defaultChild;
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
            userPool: this.userPool,
        });
        const identityPool = new cognito.CfnIdentityPool(this, "soslebanon-identity-pool", {
            identityPoolName: "soslebanon-identity-pool",
            allowUnauthenticatedIdentities: false,
            cognitoIdentityProviders: [
                {
                    clientId: userPoolClient.userPoolClientId,
                    providerName: this.userPool.userPoolProviderName,
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
    createAPIResources() {
        const adminApiResource = this.api.root.addResource("admin");
        adminApiResource.addMethod("OPTIONS", defaults.mockIntegration, defaults.options);
        this.getAdminPostsFunction(adminApiResource); // GET
        this.createPostsFunction(adminApiResource); // POST
        this.deletePostFunction(adminApiResource); // DELETE
        ///////////////////////////////////////////////////////////////////////////////////
        const postApiResource = this.api.root.addResource("post");
        postApiResource.addMethod("OPTIONS", defaults.mockIntegration, defaults.options);
        this.getPostFunction(postApiResource); // GET
        ///////////////////////////////////////////////////////////////////////////////////
        const typeApiResource = this.api.root.addResource("type");
        typeApiResource.addMethod("OPTIONS", defaults.mockIntegration, defaults.options);
        this.getTypesFunction(typeApiResource); // GET
        ///////////////////////////////////////////////////////////////////////////////////
        const locationApiResource = this.api.root.addResource("location");
        locationApiResource.addMethod("OPTIONS", defaults.mockIntegration, defaults.options);
        this.getLocationsFunction(locationApiResource); // GET
        ///////////////////////////////////////////////////////////////////////////////////
        const latestPostsApiResource = this.api.root.addResource("latest-post");
        latestPostsApiResource.addMethod("OPTIONS", defaults.mockIntegration, defaults.options);
        this.getLatestPostsFunction(latestPostsApiResource); // GET
        ///////////////////////////////////////////////////////////////////////////////////
        const typePostApiResource = this.api.root.addResource("type-post");
        typePostApiResource.addMethod("OPTIONS", defaults.mockIntegration, defaults.options);
        this.getTypePostsFunction(typePostApiResource); // GET
    }
    // lambda functions
    getAdminPostsFunction(adminApiResource) {
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
        adminApiResource.addMethod("GET", defaults.lambdaIntegration(getTypePosts, {
            "application/json": '{\n"sub": "$context.authorizer.claims.sub"\n}',
        }), {
            ...defaults.options,
            authorizationType: apigw.AuthorizationType.COGNITO,
            authorizer: { authorizerId: this.authorizer.ref },
        });
    }
    createPostsFunction(adminApiResource) {
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
        adminApiResource.addMethod("POST", defaults.lambdaIntegration(createPost, {
            "application/json": '{\n"requestBody": $input.body,\n"sub": "$context.authorizer.claims.sub"\n}',
        }), {
            ...defaults.options,
            authorizationType: apigw.AuthorizationType.COGNITO,
            authorizer: { authorizerId: this.authorizer.ref },
        });
    }
    deletePostFunction(adminApiResource) {
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
        adminApiResource.addMethod("DELETE", defaults.lambdaIntegration(getTypePosts, {
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
    getLatestPostsFunction(latestPostsApiResource) {
        const getLatestPosts = new lambda.Function(this, "get-latest-posts", {
            functionName: "get-latest-posts",
            runtime: lambda.Runtime.NODEJS_12_X,
            handler: "index.handler",
            code: lambda.Code.fromAsset(path.join(__dirname, "../lambdas/get-latest-posts")),
            environment: {
                POSTS_TABLE: this.postsTable.tableName,
                identityPoolId: this.userPool.userPoolId,
            },
        });
        this.postsTable.grantReadData(getLatestPosts);
        getLatestPosts.addToRolePolicy(new iam.PolicyStatement({
            effect: iam.Effect.ALLOW,
            actions: ["lambda:InvokeFunction", "cognito-idp:*"],
            resources: ["*"],
        }));
        latestPostsApiResource.addMethod("GET", defaults.lambdaIntegration(getLatestPosts, {
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
        }), defaults.options);
    }
    getPostFunction(postApiResource) {
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
        postApiResource.addMethod("GET", defaults.lambdaIntegration(getPost, {
            "application/json": `
          #set($hasId = $input.params('id'))
          {
            #if($hasId != "") "id" : "$input.params('id')"#end
          }
        `,
        }), defaults.options);
    }
    getTypesFunction(typeApiResource) {
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
        typeApiResource.addMethod("GET", defaults.lambdaIntegration(getTypes, {}), defaults.options);
    }
    getLocationsFunction(locationApiResource) {
        const getLocations = new lambda.Function(this, "get-locations", {
            functionName: "get-locations",
            runtime: lambda.Runtime.NODEJS_12_X,
            handler: "index.handler",
            code: lambda.Code.fromAsset(path.join(__dirname, "../lambdas/get-locations")),
            environment: {
                SETTINGS_TABLE: this.settingsTable.tableName,
            },
        });
        this.settingsTable.grantReadData(getLocations);
        locationApiResource.addMethod("GET", defaults.lambdaIntegration(getLocations, {}), defaults.options);
    }
    getTypePostsFunction(postApiResource) {
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
        postApiResource.addMethod("GET", defaults.lambdaIntegration(getTypePosts, {
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
        }), defaults.options);
    }
}
exports.SoslebanonStack = SoslebanonStack;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic29zbGViYW5vbi1zdGFjay5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbInNvc2xlYmFub24tc3RhY2sudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7O0FBQUEscUNBQXFDO0FBQ3JDLGtEQUFrRDtBQUNsRCw4Q0FBOEM7QUFFOUMsaURBQWlEO0FBQ2pELGdEQUFnRDtBQUNoRCx3Q0FBd0M7QUFDeEMsd0NBQXdDO0FBQ3hDLDZCQUE2QjtBQUM3QiwrQ0FBK0M7QUFDL0Msd0NBQTZEO0FBSTdELE1BQWEsZUFBZ0IsU0FBUSxHQUFHLENBQUMsS0FBSztJQU81QyxZQUFZLEtBQW9CLEVBQUUsRUFBVSxFQUFFLEtBQXNCO1FBQ2xFLEtBQUssQ0FBQyxLQUFLLEVBQUUsRUFBRSxFQUFFLEtBQUssQ0FBQyxDQUFDO1FBQ3hCLElBQUksQ0FBQyxHQUFHLEdBQUcsSUFBSSxLQUFLLENBQUMsT0FBTyxDQUFDLElBQUksRUFBRSxlQUFlLENBQUMsQ0FBQztRQUNwRCxJQUFJLENBQUMsYUFBYSxFQUFFLENBQUM7UUFDckIsSUFBSSxDQUFDLGdCQUFnQixFQUFFLENBQUM7UUFDeEIsSUFBSSxDQUFDLGdCQUFnQixFQUFFLENBQUM7UUFDeEIsSUFBSSxDQUFDLGtCQUFrQixFQUFFLENBQUM7SUFDNUIsQ0FBQztJQUVELGdCQUFnQjtRQUNkLElBQUksQ0FBQyxVQUFVLEdBQUcsSUFBSSxRQUFRLENBQUMsS0FBSyxDQUFDLElBQUksRUFBRSxhQUFhLEVBQUU7WUFDeEQsU0FBUyxFQUFFLGFBQWE7WUFDeEIsWUFBWSxFQUFFLEVBQUUsSUFBSSxFQUFFLElBQUksRUFBRSxJQUFJLEVBQUUsUUFBUSxDQUFDLGFBQWEsQ0FBQyxNQUFNLEVBQUU7WUFDakUsT0FBTyxFQUFFO2dCQUNQLElBQUksRUFBRSxJQUFJO2dCQUNWLElBQUksRUFBRSxRQUFRLENBQUMsYUFBYSxDQUFDLE1BQU07YUFDcEM7WUFDRCxXQUFXLEVBQUUsUUFBUSxDQUFDLFdBQVcsQ0FBQyxlQUFlO1NB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RUFBRSxJQUFJLENBQUMsVUFBVSxDQUFDLFNBQVM7YUFDdkM7U0FDRixDQUFDLENBQUM7UUFFSCxJQUFJLENBQUMsVUFBVSxDQUFDLGFBQWEsQ0FBQyxZQUFZLENBQUMsQ0FBQztRQUU1QyxlQUFlLENBQUMsU0FBUyxDQUN2QixLQUFLLEVBQ0wsUUFBUSxDQUFDLGlCQUFpQixDQUFDLFlBQVksRUFBRTtZQUN2QyxrQkFBa0IsRUFBRTs7Ozs7Ozs7O09BU3JCO1NBQ0EsQ0FBQyxFQUNGLFFBQVEsQ0FBQyxPQUFPLENBQ2pCLENBQUM7SUFDSixDQUFDO0NBQ0Y7QUFsZ0JELDBDQWtnQkMiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgKiBhcyBjZGsgZnJvbSBcIkBhd3MtY2RrL2NvcmVcIjtcclxuaW1wb3J0ICogYXMgZHluYW1vZGIgZnJvbSBcIkBhd3MtY2RrL2F3cy1keW5hbW9kYlwiO1xyXG5pbXBvcnQgKiBhcyBsYW1iZGEgZnJvbSBcIkBhd3MtY2RrL2F3cy1sYW1iZGFcIjtcclxuaW1wb3J0ICogYXMgczMgZnJvbSBcIkBhd3MtY2RrL2F3cy1zM1wiO1xyXG5pbXBvcnQgKiBhcyBhcGlndyBmcm9tIFwiQGF3cy1jZGsvYXdzLWFwaWdhdGV3YXlcIjtcclxuaW1wb3J0ICogYXMgY29nbml0byBmcm9tIFwiQGF3cy1jZGsvYXdzLWNvZ25pdG9cIjtcclxuaW1wb3J0ICogYXMgaWFtIGZyb20gXCJAYXdzLWNkay9hd3MtaWFtXCI7XHJcbmltcG9ydCAqIGFzIHNlcyBmcm9tIFwiQGF3cy1jZGsvYXdzLXNlc1wiO1xyXG5pbXBvcnQgKiBhcyBwYXRoIGZyb20gXCJwYXRoXCI7XHJcbmltcG9ydCAqIGFzIGRlZmF1bHRzIGZyb20gXCIuLi9leHRyYXMvZGVmYXVsdHNcIjtcclxuaW1wb3J0IHsgUmVtb3ZhbFBvbGljeSwgVGFnLCBEdXJhdGlvbiB9IGZyb20gXCJAYXdzLWNkay9jb3JlXCI7XHJcbmltcG9ydCB7IE1mYSwgVXNlclBvb2wgfSBmcm9tIFwiQGF3cy1jZGsvYXdzLWNvZ25pdG9cIjtcclxuaW1wb3J0IHsgSUZ1bmN0aW9uIH0gZnJvbSBcIkBhd3MtY2RrL2F3cy1sYW1iZGFcIjtcclxuXHJcbmV4cG9ydCBjbGFzcyBTb3NsZWJhbm9uU3RhY2sgZXh0ZW5kcyBjZGsuU3RhY2sge1xyXG4gIGFwaTogYXBpZ3cuUmVzdEFwaTtcclxuICBwb3N0c1RhYmxlOiBkeW5hbW9kYi5UYWJsZTtcclxuICBzZXR0aW5nc1RhYmxlOiBkeW5hbW9kYi5UYWJsZTtcclxuICBhdXRob3JpemVyOiBhcGlndy5DZm5BdXRob3JpemVyO1xyXG4gIHVzZXJQb29sOiBjb2duaXRvLlVzZXJQb29sO1xyXG5cclxuICBjb25zdHJ1Y3RvcihzY29wZTogY2RrLkNvbnN0cnVjdCwgaWQ6IHN0cmluZywgcHJvcHM/OiBjZGsuU3RhY2tQcm9wcykge1xyXG4gICAgc3VwZXIoc2NvcGUsIGlkLCBwcm9wcyk7XHJcbiAgICB0aGlzLmFwaSA9IG5ldyBhcGlndy5SZXN0QXBpKHRoaXMsIFwiU09TTGViYW5vbkFQSVwiKTtcclxuICAgIHRoaXMuY3JlYXRlQ29nbml0bygpO1xyXG4gICAgdGhpcy5jcmVhdGVQb3N0c1RhYmxlKCk7XHJcbiAgICB0aGlzLmNyZWF0ZVR5cGVzdGFibGUoKTtcclxuICAgIHRoaXMuY3JlYXRlQVBJUmVzb3VyY2VzKCk7XHJcbiAgfVxyXG5cclxuICBjcmVhdGVQb3N0c1RhYmxlKCk6IHZvaWQge1xyXG4gICAgdGhpcy5wb3N0c1RhYmxlID0gbmV3IGR5bmFtb2RiLlRhYmxlKHRoaXMsIFwicG9zdHMtdGFibGVcIiwge1xyXG4gICAgICB0YWJsZU5hbWU6IFwicG9zdHMtdGFibGVcIixcclxuICAgICAgcGFydGl0aW9uS2V5OiB7IG5hbWU6IFwicGtcIiwgdHlwZTogZHluYW1vZGIuQXR0cmlidXRlVHlwZS5TVFJJTkcgfSxcclxuICAgICAgc29ydEtleToge1xyXG4gICAgICAgIG5hbWU6IFwiaWRcIixcclxuICAgICAgICB0eXBlOiBkeW5hbW9kYi5BdHRyaWJ1dGVUeXBlLlNUUklORyxcclxuICAgICAgfSxcclxuICAgICAgYmlsbGluZ01vZGU6IGR5bmFtb2RiLkJpbGxpbmdNb2RlLlBBWV9QRVJfUkVRVUVTVCxcclxuICAgIH0pO1xyXG4gICAgdGhpcy5wb3N0c1RhYmxlLmFkZExvY2FsU2Vjb25kYXJ5SW5kZXgoe1xyXG4gICAgICBpbmRleE5hbWU6IFwiY3JlYXRpb25EYXRlXCIsXHJcbiAgICAgIHNvcnRLZXk6IHtcclxuICAgICAgICBuYW1lOiBcImNyZWF0aW9uRGF0ZVwiLFxyXG4gICAgICAgIHR5cGU6IGR5bmFtb2RiLkF0dHJpYnV0ZVR5cGUuTlVNQkVSLFxyXG4gICAgICB9LFxyXG4gICAgfSk7XHJcbiAgICB0aGlzLnBvc3RzVGFibGUuYWRkTG9jYWxTZWNvbmRhcnlJbmRleCh7XHJcbiAgICAgIGluZGV4TmFtZTogXCJ0eXBlSWRcIixcclxuICAgICAgc29ydEtleToge1xyXG4gICAgICAgIG5hbWU6IFwidHlwZUlkXCIsXHJcbiAgICAgICAgdHlwZTogZHluYW1vZGIuQXR0cmlidXRlVHlwZS5TVFJJTkcsXHJcbiAgICAgIH0sXHJcbiAgICB9KTtcclxuICB9XHJcblxyXG4gIGNyZWF0ZVR5cGVzdGFibGUoKTogdm9pZCB7XHJcbiAgICB0aGlzLnNldHRpbmdzVGFibGUgPSBuZXcgZHluYW1vZGIuVGFibGUodGhpcywgXCJzZXR0aW5nLXRhYmxlXCIsIHtcclxuICAgICAgdGFibGVOYW1lOiBcInNldHRpbmctdGFibGVcIixcclxuICAgICAgcGFydGl0aW9uS2V5OiB7IG5hbWU6IFwicGtcIiwgdHlwZTogZHluYW1vZGIuQXR0cmlidXRlVHlwZS5TVFJJTkcgfSxcclxuICAgICAgc29ydEtleToge1xyXG4gICAgICAgIG5hbWU6IFwiaWRcIixcclxuICAgICAgICB0eXBlOiBkeW5hbW9kYi5BdHRyaWJ1dGVUeXBlLlNUUklORyxcclxuICAgICAgfSxcclxuICAgICAgYmlsbGluZ01vZGU6IGR5bmFtb2RiLkJpbGxpbmdNb2RlLlBBWV9QRVJfUkVRVUVTVCxcclxuICAgIH0pO1xyXG4gIH1cclxuXHJcbiAgY3JlYXRlQ29nbml0bygpOiB2b2lkIHtcclxuICAgIGNvbnN0IGNvbmZTZXQgPSBuZXcgc2VzLkNmbkNvbmZpZ3VyYXRpb25TZXQodGhpcywgXCJzb3NsZWJhbm9uLWNvbmYtc2V0XCIsIHtcclxuICAgICAgbmFtZTogXCJzb3NsZWJhbm9uLXNlcy1jb25mLXNldFwiLFxyXG4gICAgfSk7XHJcblxyXG4gICAgdGhpcy51c2VyUG9vbCA9IG5ldyBjb2duaXRvLlVzZXJQb29sKHRoaXMsIFwic29zbGViYW5vbi11c2VyLXBvb2xcIiwge1xyXG4gICAgICB1c2VyUG9vbE5hbWU6IFwic29zbGViYW5vbi11c2VyLXBvb2xcIixcclxuICAgICAgc2VsZlNpZ25VcEVuYWJsZWQ6IHRydWUsXHJcbiAgICAgIHNpZ25JbkFsaWFzZXM6IHtcclxuICAgICAgICB1c2VybmFtZTogZmFsc2UsXHJcbiAgICAgICAgZW1haWw6IHRydWUsXHJcbiAgICAgIH0sXHJcbiAgICAgIHN0YW5kYXJkQXR0cmlidXRlczoge1xyXG4gICAgICAgIGdpdmVuTmFtZTogeyBtdXRhYmxlOiB0cnVlLCByZXF1aXJlZDogdHJ1ZSB9LFxyXG4gICAgICAgIGZhbWlseU5hbWU6IHsgbXV0YWJsZTogdHJ1ZSwgcmVxdWlyZWQ6IHRydWUgfSxcclxuICAgICAgICBlbWFpbDogeyBtdXRhYmxlOiB0cnVlLCByZXF1aXJlZDogdHJ1ZSB9LFxyXG4gICAgICAgIHBob25lTnVtYmVyOiB7IG11dGFibGU6IHRydWUsIHJlcXVpcmVkOiB0cnVlIH0sXHJcbiAgICAgICAgYWRkcmVzczogeyBtdXRhYmxlOiB0cnVlLCByZXF1aXJlZDogdHJ1ZSB9LFxyXG4gICAgICB9LFxyXG4gICAgICBjdXN0b21BdHRyaWJ1dGVzOiB7XHJcbiAgICAgICAgdHlwZTogbmV3IGNvZ25pdG8uU3RyaW5nQXR0cmlidXRlKHsgbXV0YWJsZTogdHJ1ZSB9KSxcclxuICAgICAgfSxcclxuICAgICAgYXV0b1ZlcmlmeToge1xyXG4gICAgICAgIGVtYWlsOiB0cnVlLFxyXG4gICAgICAgIHBob25lOiB0cnVlLFxyXG4gICAgICB9LFxyXG4gICAgICBwYXNzd29yZFBvbGljeToge1xyXG4gICAgICAgIG1pbkxlbmd0aDogOCxcclxuICAgICAgICByZXF1aXJlTG93ZXJjYXNlOiBmYWxzZSxcclxuICAgICAgICByZXF1aXJlRGlnaXRzOiBmYWxzZSxcclxuICAgICAgICByZXF1aXJlU3ltYm9sczogZmFsc2UsXHJcbiAgICAgICAgcmVxdWlyZVVwcGVyY2FzZTogZmFsc2UsXHJcbiAgICAgICAgdGVtcFBhc3N3b3JkVmFsaWRpdHk6IER1cmF0aW9uLmRheXMoNyksXHJcbiAgICAgIH0sXHJcbiAgICAgIC8vIGVtYWlsU2V0dGluZ3M6IHtcclxuICAgICAgLy8gICBmcm9tOiBcImhlbHBkZXNrQHNvc2xlYmFub24uY29tXCIsXHJcbiAgICAgIC8vICAgcmVwbHlUbzogXCJoZWxwZGVza0Bzb3NsZWJhbm9uLmNvbVwiLFxyXG4gICAgICAvLyB9LFxyXG4gICAgICBzaWduSW5DYXNlU2Vuc2l0aXZlOiB0cnVlLFxyXG4gICAgICBhY2NvdW50UmVjb3Zlcnk6IGNvZ25pdG8uQWNjb3VudFJlY292ZXJ5LkVNQUlMX09OTFksXHJcbiAgICB9KTtcclxuXHJcbiAgICBjb25zdCBjZm5Vc2VyUG9vbCA9IHRoaXMudXNlclBvb2wubm9kZS5kZWZhdWx0Q2hpbGQgYXMgY29nbml0by5DZm5Vc2VyUG9vbDtcclxuICAgIC8vIGNmblVzZXJQb29sLmVtYWlsQ29uZmlndXJhdGlvbiA9IHtcclxuICAgIC8vICAgY29uZmlndXJhdGlvblNldDogY29uZlNldC5yZWYsXHJcbiAgICAvLyAgIGVtYWlsU2VuZGluZ0FjY291bnQ6IFwiREVWRUxPUEVSXCIsXHJcbiAgICAvLyAgIGZyb206IFwiaGVscGRlc2tAc29zbGViYW5vbi5jb21cIixcclxuICAgIC8vICAgcmVwbHlUb0VtYWlsQWRkcmVzczogXCJoZWxwZGVza0Bzb3NsZWJhbm9uLmNvbVwiLFxyXG4gICAgLy8gICBzb3VyY2VBcm46XHJcbiAgICAvLyAgICAgXCJhcm46YXdzOnNlczpldS13ZXN0LTE6MjE4NTYxODYxNTgzOmlkZW50aXR5L2hlbHBkZXNrQHNvc2xlYmFub24uY29tXCIsXHJcbiAgICAvLyB9O1xyXG5cclxuICAgIHRoaXMuYXV0aG9yaXplciA9IG5ldyBhcGlndy5DZm5BdXRob3JpemVyKHRoaXMsIFwiQVBJR2F0ZXdheUF1dGhvcml6ZXJcIiwge1xyXG4gICAgICBuYW1lOiBcImNvZ25pdG8tYXV0aG9yaXplclwiLFxyXG4gICAgICBpZGVudGl0eVNvdXJjZTogXCJtZXRob2QucmVxdWVzdC5oZWFkZXIuQXV0aG9yaXphdGlvblwiLFxyXG4gICAgICBwcm92aWRlckFybnM6IFtjZm5Vc2VyUG9vbC5hdHRyQXJuXSxcclxuICAgICAgcmVzdEFwaUlkOiB0aGlzLmFwaS5yZXN0QXBpSWQsXHJcbiAgICAgIHR5cGU6IGFwaWd3LkF1dGhvcml6YXRpb25UeXBlLkNPR05JVE8sXHJcbiAgICB9KTtcclxuXHJcbiAgICBjb25zdCB1c2VyUG9vbENsaWVudCA9IG5ldyBjb2duaXRvLlVzZXJQb29sQ2xpZW50KFxyXG4gICAgICB0aGlzLFxyXG4gICAgICBcInNvc2xlYmFub24tY2xpZW50XCIsXHJcbiAgICAgIHtcclxuICAgICAgICB1c2VyUG9vbENsaWVudE5hbWU6IFwic29zbGViYW5vbi1jbGllbnRcIixcclxuICAgICAgICBnZW5lcmF0ZVNlY3JldDogZmFsc2UsXHJcbiAgICAgICAgdXNlclBvb2w6IHRoaXMudXNlclBvb2wsXHJcbiAgICAgIH1cclxuICAgICk7XHJcbiAgICBjb25zdCBpZGVudGl0eVBvb2wgPSBuZXcgY29nbml0by5DZm5JZGVudGl0eVBvb2woXHJcbiAgICAgIHRoaXMsXHJcbiAgICAgIFwic29zbGViYW5vbi1pZGVudGl0eS1wb29sXCIsXHJcbiAgICAgIHtcclxuICAgICAgICBpZGVudGl0eVBvb2xOYW1lOiBcInNvc2xlYmFub24taWRlbnRpdHktcG9vbFwiLFxyXG4gICAgICAgIGFsbG93VW5hdXRoZW50aWNhdGVkSWRlbnRpdGllczogZmFsc2UsXHJcbiAgICAgICAgY29nbml0b0lkZW50aXR5UHJvdmlkZXJzOiBbXHJcbiAgICAgICAgICB7XHJcbiAgICAgICAgICAgIGNsaWVudElkOiB1c2VyUG9vbENsaWVudC51c2VyUG9vbENsaWVudElkLFxyXG4gICAgICAgICAgICBwcm92aWRlck5hbWU6IHRoaXMudXNlclBvb2wudXNlclBvb2xQcm92aWRlck5hbWUsXHJcbiAgICAgICAgICB9LFxyXG4gICAgICAgIF0sXHJcbiAgICAgIH1cclxuICAgICk7XHJcbiAgICAvLyBjb25zdCB1bmF1dGhlbnRpY2F0ZWRSb2xlID0gbmV3IGlhbS5Sb2xlKFxyXG4gICAgLy8gICB0aGlzLFxyXG4gICAgLy8gICBcIkNvZ25pdG9EZWZhdWx0VW5hdXRoZW50aWNhdGVkUm9sZVwiLFxyXG4gICAgLy8gICB7XHJcbiAgICAvLyAgICAgYXNzdW1lZEJ5OiBuZXcgaWFtLkZlZGVyYXRlZFByaW5jaXBhbChcclxuICAgIC8vICAgICAgIFwiY29nbml0by1pZGVudGl0eS5hbWF6b25hd3MuY29tXCIsXHJcbiAgICAvLyAgICAgICB7XHJcbiAgICAvLyAgICAgICAgIFN0cmluZ0VxdWFsczoge1xyXG4gICAgLy8gICAgICAgICAgIFwiY29nbml0by1pZGVudGl0eS5hbWF6b25hd3MuY29tOmF1ZFwiOiBpZGVudGl0eVBvb2wucmVmLFxyXG4gICAgLy8gICAgICAgICB9LFxyXG4gICAgLy8gICAgICAgICBcIkZvckFueVZhbHVlOlN0cmluZ0xpa2VcIjoge1xyXG4gICAgLy8gICAgICAgICAgIFwiY29nbml0by1pZGVudGl0eS5hbWF6b25hd3MuY29tOmFtclwiOiBcInVuYXV0aGVudGljYXRlZFwiLFxyXG4gICAgLy8gICAgICAgICB9LFxyXG4gICAgLy8gICAgICAgfSxcclxuICAgIC8vICAgICAgIFwic3RzOkFzc3VtZVJvbGVXaXRoV2ViSWRlbnRpdHlcIlxyXG4gICAgLy8gICAgICksXHJcbiAgICAvLyAgIH1cclxuICAgIC8vICk7XHJcbiAgICAvLyB1bmF1dGhlbnRpY2F0ZWRSb2xlLmFkZFRvUG9saWN5KFxyXG4gICAgLy8gICBuZXcgUG9saWN5U3RhdGVtZW50KHtcclxuICAgIC8vICAgICBlZmZlY3Q6IEVmZmVjdC5BTExPVyxcclxuICAgIC8vICAgICBhY3Rpb25zOiBbXCJtb2JpbGVhbmFseXRpY3M6UHV0RXZlbnRzXCIsIFwiY29nbml0by1zeW5jOipcIl0sXHJcbiAgICAvLyAgICAgcmVzb3VyY2VzOiBbXCIqXCJdLFxyXG4gICAgLy8gICB9KVxyXG4gICAgLy8gKTtcclxuXHJcbiAgICBjb25zdCBhdXRoZW50aWNhdGVkUm9sZSA9IG5ldyBpYW0uUm9sZShcclxuICAgICAgdGhpcyxcclxuICAgICAgXCJDb2duaXRvRGVmYXVsdEF1dGhlbnRpY2F0ZWRSb2xlXCIsXHJcbiAgICAgIHtcclxuICAgICAgICBhc3N1bWVkQnk6IG5ldyBpYW0uRmVkZXJhdGVkUHJpbmNpcGFsKFxyXG4gICAgICAgICAgXCJjb2duaXRvLWlkZW50aXR5LmFtYXpvbmF3cy5jb21cIixcclxuICAgICAgICAgIHtcclxuICAgICAgICAgICAgU3RyaW5nRXF1YWxzOiB7XHJcbiAgICAgICAgICAgICAgXCJjb2duaXRvLWlkZW50aXR5LmFtYXpvbmF3cy5jb206YXVkXCI6IGlkZW50aXR5UG9vbC5yZWYsXHJcbiAgICAgICAgICAgIH0sXHJcbiAgICAgICAgICAgIFwiRm9yQW55VmFsdWU6U3RyaW5nTGlrZVwiOiB7XHJcbiAgICAgICAgICAgICAgXCJjb2duaXRvLWlkZW50aXR5LmFtYXpvbmF3cy5jb206YW1yXCI6IFwiYXV0aGVudGljYXRlZFwiLFxyXG4gICAgICAgICAgICB9LFxyXG4gICAgICAgICAgfSxcclxuICAgICAgICAgIFwic3RzOkFzc3VtZVJvbGVXaXRoV2ViSWRlbnRpdHlcIlxyXG4gICAgICAgICksXHJcbiAgICAgIH1cclxuICAgICk7XHJcblxyXG4gICAgYXV0aGVudGljYXRlZFJvbGUuYWRkVG9Qb2xpY3koXHJcbiAgICAgIG5ldyBpYW0uUG9saWN5U3RhdGVtZW50KHtcclxuICAgICAgICBlZmZlY3Q6IGlhbS5FZmZlY3QuQUxMT1csXHJcbiAgICAgICAgYWN0aW9uczogW1xyXG4gICAgICAgICAgXCJtb2JpbGVhbmFseXRpY3M6UHV0RXZlbnRzXCIsXHJcbiAgICAgICAgICBcImNvZ25pdG8tc3luYzoqXCIsXHJcbiAgICAgICAgICBcImNvZ25pdG8taWRlbnRpdHk6KlwiLFxyXG4gICAgICAgIF0sXHJcbiAgICAgICAgcmVzb3VyY2VzOiBbXCIqXCJdLFxyXG4gICAgICB9KVxyXG4gICAgKTtcclxuXHJcbiAgICBhdXRoZW50aWNhdGVkUm9sZS5hZGRUb1BvbGljeShcclxuICAgICAgbmV3IGlhbS5Qb2xpY3lTdGF0ZW1lbnQoe1xyXG4gICAgICAgIGVmZmVjdDogaWFtLkVmZmVjdC5BTExPVyxcclxuICAgICAgICBhY3Rpb25zOiBbXCJsYW1iZGE6SW52b2tlRnVuY3Rpb25cIl0sXHJcbiAgICAgICAgcmVzb3VyY2VzOiBbXCIqXCJdLFxyXG4gICAgICB9KVxyXG4gICAgKTtcclxuXHJcbiAgICBjb25zdCBkZWZhdWx0UG9saWN5ID0gbmV3IGNvZ25pdG8uQ2ZuSWRlbnRpdHlQb29sUm9sZUF0dGFjaG1lbnQoXHJcbiAgICAgIHRoaXMsXHJcbiAgICAgIFwiSWRlbnRpdHlQb29sUm9sZU1hcHBpbmdcIixcclxuICAgICAge1xyXG4gICAgICAgIGlkZW50aXR5UG9vbElkOiBpZGVudGl0eVBvb2wucmVmLFxyXG4gICAgICAgIHJvbGVzOiB7XHJcbiAgICAgICAgICAvLyB1bmF1dGhlbnRpY2F0ZWQ6IHVuYXV0aGVudGljYXRlZFJvbGUucm9sZUFybixcclxuICAgICAgICAgIGF1dGhlbnRpY2F0ZWQ6IGF1dGhlbnRpY2F0ZWRSb2xlLnJvbGVBcm4sXHJcbiAgICAgICAgfSxcclxuICAgICAgfVxyXG4gICAgKTtcclxuICB9XHJcblxyXG4gIGNyZWF0ZUFQSVJlc291cmNlcygpIHtcclxuICAgIGNvbnN0IGFkbWluQXBpUmVzb3VyY2UgPSB0aGlzLmFwaS5yb290LmFkZFJlc291cmNlKFwiYWRtaW5cIik7XHJcbiAgICBhZG1pbkFwaVJlc291cmNlLmFkZE1ldGhvZChcclxuICAgICAgXCJPUFRJT05TXCIsXHJcbiAgICAgIGRlZmF1bHRzLm1vY2tJbnRlZ3JhdGlvbixcclxuICAgICAgZGVmYXVsdHMub3B0aW9uc1xyXG4gICAgKTtcclxuXHJcbiAgICB0aGlzLmdldEFkbWluUG9zdHNGdW5jdGlvbihhZG1pbkFwaVJlc291cmNlKTsgLy8gR0VUXHJcbiAgICB0aGlzLmNyZWF0ZVBvc3RzRnVuY3Rpb24oYWRtaW5BcGlSZXNvdXJjZSk7IC8vIFBPU1RcclxuICAgIHRoaXMuZGVsZXRlUG9zdEZ1bmN0aW9uKGFkbWluQXBpUmVzb3VyY2UpOyAvLyBERUxFVEVcclxuXHJcbiAgICAvLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vL1xyXG4gICAgY29uc3QgcG9zdEFwaVJlc291cmNlID0gdGhpcy5hcGkucm9vdC5hZGRSZXNvdXJjZShcInBvc3RcIik7XHJcbiAgICBwb3N0QXBpUmVzb3VyY2UuYWRkTWV0aG9kKFxyXG4gICAgICBcIk9QVElPTlNcIixcclxuICAgICAgZGVmYXVsdHMubW9ja0ludGVncmF0aW9uLFxyXG4gICAgICBkZWZhdWx0cy5vcHRpb25zXHJcbiAgICApO1xyXG5cclxuICAgIHRoaXMuZ2V0UG9zdEZ1bmN0aW9uKHBvc3RBcGlSZXNvdXJjZSk7IC8vIEdFVFxyXG5cclxuICAgIC8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vXHJcbiAgICBjb25zdCB0eXBlQXBpUmVzb3VyY2UgPSB0aGlzLmFwaS5yb290LmFkZFJlc291cmNlKFwidHlwZVwiKTtcclxuICAgIHR5cGVBcGlSZXNvdXJjZS5hZGRNZXRob2QoXHJcbiAgICAgIFwiT1BUSU9OU1wiLFxyXG4gICAgICBkZWZhdWx0cy5tb2NrSW50ZWdyYXRpb24sXHJcbiAgICAgIGRlZmF1bHRzLm9wdGlvbnNcclxuICAgICk7XHJcblxyXG4gICAgdGhpcy5nZXRUeXBlc0Z1bmN0aW9uKHR5cGVBcGlSZXNvdXJjZSk7IC8vIEdFVFxyXG5cclxuICAgIC8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vXHJcbiAgICBjb25zdCBsb2NhdGlvbkFwaVJlc291cmNlID0gdGhpcy5hcGkucm9vdC5hZGRSZXNvdXJjZShcImxvY2F0aW9uXCIpO1xyXG4gICAgbG9jYXRpb25BcGlSZXNvdXJjZS5hZGRNZXRob2QoXHJcbiAgICAgIFwiT1BUSU9OU1wiLFxyXG4gICAgICBkZWZhdWx0cy5tb2NrSW50ZWdyYXRpb24sXHJcbiAgICAgIGRlZmF1bHRzLm9wdGlvbnNcclxuICAgICk7XHJcblxyXG4gICAgdGhpcy5nZXRMb2NhdGlvbnNGdW5jdGlvbihsb2NhdGlvbkFwaVJlc291cmNlKTsgLy8gR0VUXHJcblxyXG4gICAgLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy9cclxuICAgIGNvbnN0IGxhdGVzdFBvc3RzQXBpUmVzb3VyY2UgPSB0aGlzLmFwaS5yb290LmFkZFJlc291cmNlKFwibGF0ZXN0LXBvc3RcIik7XHJcbiAgICBsYXRlc3RQb3N0c0FwaVJlc291cmNlLmFkZE1ldGhvZChcclxuICAgICAgXCJPUFRJT05TXCIsXHJcbiAgICAgIGRlZmF1bHRzLm1vY2tJbnRlZ3JhdGlvbixcclxuICAgICAgZGVmYXVsdHMub3B0aW9uc1xyXG4gICAgKTtcclxuXHJcbiAgICB0aGlzLmdldExhdGVzdFBvc3RzRnVuY3Rpb24obGF0ZXN0UG9zdHNBcGlSZXNvdXJjZSk7IC8vIEdFVFxyXG5cclxuICAgIC8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vXHJcbiAgICBjb25zdCB0eXBlUG9zdEFwaVJlc291cmNlID0gdGhpcy5hcGkucm9vdC5hZGRSZXNvdXJjZShcInR5cGUtcG9zdFwiKTtcclxuICAgIHR5cGVQb3N0QXBpUmVzb3VyY2UuYWRkTWV0aG9kKFxyXG4gICAgICBcIk9QVElPTlNcIixcclxuICAgICAgZGVmYXVsdHMubW9ja0ludGVncmF0aW9uLFxyXG4gICAgICBkZWZhdWx0cy5vcHRpb25zXHJcbiAgICApO1xyXG5cclxuICAgIHRoaXMuZ2V0VHlwZVBvc3RzRnVuY3Rpb24odHlwZVBvc3RBcGlSZXNvdXJjZSk7IC8vIEdFVFxyXG4gIH1cclxuICAvLyBsYW1iZGEgZnVuY3Rpb25zXHJcbiAgZ2V0QWRtaW5Qb3N0c0Z1bmN0aW9uKGFkbWluQXBpUmVzb3VyY2U6IGFwaWd3LlJlc291cmNlKSB7XHJcbiAgICBjb25zdCBnZXRUeXBlUG9zdHMgPSBuZXcgbGFtYmRhLkZ1bmN0aW9uKHRoaXMsIFwiZ2V0LWFkbWluLXBvc3RzXCIsIHtcclxuICAgICAgZnVuY3Rpb25OYW1lOiBcImdldC1hZG1pbi1wb3N0c1wiLFxyXG4gICAgICBydW50aW1lOiBsYW1iZGEuUnVudGltZS5OT0RFSlNfMTJfWCxcclxuICAgICAgaGFuZGxlcjogXCJpbmRleC5oYW5kbGVyXCIsXHJcbiAgICAgIGNvZGU6IGxhbWJkYS5Db2RlLmZyb21Bc3NldChcclxuICAgICAgICBwYXRoLmpvaW4oX19kaXJuYW1lLCBcIi4uL2xhbWJkYXMvZ2V0LWFkbWluLXBvc3RzXCIpXHJcbiAgICAgICksXHJcbiAgICAgIGVudmlyb25tZW50OiB7XHJcbiAgICAgICAgUE9TVFNfVEFCTEU6IHRoaXMucG9zdHNUYWJsZS50YWJsZU5hbWUsXHJcbiAgICAgIH0sXHJcbiAgICB9KTtcclxuXHJcbiAgICB0aGlzLnBvc3RzVGFibGUuZ3JhbnRSZWFkRGF0YShnZXRUeXBlUG9zdHMpO1xyXG5cclxuICAgIGFkbWluQXBpUmVzb3VyY2UuYWRkTWV0aG9kKFxyXG4gICAgICBcIkdFVFwiLFxyXG4gICAgICBkZWZhdWx0cy5sYW1iZGFJbnRlZ3JhdGlvbihnZXRUeXBlUG9zdHMsIHtcclxuICAgICAgICBcImFwcGxpY2F0aW9uL2pzb25cIjogJ3tcXG5cInN1YlwiOiBcIiRjb250ZXh0LmF1dGhvcml6ZXIuY2xhaW1zLnN1YlwiXFxufScsXHJcbiAgICAgIH0pLFxyXG4gICAgICB7XHJcbiAgICAgICAgLi4uZGVmYXVsdHMub3B0aW9ucyxcclxuICAgICAgICBhdXRob3JpemF0aW9uVHlwZTogYXBpZ3cuQXV0aG9yaXphdGlvblR5cGUuQ09HTklUTyxcclxuICAgICAgICBhdXRob3JpemVyOiB7IGF1dGhvcml6ZXJJZDogdGhpcy5hdXRob3JpemVyLnJlZiB9LFxyXG4gICAgICB9XHJcbiAgICApO1xyXG4gIH1cclxuXHJcbiAgY3JlYXRlUG9zdHNGdW5jdGlvbihhZG1pbkFwaVJlc291cmNlOiBhcGlndy5SZXNvdXJjZSkge1xyXG4gICAgY29uc3QgY3JlYXRlUG9zdCA9IG5ldyBsYW1iZGEuRnVuY3Rpb24odGhpcywgXCJjcmVhdGUtcG9zdFwiLCB7XHJcbiAgICAgIGZ1bmN0aW9uTmFtZTogXCJjcmVhdGUtcG9zdFwiLFxyXG4gICAgICBydW50aW1lOiBsYW1iZGEuUnVudGltZS5OT0RFSlNfMTJfWCxcclxuICAgICAgaGFuZGxlcjogXCJpbmRleC5oYW5kbGVyXCIsXHJcbiAgICAgIGNvZGU6IGxhbWJkYS5Db2RlLmZyb21Bc3NldChcclxuICAgICAgICBwYXRoLmpvaW4oX19kaXJuYW1lLCBcIi4uL2xhbWJkYXMvY3JlYXRlLXBvc3RcIilcclxuICAgICAgKSxcclxuICAgICAgZW52aXJvbm1lbnQ6IHtcclxuICAgICAgICBQT1NUU19UQUJMRTogdGhpcy5wb3N0c1RhYmxlLnRhYmxlTmFtZSxcclxuICAgICAgfSxcclxuICAgIH0pO1xyXG5cclxuICAgIHRoaXMucG9zdHNUYWJsZS5ncmFudFJlYWRXcml0ZURhdGEoY3JlYXRlUG9zdCk7XHJcblxyXG4gICAgYWRtaW5BcGlSZXNvdXJjZS5hZGRNZXRob2QoXHJcbiAgICAgIFwiUE9TVFwiLFxyXG4gICAgICBkZWZhdWx0cy5sYW1iZGFJbnRlZ3JhdGlvbihjcmVhdGVQb3N0LCB7XHJcbiAgICAgICAgXCJhcHBsaWNhdGlvbi9qc29uXCI6XHJcbiAgICAgICAgICAne1xcblwicmVxdWVzdEJvZHlcIjogJGlucHV0LmJvZHksXFxuXCJzdWJcIjogXCIkY29udGV4dC5hdXRob3JpemVyLmNsYWltcy5zdWJcIlxcbn0nLFxyXG4gICAgICB9KSxcclxuICAgICAge1xyXG4gICAgICAgIC4uLmRlZmF1bHRzLm9wdGlvbnMsXHJcbiAgICAgICAgYXV0aG9yaXphdGlvblR5cGU6IGFwaWd3LkF1dGhvcml6YXRpb25UeXBlLkNPR05JVE8sXHJcbiAgICAgICAgYXV0aG9yaXplcjogeyBhdXRob3JpemVySWQ6IHRoaXMuYXV0aG9yaXplci5yZWYgfSxcclxuICAgICAgfVxyXG4gICAgKTtcclxuICB9XHJcblxyXG4gIGRlbGV0ZVBvc3RGdW5jdGlvbihhZG1pbkFwaVJlc291cmNlOiBhcGlndy5SZXNvdXJjZSkge1xyXG4gICAgY29uc3QgZ2V0VHlwZVBvc3RzID0gbmV3IGxhbWJkYS5GdW5jdGlvbih0aGlzLCBcImRlbGV0ZS1wb3N0XCIsIHtcclxuICAgICAgZnVuY3Rpb25OYW1lOiBcImRlbGV0ZS1wb3N0XCIsXHJcbiAgICAgIHJ1bnRpbWU6IGxhbWJkYS5SdW50aW1lLk5PREVKU18xMl9YLFxyXG4gICAgICBoYW5kbGVyOiBcImluZGV4LmhhbmRsZXJcIixcclxuICAgICAgY29kZTogbGFtYmRhLkNvZGUuZnJvbUFzc2V0KFxyXG4gICAgICAgIHBhdGguam9pbihfX2Rpcm5hbWUsIFwiLi4vbGFtYmRhcy9kZWxldGUtcG9zdFwiKVxyXG4gICAgICApLFxyXG4gICAgICBlbnZpcm9ubWVudDoge1xyXG4gICAgICAgIFBPU1RTX1RBQkxFOiB0aGlzLnBvc3RzVGFibGUudGFibGVOYW1lLFxyXG4gICAgICB9LFxyXG4gICAgfSk7XHJcblxyXG4gICAgdGhpcy5wb3N0c1RhYmxlLmdyYW50V3JpdGVEYXRhKGdldFR5cGVQb3N0cyk7XHJcblxyXG4gICAgYWRtaW5BcGlSZXNvdXJjZS5hZGRNZXRob2QoXHJcbiAgICAgIFwiREVMRVRFXCIsXHJcbiAgICAgIGRlZmF1bHRzLmxhbWJkYUludGVncmF0aW9uKGdldFR5cGVQb3N0cywge1xyXG4gICAgICAgIFwiYXBwbGljYXRpb24vanNvblwiOiBgXHJcbiAgICAgICAgICAgICNzZXQoJGhhc0lkID0gJGlucHV0LnBhcmFtcygnaWQnKSlcclxuICAgICAgICAgICAge1xyXG4gICAgICAgICAgICAgIFwic3ViXCI6IFwiJGNvbnRleHQuYXV0aG9yaXplci5jbGFpbXMuc3ViXCJcclxuICAgICAgICAgICAgICAjaWYoJGhhc0lkICE9IFwiXCIpLCBcImlkXCIgOiBcIiRpbnB1dC5wYXJhbXMoJ2lkJylcIiNlbmRcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgYCxcclxuICAgICAgfSksXHJcbiAgICAgIHtcclxuICAgICAgICAuLi5kZWZhdWx0cy5vcHRpb25zLFxyXG4gICAgICAgIGF1dGhvcml6YXRpb25UeXBlOiBhcGlndy5BdXRob3JpemF0aW9uVHlwZS5DT0dOSVRPLFxyXG4gICAgICAgIGF1dGhvcml6ZXI6IHsgYXV0aG9yaXplcklkOiB0aGlzLmF1dGhvcml6ZXIucmVmIH0sXHJcbiAgICAgIH1cclxuICAgICk7XHJcbiAgfVxyXG5cclxuICBnZXRMYXRlc3RQb3N0c0Z1bmN0aW9uKGxhdGVzdFBvc3RzQXBpUmVzb3VyY2U6IGFwaWd3LlJlc291cmNlKSB7XHJcbiAgICBjb25zdCBnZXRMYXRlc3RQb3N0cyA9IG5ldyBsYW1iZGEuRnVuY3Rpb24odGhpcywgXCJnZXQtbGF0ZXN0LXBvc3RzXCIsIHtcclxuICAgICAgZnVuY3Rpb25OYW1lOiBcImdldC1sYXRlc3QtcG9zdHNcIixcclxuICAgICAgcnVudGltZTogbGFtYmRhLlJ1bnRpbWUuTk9ERUpTXzEyX1gsXHJcbiAgICAgIGhhbmRsZXI6IFwiaW5kZXguaGFuZGxlclwiLFxyXG4gICAgICBjb2RlOiBsYW1iZGEuQ29kZS5mcm9tQXNzZXQoXHJcbiAgICAgICAgcGF0aC5qb2luKF9fZGlybmFtZSwgXCIuLi9sYW1iZGFzL2dldC1sYXRlc3QtcG9zdHNcIilcclxuICAgICAgKSxcclxuICAgICAgZW52aXJvbm1lbnQ6IHtcclxuICAgICAgICBQT1NUU19UQUJMRTogdGhpcy5wb3N0c1RhYmxlLnRhYmxlTmFtZSxcclxuICAgICAgICBpZGVudGl0eVBvb2xJZDogdGhpcy51c2VyUG9vbC51c2VyUG9vbElkLFxyXG4gICAgICB9LFxyXG4gICAgfSk7XHJcblxyXG4gICAgdGhpcy5wb3N0c1RhYmxlLmdyYW50UmVhZERhdGEoZ2V0TGF0ZXN0UG9zdHMpO1xyXG5cclxuICAgIGdldExhdGVzdFBvc3RzLmFkZFRvUm9sZVBvbGljeShcclxuICAgICAgbmV3IGlhbS5Qb2xpY3lTdGF0ZW1lbnQoe1xyXG4gICAgICAgIGVmZmVjdDogaWFtLkVmZmVjdC5BTExPVyxcclxuICAgICAgICBhY3Rpb25zOiAgW1wibGFtYmRhOkludm9rZUZ1bmN0aW9uXCIsIFwiY29nbml0by1pZHA6KlwiXSxcclxuICAgICAgICByZXNvdXJjZXM6IFtcIipcIl0sXHJcbiAgICAgIH0pXHJcbiAgICApO1xyXG5cclxuICAgIGxhdGVzdFBvc3RzQXBpUmVzb3VyY2UuYWRkTWV0aG9kKFxyXG4gICAgICBcIkdFVFwiLFxyXG4gICAgICBkZWZhdWx0cy5sYW1iZGFJbnRlZ3JhdGlvbihnZXRMYXRlc3RQb3N0cywge1xyXG4gICAgICAgIFwiYXBwbGljYXRpb24vanNvblwiOiBgXHJcbiAgICAgICAgI3NldCgkaGFzTGFzdEV2YWx1YXRlZEtleSA9ICRpbnB1dC5wYXJhbXMoJ0xhc3RFdmFsdWF0ZWRLZXknKSlcclxuICAgICAgICAjc2V0KCRoYXNMaW1pdCA9ICRpbnB1dC5wYXJhbXMoJ2xpbWl0JykpXHJcbiAgICAgICAgI3NldCgkaGFzVHlwZUlkID0gJGlucHV0LnBhcmFtcygndHlwZUlkJykpXHJcbiAgICAgICAgI3NldCgkaGFzS2V5d29yZCA9ICRpbnB1dC5wYXJhbXMoJ2tleXdvcmQnKSlcclxuICAgICAgICB7XHJcbiAgICAgICAgI2lmKCRoYXNMaW1pdCAhPSBcIlwiKSBcImxpbWl0XCIgOiBcIiRpbnB1dC5wYXJhbXMoJ2xpbWl0JylcIiNlbmRcclxuICAgICAgICAjaWYoJGhhc1R5cGVJZCAhPSBcIlwiKSwgXCJ0eXBlSWRcIiA6IFwiJGlucHV0LnBhcmFtcygndHlwZUlkJylcIiNlbmRcclxuICAgICAgICAjaWYoJGhhc0tleXdvcmQgIT0gXCJcIiksIFwia2V5d29yZFwiIDogXCIkaW5wdXQucGFyYW1zKCdrZXl3b3JkJylcIiNlbmRcclxuICAgICAgICAjaWYoJGhhc0xhc3RFdmFsdWF0ZWRLZXkgIT0gXCJcIiksIFwiTGFzdEV2YWx1YXRlZEtleVwiIDogXCIkaW5wdXQucGFyYW1zKCdMYXN0RXZhbHVhdGVkS2V5JylcIiNlbmRcclxuICAgICAgICB9XHJcbiAgICAgICAgYCxcclxuICAgICAgfSksXHJcbiAgICAgIGRlZmF1bHRzLm9wdGlvbnNcclxuICAgICk7XHJcbiAgfVxyXG5cclxuICBnZXRQb3N0RnVuY3Rpb24ocG9zdEFwaVJlc291cmNlOiBhcGlndy5SZXNvdXJjZSkge1xyXG4gICAgY29uc3QgZ2V0UG9zdCA9IG5ldyBsYW1iZGEuRnVuY3Rpb24odGhpcywgXCJnZXQtcG9zdFwiLCB7XHJcbiAgICAgIGZ1bmN0aW9uTmFtZTogXCJnZXQtcG9zdFwiLFxyXG4gICAgICBydW50aW1lOiBsYW1iZGEuUnVudGltZS5OT0RFSlNfMTJfWCxcclxuICAgICAgaGFuZGxlcjogXCJpbmRleC5oYW5kbGVyXCIsXHJcbiAgICAgIGNvZGU6IGxhbWJkYS5Db2RlLmZyb21Bc3NldChwYXRoLmpvaW4oX19kaXJuYW1lLCBcIi4uL2xhbWJkYXMvZ2V0LXBvc3RcIikpLFxyXG4gICAgICBlbnZpcm9ubWVudDoge1xyXG4gICAgICAgIFBPU1RTX1RBQkxFOiB0aGlzLnBvc3RzVGFibGUudGFibGVOYW1lLFxyXG4gICAgICB9LFxyXG4gICAgfSk7XHJcblxyXG4gICAgdGhpcy5wb3N0c1RhYmxlLmdyYW50UmVhZERhdGEoZ2V0UG9zdCk7XHJcblxyXG4gICAgcG9zdEFwaVJlc291cmNlLmFkZE1ldGhvZChcclxuICAgICAgXCJHRVRcIixcclxuICAgICAgZGVmYXVsdHMubGFtYmRhSW50ZWdyYXRpb24oZ2V0UG9zdCwge1xyXG4gICAgICAgIFwiYXBwbGljYXRpb24vanNvblwiOiBgXHJcbiAgICAgICAgICAjc2V0KCRoYXNJZCA9ICRpbnB1dC5wYXJhbXMoJ2lkJykpXHJcbiAgICAgICAgICB7XHJcbiAgICAgICAgICAgICNpZigkaGFzSWQgIT0gXCJcIikgXCJpZFwiIDogXCIkaW5wdXQucGFyYW1zKCdpZCcpXCIjZW5kXHJcbiAgICAgICAgICB9XHJcbiAgICAgICAgYCxcclxuICAgICAgfSksXHJcbiAgICAgIGRlZmF1bHRzLm9wdGlvbnNcclxuICAgICk7XHJcbiAgfVxyXG5cclxuICBnZXRUeXBlc0Z1bmN0aW9uKHR5cGVBcGlSZXNvdXJjZTogYXBpZ3cuUmVzb3VyY2UpIHtcclxuICAgIGNvbnN0IGdldFR5cGVzID0gbmV3IGxhbWJkYS5GdW5jdGlvbih0aGlzLCBcImdldC10eXBlc1wiLCB7XHJcbiAgICAgIGZ1bmN0aW9uTmFtZTogXCJnZXQtdHlwZXNcIixcclxuICAgICAgcnVudGltZTogbGFtYmRhLlJ1bnRpbWUuTk9ERUpTXzEyX1gsXHJcbiAgICAgIGhhbmRsZXI6IFwiaW5kZXguaGFuZGxlclwiLFxyXG4gICAgICBjb2RlOiBsYW1iZGEuQ29kZS5mcm9tQXNzZXQocGF0aC5qb2luKF9fZGlybmFtZSwgXCIuLi9sYW1iZGFzL2dldC10eXBlc1wiKSksXHJcbiAgICAgIGVudmlyb25tZW50OiB7XHJcbiAgICAgICAgU0VUVElOR1NfVEFCTEU6IHRoaXMuc2V0dGluZ3NUYWJsZS50YWJsZU5hbWUsXHJcbiAgICAgIH0sXHJcbiAgICB9KTtcclxuXHJcbiAgICB0aGlzLnNldHRpbmdzVGFibGUuZ3JhbnRSZWFkRGF0YShnZXRUeXBlcyk7XHJcblxyXG4gICAgdHlwZUFwaVJlc291cmNlLmFkZE1ldGhvZChcclxuICAgICAgXCJHRVRcIixcclxuICAgICAgZGVmYXVsdHMubGFtYmRhSW50ZWdyYXRpb24oZ2V0VHlwZXMsIHt9KSxcclxuICAgICAgZGVmYXVsdHMub3B0aW9uc1xyXG4gICAgKTtcclxuICB9XHJcblxyXG4gIGdldExvY2F0aW9uc0Z1bmN0aW9uKGxvY2F0aW9uQXBpUmVzb3VyY2U6IGFwaWd3LlJlc291cmNlKSB7XHJcbiAgICBjb25zdCBnZXRMb2NhdGlvbnMgPSBuZXcgbGFtYmRhLkZ1bmN0aW9uKHRoaXMsIFwiZ2V0LWxvY2F0aW9uc1wiLCB7XHJcbiAgICAgIGZ1bmN0aW9uTmFtZTogXCJnZXQtbG9jYXRpb25zXCIsXHJcbiAgICAgIHJ1bnRpbWU6IGxhbWJkYS5SdW50aW1lLk5PREVKU18xMl9YLFxyXG4gICAgICBoYW5kbGVyOiBcImluZGV4LmhhbmRsZXJcIixcclxuICAgICAgY29kZTogbGFtYmRhLkNvZGUuZnJvbUFzc2V0KFxyXG4gICAgICAgIHBhdGguam9pbihfX2Rpcm5hbWUsIFwiLi4vbGFtYmRhcy9nZXQtbG9jYXRpb25zXCIpXHJcbiAgICAgICksXHJcbiAgICAgIGVudmlyb25tZW50OiB7XHJcbiAgICAgICAgU0VUVElOR1NfVEFCTEU6IHRoaXMuc2V0dGluZ3NUYWJsZS50YWJsZU5hbWUsXHJcbiAgICAgIH0sXHJcbiAgICB9KTtcclxuXHJcbiAgICB0aGlzLnNldHRpbmdzVGFibGUuZ3JhbnRSZWFkRGF0YShnZXRMb2NhdGlvbnMpO1xyXG5cclxuICAgIGxvY2F0aW9uQXBpUmVzb3VyY2UuYWRkTWV0aG9kKFxyXG4gICAgICBcIkdFVFwiLFxyXG4gICAgICBkZWZhdWx0cy5sYW1iZGFJbnRlZ3JhdGlvbihnZXRMb2NhdGlvbnMsIHt9KSxcclxuICAgICAgZGVmYXVsdHMub3B0aW9uc1xyXG4gICAgKTtcclxuICB9XHJcblxyXG4gIGdldFR5cGVQb3N0c0Z1bmN0aW9uKHBvc3RBcGlSZXNvdXJjZTogYXBpZ3cuUmVzb3VyY2UpIHtcclxuICAgIGNvbnN0IGdldFR5cGVQb3N0cyA9IG5ldyBsYW1iZGEuRnVuY3Rpb24odGhpcywgXCJnZXQtdHlwZS1wb3N0c1wiLCB7XHJcbiAgICAgIGZ1bmN0aW9uTmFtZTogXCJnZXQtdHlwZS1wb3N0c1wiLFxyXG4gICAgICBydW50aW1lOiBsYW1iZGEuUnVudGltZS5OT0RFSlNfMTJfWCxcclxuICAgICAgaGFuZGxlcjogXCJpbmRleC5oYW5kbGVyXCIsXHJcbiAgICAgIGNvZGU6IGxhbWJkYS5Db2RlLmZyb21Bc3NldChcclxuICAgICAgICBwYXRoLmpvaW4oX19kaXJuYW1lLCBcIi4uL2xhbWJkYXMvZ2V0LXR5cGUtcG9zdHNcIilcclxuICAgICAgKSxcclxuICAgICAgZW52aXJvbm1lbnQ6IHtcclxuICAgICAgICBQT1NUU19UQUJMRTogdGhpcy5wb3N0c1RhYmxlLnRhYmxlTmFtZSxcclxuICAgICAgfSxcclxuICAgIH0pO1xyXG5cclxuICAgIHRoaXMucG9zdHNUYWJsZS5ncmFudFJlYWREYXRhKGdldFR5cGVQb3N0cyk7XHJcblxyXG4gICAgcG9zdEFwaVJlc291cmNlLmFkZE1ldGhvZChcclxuICAgICAgXCJHRVRcIixcclxuICAgICAgZGVmYXVsdHMubGFtYmRhSW50ZWdyYXRpb24oZ2V0VHlwZVBvc3RzLCB7XHJcbiAgICAgICAgXCJhcHBsaWNhdGlvbi9qc29uXCI6IGBcclxuICAgICAgICAjc2V0KCRoYXNUeXBlSWQgPSAkaW5wdXQucGFyYW1zKCd0eXBlSWQnKSlcclxuICAgICAgICAjc2V0KCRoYXNMYXN0RXZhbHVhdGVkS2V5ID0gJGlucHV0LnBhcmFtcygnTGFzdEV2YWx1YXRlZEtleScpKVxyXG4gICAgICAgICNzZXQoJGhhc0xpbWl0ID0gJGlucHV0LnBhcmFtcygnbGltaXQnKSlcclxuICAgICAgICB7XHJcbiAgICAgICAgICAjaWYoJGhhc1R5cGVJZCAhPSBcIlwiKSBcInR5cGVJZFwiIDogXCIkaW5wdXQucGFyYW1zKCd0eXBlSWQnKVwiI2VuZFxyXG4gICAgICAgICAgI2lmKCRoYXNMaW1pdCAhPSBcIlwiKSxcImxpbWl0XCIgOiBcIiRpbnB1dC5wYXJhbXMoJ2xpbWl0JylcIiNlbmRcclxuICAgICAgICAgICNpZigkaGFzTGFzdEV2YWx1YXRlZEtleSAhPSBcIlwiKSxcIkxhc3RFdmFsdWF0ZWRLZXlcIjogXCIkaW5wdXQucGFyYW1zKCdMYXN0RXZhbHVhdGVkS2V5JylcIiNlbmRcclxuICAgICAgICB9XHJcbiAgICAgIGAsXHJcbiAgICAgIH0pLFxyXG4gICAgICBkZWZhdWx0cy5vcHRpb25zXHJcbiAgICApO1xyXG4gIH1cclxufVxyXG4iXX0=