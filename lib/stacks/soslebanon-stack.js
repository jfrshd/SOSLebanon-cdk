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
        const getTypePosts = new lambda.Function(this, "get-latest-posts", {
            functionName: "get-latest-posts",
            runtime: lambda.Runtime.NODEJS_12_X,
            handler: "index.handler",
            code: lambda.Code.fromAsset(path.join(__dirname, "../lambdas/get-latest-posts")),
            environment: {
                POSTS_TABLE: this.postsTable.tableName,
                identityPoolId: this.userPool.userPoolId,
            },
        });
        this.postsTable.grantReadData(getTypePosts);
        latestPostsApiResource.addMethod("GET", defaults.lambdaIntegration(getTypePosts, {
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic29zbGViYW5vbi1zdGFjay5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbInNvc2xlYmFub24tc3RhY2sudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7QUFBQSxxQ0FBcUM7QUFDckMsa0RBQWtEO0FBQ2xELDhDQUE4QztBQUU5QyxpREFBaUQ7QUFDakQsZ0RBQWdEO0FBQ2hELHdDQUF3QztBQUN4Qyx3Q0FBd0M7QUFDeEMsNkJBQTZCO0FBQzdCLCtDQUErQztBQUMvQyx3Q0FBNkQ7QUFJN0QsTUFBYSxlQUFnQixTQUFRLEdBQUcsQ0FBQyxLQUFLO0lBTzVDLFlBQVksS0FBb0IsRUFBRSxFQUFVLEVBQUUsS0FBc0I7UUFDbEUsS0FBSyxDQUFDLEtBQUssRUFBRSxFQUFFLEVBQUUsS0FBSyxDQUFDLENBQUM7UUFDeEIsSUFBSSxDQUFDLEdBQUcsR0FBRyxJQUFJLEtBQUssQ0FBQyxPQUFPLENBQUMsSUFBSSxFQUFFLGVBQWUsQ0FBQyxDQUFDO1FBQ3BELElBQUksQ0FBQyxhQUFhLEVBQUUsQ0FBQztRQUNyQixJQUFJLENBQUMsZ0JBQWdCLEVBQUUsQ0FBQztRQUN4QixJQUFJLENBQUMsZ0JBQWdCLEVBQUUsQ0FBQztRQUN4QixJQUFJLENBQUMsa0JBQWtCLEVBQUUsQ0FBQztJQUM1QixDQUFDO0lBRUQsZ0JBQWdCO1FBQ2QsSUFBSSxDQUFDLFVBQVUsR0FBRyxJQUFJLFFBQVEsQ0FBQyxLQUFLLENBQUMsSUFBSSxFQUFFLGFBQWEsRUFBRTtZQUN4RCxTQUFTLEVBQUUsYUFBYTtZQUN4QixZQUFZLEVBQUUsRUFBRSxJQUFJLEVBQUUsSUFBSSxFQUFFLElBQUksRUFBRSxRQUFRLENBQUMsYUFBYSxDQUFDLE1BQU0sRUFBRTtZQUNqRSxPQUFPLEVBQUU7Z0JBQ1AsSUFBSSxFQUFFLElBQUk7Z0JBQ1YsSUFBSSxFQUFFLFFBQVEsQ0FBQyxhQUFhLENBQUMsTUFBTTthQUNwQztZQUNELFdBQVcsRUFBRSxRQUFRLENBQUMsV0FBVyxDQUFDLGVBQWU7U0FD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Ozs7Ozs7OztPQVNyQjtTQUNBLENBQUMsRUFDRixRQUFRLENBQUMsT0FBTyxDQUNqQixDQUFDO0lBQ0osQ0FBQztDQUNGO0FBMWZELDBDQTBmQyIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCAqIGFzIGNkayBmcm9tIFwiQGF3cy1jZGsvY29yZVwiO1xuaW1wb3J0ICogYXMgZHluYW1vZGIgZnJvbSBcIkBhd3MtY2RrL2F3cy1keW5hbW9kYlwiO1xuaW1wb3J0ICogYXMgbGFtYmRhIGZyb20gXCJAYXdzLWNkay9hd3MtbGFtYmRhXCI7XG5pbXBvcnQgKiBhcyBzMyBmcm9tIFwiQGF3cy1jZGsvYXdzLXMzXCI7XG5pbXBvcnQgKiBhcyBhcGlndyBmcm9tIFwiQGF3cy1jZGsvYXdzLWFwaWdhdGV3YXlcIjtcbmltcG9ydCAqIGFzIGNvZ25pdG8gZnJvbSBcIkBhd3MtY2RrL2F3cy1jb2duaXRvXCI7XG5pbXBvcnQgKiBhcyBpYW0gZnJvbSBcIkBhd3MtY2RrL2F3cy1pYW1cIjtcbmltcG9ydCAqIGFzIHNlcyBmcm9tIFwiQGF3cy1jZGsvYXdzLXNlc1wiO1xuaW1wb3J0ICogYXMgcGF0aCBmcm9tIFwicGF0aFwiO1xuaW1wb3J0ICogYXMgZGVmYXVsdHMgZnJvbSBcIi4uL2V4dHJhcy9kZWZhdWx0c1wiO1xuaW1wb3J0IHsgUmVtb3ZhbFBvbGljeSwgVGFnLCBEdXJhdGlvbiB9IGZyb20gXCJAYXdzLWNkay9jb3JlXCI7XG5pbXBvcnQgeyBNZmEsIFVzZXJQb29sIH0gZnJvbSBcIkBhd3MtY2RrL2F3cy1jb2duaXRvXCI7XG5pbXBvcnQgeyBJRnVuY3Rpb24gfSBmcm9tIFwiQGF3cy1jZGsvYXdzLWxhbWJkYVwiO1xuXG5leHBvcnQgY2xhc3MgU29zbGViYW5vblN0YWNrIGV4dGVuZHMgY2RrLlN0YWNrIHtcbiAgYXBpOiBhcGlndy5SZXN0QXBpO1xuICBwb3N0c1RhYmxlOiBkeW5hbW9kYi5UYWJsZTtcbiAgc2V0dGluZ3NUYWJsZTogZHluYW1vZGIuVGFibGU7XG4gIGF1dGhvcml6ZXI6IGFwaWd3LkNmbkF1dGhvcml6ZXI7XG4gIHVzZXJQb29sOiBjb2duaXRvLlVzZXJQb29sO1xuXG4gIGNvbnN0cnVjdG9yKHNjb3BlOiBjZGsuQ29uc3RydWN0LCBpZDogc3RyaW5nLCBwcm9wcz86IGNkay5TdGFja1Byb3BzKSB7XG4gICAgc3VwZXIoc2NvcGUsIGlkLCBwcm9wcyk7XG4gICAgdGhpcy5hcGkgPSBuZXcgYXBpZ3cuUmVzdEFwaSh0aGlzLCBcIlNPU0xlYmFub25BUElcIik7XG4gICAgdGhpcy5jcmVhdGVDb2duaXRvKCk7XG4gICAgdGhpcy5jcmVhdGVQb3N0c1RhYmxlKCk7XG4gICAgdGhpcy5jcmVhdGVUeXBlc3RhYmxlKCk7XG4gICAgdGhpcy5jcmVhdGVBUElSZXNvdXJjZXMoKTtcbiAgfVxuXG4gIGNyZWF0ZVBvc3RzVGFibGUoKTogdm9pZCB7XG4gICAgdGhpcy5wb3N0c1RhYmxlID0gbmV3IGR5bmFtb2RiLlRhYmxlKHRoaXMsIFwicG9zdHMtdGFibGVcIiwge1xuICAgICAgdGFibGVOYW1lOiBcInBvc3RzLXRhYmxlXCIsXG4gICAgICBwYXJ0aXRpb25LZXk6IHsgbmFtZTogXCJwa1wiLCB0eXBlOiBkeW5hbW9kYi5BdHRyaWJ1dGVUeXBlLlNUUklORyB9LFxuICAgICAgc29ydEtleToge1xuICAgICAgICBuYW1lOiBcImlkXCIsXG4gICAgICAgIHR5cGU6IGR5bmFtb2RiLkF0dHJpYnV0ZVR5cGUuU1RSSU5HLFxuICAgICAgfSxcbiAgICAgIGJpbGxpbmdNb2RlOiBkeW5hbW9kYi5CaWxsaW5nTW9kZS5QQVlfUEVSX1JFUVVFU1QsXG4gICAgfSk7XG4gICAgdGhpcy5wb3N0c1RhYmxlLmFkZExvY2FsU2Vjb25kYXJ5SW5kZXgoe1xuICAgICAgaW5kZXhOYW1lOiBcImNyZWF0aW9uRGF0ZVwiLFxuICAgICAgc29ydEtleToge1xuICAgICAgICBuYW1lOiBcImNyZWF0aW9uRGF0ZVwiLFxuICAgICAgICB0eXBlOiBkeW5hbW9kYi5BdHRyaWJ1dGVUeXBlLk5VTUJFUixcbiAgICAgIH0sXG4gICAgfSk7XG4gICAgdGhpcy5wb3N0c1RhYmxlLmFkZExvY2FsU2Vjb25kYXJ5SW5kZXgoe1xuICAgICAgaW5kZXhOYW1lOiBcInR5cGVJZFwiLFxuICAgICAgc29ydEtleToge1xuICAgICAgICBuYW1lOiBcInR5cGVJZFwiLFxuICAgICAgICB0eXBlOiBkeW5hbW9kYi5BdHRyaWJ1dGVUeXBlLlNUUklORyxcbiAgICAgIH0sXG4gICAgfSk7XG4gIH1cblxuICBjcmVhdGVUeXBlc3RhYmxlKCk6IHZvaWQge1xuICAgIHRoaXMuc2V0dGluZ3NUYWJsZSA9IG5ldyBkeW5hbW9kYi5UYWJsZSh0aGlzLCBcInNldHRpbmctdGFibGVcIiwge1xuICAgICAgdGFibGVOYW1lOiBcInNldHRpbmctdGFibGVcIixcbiAgICAgIHBhcnRpdGlvbktleTogeyBuYW1lOiBcInBrXCIsIHR5cGU6IGR5bmFtb2RiLkF0dHJpYnV0ZVR5cGUuU1RSSU5HIH0sXG4gICAgICBzb3J0S2V5OiB7XG4gICAgICAgIG5hbWU6IFwiaWRcIixcbiAgICAgICAgdHlwZTogZHluYW1vZGIuQXR0cmlidXRlVHlwZS5TVFJJTkcsXG4gICAgICB9LFxuICAgICAgYmlsbGluZ01vZGU6IGR5bmFtb2RiLkJpbGxpbmdNb2RlLlBBWV9QRVJfUkVRVUVTVCxcbiAgICB9KTtcbiAgfVxuXG4gIGNyZWF0ZUNvZ25pdG8oKTogdm9pZCB7XG4gICAgY29uc3QgY29uZlNldCA9IG5ldyBzZXMuQ2ZuQ29uZmlndXJhdGlvblNldCh0aGlzLCBcInNvc2xlYmFub24tY29uZi1zZXRcIiwge1xuICAgICAgbmFtZTogXCJzb3NsZWJhbm9uLXNlcy1jb25mLXNldFwiLFxuICAgIH0pO1xuXG4gICAgdGhpcy51c2VyUG9vbCA9IG5ldyBjb2duaXRvLlVzZXJQb29sKHRoaXMsIFwic29zbGViYW5vbi11c2VyLXBvb2xcIiwge1xuICAgICAgdXNlclBvb2xOYW1lOiBcInNvc2xlYmFub24tdXNlci1wb29sXCIsXG4gICAgICBzZWxmU2lnblVwRW5hYmxlZDogdHJ1ZSxcbiAgICAgIHNpZ25JbkFsaWFzZXM6IHtcbiAgICAgICAgdXNlcm5hbWU6IGZhbHNlLFxuICAgICAgICBlbWFpbDogdHJ1ZSxcbiAgICAgIH0sXG4gICAgICBzdGFuZGFyZEF0dHJpYnV0ZXM6IHtcbiAgICAgICAgZ2l2ZW5OYW1lOiB7IG11dGFibGU6IHRydWUsIHJlcXVpcmVkOiB0cnVlIH0sXG4gICAgICAgIGZhbWlseU5hbWU6IHsgbXV0YWJsZTogdHJ1ZSwgcmVxdWlyZWQ6IHRydWUgfSxcbiAgICAgICAgZW1haWw6IHsgbXV0YWJsZTogdHJ1ZSwgcmVxdWlyZWQ6IHRydWUgfSxcbiAgICAgICAgcGhvbmVOdW1iZXI6IHsgbXV0YWJsZTogdHJ1ZSwgcmVxdWlyZWQ6IHRydWUgfSxcbiAgICAgICAgYWRkcmVzczogeyBtdXRhYmxlOiB0cnVlLCByZXF1aXJlZDogdHJ1ZSB9LFxuICAgICAgfSxcbiAgICAgIGN1c3RvbUF0dHJpYnV0ZXM6IHtcbiAgICAgICAgdHlwZTogbmV3IGNvZ25pdG8uU3RyaW5nQXR0cmlidXRlKHsgbXV0YWJsZTogdHJ1ZSB9KSxcbiAgICAgIH0sXG4gICAgICBhdXRvVmVyaWZ5OiB7XG4gICAgICAgIGVtYWlsOiB0cnVlLFxuICAgICAgICBwaG9uZTogdHJ1ZSxcbiAgICAgIH0sXG4gICAgICBwYXNzd29yZFBvbGljeToge1xuICAgICAgICBtaW5MZW5ndGg6IDgsXG4gICAgICAgIHJlcXVpcmVMb3dlcmNhc2U6IGZhbHNlLFxuICAgICAgICByZXF1aXJlRGlnaXRzOiBmYWxzZSxcbiAgICAgICAgcmVxdWlyZVN5bWJvbHM6IGZhbHNlLFxuICAgICAgICByZXF1aXJlVXBwZXJjYXNlOiBmYWxzZSxcbiAgICAgICAgdGVtcFBhc3N3b3JkVmFsaWRpdHk6IER1cmF0aW9uLmRheXMoNyksXG4gICAgICB9LFxuICAgICAgLy8gZW1haWxTZXR0aW5nczoge1xuICAgICAgLy8gICBmcm9tOiBcImhlbHBkZXNrQHNvc2xlYmFub24uY29tXCIsXG4gICAgICAvLyAgIHJlcGx5VG86IFwiaGVscGRlc2tAc29zbGViYW5vbi5jb21cIixcbiAgICAgIC8vIH0sXG4gICAgICBzaWduSW5DYXNlU2Vuc2l0aXZlOiB0cnVlLFxuICAgICAgYWNjb3VudFJlY292ZXJ5OiBjb2duaXRvLkFjY291bnRSZWNvdmVyeS5FTUFJTF9PTkxZLFxuICAgIH0pO1xuXG4gICAgY29uc3QgY2ZuVXNlclBvb2wgPSB0aGlzLnVzZXJQb29sLm5vZGUuZGVmYXVsdENoaWxkIGFzIGNvZ25pdG8uQ2ZuVXNlclBvb2w7XG4gICAgLy8gY2ZuVXNlclBvb2wuZW1haWxDb25maWd1cmF0aW9uID0ge1xuICAgIC8vICAgY29uZmlndXJhdGlvblNldDogY29uZlNldC5yZWYsXG4gICAgLy8gICBlbWFpbFNlbmRpbmdBY2NvdW50OiBcIkRFVkVMT1BFUlwiLFxuICAgIC8vICAgZnJvbTogXCJoZWxwZGVza0Bzb3NsZWJhbm9uLmNvbVwiLFxuICAgIC8vICAgcmVwbHlUb0VtYWlsQWRkcmVzczogXCJoZWxwZGVza0Bzb3NsZWJhbm9uLmNvbVwiLFxuICAgIC8vICAgc291cmNlQXJuOlxuICAgIC8vICAgICBcImFybjphd3M6c2VzOmV1LXdlc3QtMToyMTg1NjE4NjE1ODM6aWRlbnRpdHkvaGVscGRlc2tAc29zbGViYW5vbi5jb21cIixcbiAgICAvLyB9O1xuXG4gICAgdGhpcy5hdXRob3JpemVyID0gbmV3IGFwaWd3LkNmbkF1dGhvcml6ZXIodGhpcywgXCJBUElHYXRld2F5QXV0aG9yaXplclwiLCB7XG4gICAgICBuYW1lOiBcImNvZ25pdG8tYXV0aG9yaXplclwiLFxuICAgICAgaWRlbnRpdHlTb3VyY2U6IFwibWV0aG9kLnJlcXVlc3QuaGVhZGVyLkF1dGhvcml6YXRpb25cIixcbiAgICAgIHByb3ZpZGVyQXJuczogW2NmblVzZXJQb29sLmF0dHJBcm5dLFxuICAgICAgcmVzdEFwaUlkOiB0aGlzLmFwaS5yZXN0QXBpSWQsXG4gICAgICB0eXBlOiBhcGlndy5BdXRob3JpemF0aW9uVHlwZS5DT0dOSVRPLFxuICAgIH0pO1xuXG4gICAgY29uc3QgdXNlclBvb2xDbGllbnQgPSBuZXcgY29nbml0by5Vc2VyUG9vbENsaWVudChcbiAgICAgIHRoaXMsXG4gICAgICBcInNvc2xlYmFub24tY2xpZW50XCIsXG4gICAgICB7XG4gICAgICAgIHVzZXJQb29sQ2xpZW50TmFtZTogXCJzb3NsZWJhbm9uLWNsaWVudFwiLFxuICAgICAgICBnZW5lcmF0ZVNlY3JldDogZmFsc2UsXG4gICAgICAgIHVzZXJQb29sOiB0aGlzLnVzZXJQb29sLFxuICAgICAgfVxuICAgICk7XG4gICAgY29uc3QgaWRlbnRpdHlQb29sID0gbmV3IGNvZ25pdG8uQ2ZuSWRlbnRpdHlQb29sKFxuICAgICAgdGhpcyxcbiAgICAgIFwic29zbGViYW5vbi1pZGVudGl0eS1wb29sXCIsXG4gICAgICB7XG4gICAgICAgIGlkZW50aXR5UG9vbE5hbWU6IFwic29zbGViYW5vbi1pZGVudGl0eS1wb29sXCIsXG4gICAgICAgIGFsbG93VW5hdXRoZW50aWNhdGVkSWRlbnRpdGllczogZmFsc2UsXG4gICAgICAgIGNvZ25pdG9JZGVudGl0eVByb3ZpZGVyczogW1xuICAgICAgICAgIHtcbiAgICAgICAgICAgIGNsaWVudElkOiB1c2VyUG9vbENsaWVudC51c2VyUG9vbENsaWVudElkLFxuICAgICAgICAgICAgcHJvdmlkZXJOYW1lOiB0aGlzLnVzZXJQb29sLnVzZXJQb29sUHJvdmlkZXJOYW1lLFxuICAgICAgICAgIH0sXG4gICAgICAgIF0sXG4gICAgICB9XG4gICAgKTtcbiAgICAvLyBjb25zdCB1bmF1dGhlbnRpY2F0ZWRSb2xlID0gbmV3IGlhbS5Sb2xlKFxuICAgIC8vICAgdGhpcyxcbiAgICAvLyAgIFwiQ29nbml0b0RlZmF1bHRVbmF1dGhlbnRpY2F0ZWRSb2xlXCIsXG4gICAgLy8gICB7XG4gICAgLy8gICAgIGFzc3VtZWRCeTogbmV3IGlhbS5GZWRlcmF0ZWRQcmluY2lwYWwoXG4gICAgLy8gICAgICAgXCJjb2duaXRvLWlkZW50aXR5LmFtYXpvbmF3cy5jb21cIixcbiAgICAvLyAgICAgICB7XG4gICAgLy8gICAgICAgICBTdHJpbmdFcXVhbHM6IHtcbiAgICAvLyAgICAgICAgICAgXCJjb2duaXRvLWlkZW50aXR5LmFtYXpvbmF3cy5jb206YXVkXCI6IGlkZW50aXR5UG9vbC5yZWYsXG4gICAgLy8gICAgICAgICB9LFxuICAgIC8vICAgICAgICAgXCJGb3JBbnlWYWx1ZTpTdHJpbmdMaWtlXCI6IHtcbiAgICAvLyAgICAgICAgICAgXCJjb2duaXRvLWlkZW50aXR5LmFtYXpvbmF3cy5jb206YW1yXCI6IFwidW5hdXRoZW50aWNhdGVkXCIsXG4gICAgLy8gICAgICAgICB9LFxuICAgIC8vICAgICAgIH0sXG4gICAgLy8gICAgICAgXCJzdHM6QXNzdW1lUm9sZVdpdGhXZWJJZGVudGl0eVwiXG4gICAgLy8gICAgICksXG4gICAgLy8gICB9XG4gICAgLy8gKTtcbiAgICAvLyB1bmF1dGhlbnRpY2F0ZWRSb2xlLmFkZFRvUG9saWN5KFxuICAgIC8vICAgbmV3IFBvbGljeVN0YXRlbWVudCh7XG4gICAgLy8gICAgIGVmZmVjdDogRWZmZWN0LkFMTE9XLFxuICAgIC8vICAgICBhY3Rpb25zOiBbXCJtb2JpbGVhbmFseXRpY3M6UHV0RXZlbnRzXCIsIFwiY29nbml0by1zeW5jOipcIl0sXG4gICAgLy8gICAgIHJlc291cmNlczogW1wiKlwiXSxcbiAgICAvLyAgIH0pXG4gICAgLy8gKTtcblxuICAgIGNvbnN0IGF1dGhlbnRpY2F0ZWRSb2xlID0gbmV3IGlhbS5Sb2xlKFxuICAgICAgdGhpcyxcbiAgICAgIFwiQ29nbml0b0RlZmF1bHRBdXRoZW50aWNhdGVkUm9sZVwiLFxuICAgICAge1xuICAgICAgICBhc3N1bWVkQnk6IG5ldyBpYW0uRmVkZXJhdGVkUHJpbmNpcGFsKFxuICAgICAgICAgIFwiY29nbml0by1pZGVudGl0eS5hbWF6b25hd3MuY29tXCIsXG4gICAgICAgICAge1xuICAgICAgICAgICAgU3RyaW5nRXF1YWxzOiB7XG4gICAgICAgICAgICAgIFwiY29nbml0by1pZGVudGl0eS5hbWF6b25hd3MuY29tOmF1ZFwiOiBpZGVudGl0eVBvb2wucmVmLFxuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIFwiRm9yQW55VmFsdWU6U3RyaW5nTGlrZVwiOiB7XG4gICAgICAgICAgICAgIFwiY29nbml0by1pZGVudGl0eS5hbWF6b25hd3MuY29tOmFtclwiOiBcImF1dGhlbnRpY2F0ZWRcIixcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgfSxcbiAgICAgICAgICBcInN0czpBc3N1bWVSb2xlV2l0aFdlYklkZW50aXR5XCJcbiAgICAgICAgKSxcbiAgICAgIH1cbiAgICApO1xuXG4gICAgYXV0aGVudGljYXRlZFJvbGUuYWRkVG9Qb2xpY3koXG4gICAgICBuZXcgaWFtLlBvbGljeVN0YXRlbWVudCh7XG4gICAgICAgIGVmZmVjdDogaWFtLkVmZmVjdC5BTExPVyxcbiAgICAgICAgYWN0aW9uczogW1xuICAgICAgICAgIFwibW9iaWxlYW5hbHl0aWNzOlB1dEV2ZW50c1wiLFxuICAgICAgICAgIFwiY29nbml0by1zeW5jOipcIixcbiAgICAgICAgICBcImNvZ25pdG8taWRlbnRpdHk6KlwiLFxuICAgICAgICBdLFxuICAgICAgICByZXNvdXJjZXM6IFtcIipcIl0sXG4gICAgICB9KVxuICAgICk7XG5cbiAgICBhdXRoZW50aWNhdGVkUm9sZS5hZGRUb1BvbGljeShcbiAgICAgIG5ldyBpYW0uUG9saWN5U3RhdGVtZW50KHtcbiAgICAgICAgZWZmZWN0OiBpYW0uRWZmZWN0LkFMTE9XLFxuICAgICAgICBhY3Rpb25zOiBbXCJsYW1iZGE6SW52b2tlRnVuY3Rpb25cIl0sXG4gICAgICAgIHJlc291cmNlczogW1wiKlwiXSxcbiAgICAgIH0pXG4gICAgKTtcblxuICAgIGNvbnN0IGRlZmF1bHRQb2xpY3kgPSBuZXcgY29nbml0by5DZm5JZGVudGl0eVBvb2xSb2xlQXR0YWNobWVudChcbiAgICAgIHRoaXMsXG4gICAgICBcIklkZW50aXR5UG9vbFJvbGVNYXBwaW5nXCIsXG4gICAgICB7XG4gICAgICAgIGlkZW50aXR5UG9vbElkOiBpZGVudGl0eVBvb2wucmVmLFxuICAgICAgICByb2xlczoge1xuICAgICAgICAgIC8vIHVuYXV0aGVudGljYXRlZDogdW5hdXRoZW50aWNhdGVkUm9sZS5yb2xlQXJuLFxuICAgICAgICAgIGF1dGhlbnRpY2F0ZWQ6IGF1dGhlbnRpY2F0ZWRSb2xlLnJvbGVBcm4sXG4gICAgICAgIH0sXG4gICAgICB9XG4gICAgKTtcbiAgfVxuXG4gIGNyZWF0ZUFQSVJlc291cmNlcygpIHtcbiAgICBjb25zdCBhZG1pbkFwaVJlc291cmNlID0gdGhpcy5hcGkucm9vdC5hZGRSZXNvdXJjZShcImFkbWluXCIpO1xuICAgIGFkbWluQXBpUmVzb3VyY2UuYWRkTWV0aG9kKFxuICAgICAgXCJPUFRJT05TXCIsXG4gICAgICBkZWZhdWx0cy5tb2NrSW50ZWdyYXRpb24sXG4gICAgICBkZWZhdWx0cy5vcHRpb25zXG4gICAgKTtcblxuICAgIHRoaXMuZ2V0QWRtaW5Qb3N0c0Z1bmN0aW9uKGFkbWluQXBpUmVzb3VyY2UpOyAvLyBHRVRcbiAgICB0aGlzLmNyZWF0ZVBvc3RzRnVuY3Rpb24oYWRtaW5BcGlSZXNvdXJjZSk7IC8vIFBPU1RcbiAgICB0aGlzLmRlbGV0ZVBvc3RGdW5jdGlvbihhZG1pbkFwaVJlc291cmNlKTsgLy8gREVMRVRFXG5cbiAgICAvLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vL1xuICAgIGNvbnN0IHBvc3RBcGlSZXNvdXJjZSA9IHRoaXMuYXBpLnJvb3QuYWRkUmVzb3VyY2UoXCJwb3N0XCIpO1xuICAgIHBvc3RBcGlSZXNvdXJjZS5hZGRNZXRob2QoXG4gICAgICBcIk9QVElPTlNcIixcbiAgICAgIGRlZmF1bHRzLm1vY2tJbnRlZ3JhdGlvbixcbiAgICAgIGRlZmF1bHRzLm9wdGlvbnNcbiAgICApO1xuXG4gICAgdGhpcy5nZXRQb3N0RnVuY3Rpb24ocG9zdEFwaVJlc291cmNlKTsgLy8gR0VUXG5cbiAgICAvLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vL1xuICAgIGNvbnN0IHR5cGVBcGlSZXNvdXJjZSA9IHRoaXMuYXBpLnJvb3QuYWRkUmVzb3VyY2UoXCJ0eXBlXCIpO1xuICAgIHR5cGVBcGlSZXNvdXJjZS5hZGRNZXRob2QoXG4gICAgICBcIk9QVElPTlNcIixcbiAgICAgIGRlZmF1bHRzLm1vY2tJbnRlZ3JhdGlvbixcbiAgICAgIGRlZmF1bHRzLm9wdGlvbnNcbiAgICApO1xuXG4gICAgdGhpcy5nZXRUeXBlc0Z1bmN0aW9uKHR5cGVBcGlSZXNvdXJjZSk7IC8vIEdFVFxuXG4gICAgLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy9cbiAgICBjb25zdCBsb2NhdGlvbkFwaVJlc291cmNlID0gdGhpcy5hcGkucm9vdC5hZGRSZXNvdXJjZShcImxvY2F0aW9uXCIpO1xuICAgIGxvY2F0aW9uQXBpUmVzb3VyY2UuYWRkTWV0aG9kKFxuICAgICAgXCJPUFRJT05TXCIsXG4gICAgICBkZWZhdWx0cy5tb2NrSW50ZWdyYXRpb24sXG4gICAgICBkZWZhdWx0cy5vcHRpb25zXG4gICAgKTtcblxuICAgIHRoaXMuZ2V0TG9jYXRpb25zRnVuY3Rpb24obG9jYXRpb25BcGlSZXNvdXJjZSk7IC8vIEdFVFxuXG4gICAgLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy9cbiAgICBjb25zdCBsYXRlc3RQb3N0c0FwaVJlc291cmNlID0gdGhpcy5hcGkucm9vdC5hZGRSZXNvdXJjZShcImxhdGVzdC1wb3N0XCIpO1xuICAgIGxhdGVzdFBvc3RzQXBpUmVzb3VyY2UuYWRkTWV0aG9kKFxuICAgICAgXCJPUFRJT05TXCIsXG4gICAgICBkZWZhdWx0cy5tb2NrSW50ZWdyYXRpb24sXG4gICAgICBkZWZhdWx0cy5vcHRpb25zXG4gICAgKTtcblxuICAgIHRoaXMuZ2V0TGF0ZXN0UG9zdHNGdW5jdGlvbihsYXRlc3RQb3N0c0FwaVJlc291cmNlKTsgLy8gR0VUXG5cbiAgICAvLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vL1xuICAgIGNvbnN0IHR5cGVQb3N0QXBpUmVzb3VyY2UgPSB0aGlzLmFwaS5yb290LmFkZFJlc291cmNlKFwidHlwZS1wb3N0XCIpO1xuICAgIHR5cGVQb3N0QXBpUmVzb3VyY2UuYWRkTWV0aG9kKFxuICAgICAgXCJPUFRJT05TXCIsXG4gICAgICBkZWZhdWx0cy5tb2NrSW50ZWdyYXRpb24sXG4gICAgICBkZWZhdWx0cy5vcHRpb25zXG4gICAgKTtcblxuICAgIHRoaXMuZ2V0VHlwZVBvc3RzRnVuY3Rpb24odHlwZVBvc3RBcGlSZXNvdXJjZSk7IC8vIEdFVFxuICB9XG4gIC8vIGxhbWJkYSBmdW5jdGlvbnNcbiAgZ2V0QWRtaW5Qb3N0c0Z1bmN0aW9uKGFkbWluQXBpUmVzb3VyY2U6IGFwaWd3LlJlc291cmNlKSB7XG4gICAgY29uc3QgZ2V0VHlwZVBvc3RzID0gbmV3IGxhbWJkYS5GdW5jdGlvbih0aGlzLCBcImdldC1hZG1pbi1wb3N0c1wiLCB7XG4gICAgICBmdW5jdGlvbk5hbWU6IFwiZ2V0LWFkbWluLXBvc3RzXCIsXG4gICAgICBydW50aW1lOiBsYW1iZGEuUnVudGltZS5OT0RFSlNfMTJfWCxcbiAgICAgIGhhbmRsZXI6IFwiaW5kZXguaGFuZGxlclwiLFxuICAgICAgY29kZTogbGFtYmRhLkNvZGUuZnJvbUFzc2V0KFxuICAgICAgICBwYXRoLmpvaW4oX19kaXJuYW1lLCBcIi4uL2xhbWJkYXMvZ2V0LWFkbWluLXBvc3RzXCIpXG4gICAgICApLFxuICAgICAgZW52aXJvbm1lbnQ6IHtcbiAgICAgICAgUE9TVFNfVEFCTEU6IHRoaXMucG9zdHNUYWJsZS50YWJsZU5hbWUsXG4gICAgICB9LFxuICAgIH0pO1xuXG4gICAgdGhpcy5wb3N0c1RhYmxlLmdyYW50UmVhZERhdGEoZ2V0VHlwZVBvc3RzKTtcblxuICAgIGFkbWluQXBpUmVzb3VyY2UuYWRkTWV0aG9kKFxuICAgICAgXCJHRVRcIixcbiAgICAgIGRlZmF1bHRzLmxhbWJkYUludGVncmF0aW9uKGdldFR5cGVQb3N0cywge1xuICAgICAgICBcImFwcGxpY2F0aW9uL2pzb25cIjogJ3tcXG5cInN1YlwiOiBcIiRjb250ZXh0LmF1dGhvcml6ZXIuY2xhaW1zLnN1YlwiXFxufScsXG4gICAgICB9KSxcbiAgICAgIHtcbiAgICAgICAgLi4uZGVmYXVsdHMub3B0aW9ucyxcbiAgICAgICAgYXV0aG9yaXphdGlvblR5cGU6IGFwaWd3LkF1dGhvcml6YXRpb25UeXBlLkNPR05JVE8sXG4gICAgICAgIGF1dGhvcml6ZXI6IHsgYXV0aG9yaXplcklkOiB0aGlzLmF1dGhvcml6ZXIucmVmIH0sXG4gICAgICB9XG4gICAgKTtcbiAgfVxuXG4gIGNyZWF0ZVBvc3RzRnVuY3Rpb24oYWRtaW5BcGlSZXNvdXJjZTogYXBpZ3cuUmVzb3VyY2UpIHtcbiAgICBjb25zdCBjcmVhdGVQb3N0ID0gbmV3IGxhbWJkYS5GdW5jdGlvbih0aGlzLCBcImNyZWF0ZS1wb3N0XCIsIHtcbiAgICAgIGZ1bmN0aW9uTmFtZTogXCJjcmVhdGUtcG9zdFwiLFxuICAgICAgcnVudGltZTogbGFtYmRhLlJ1bnRpbWUuTk9ERUpTXzEyX1gsXG4gICAgICBoYW5kbGVyOiBcImluZGV4LmhhbmRsZXJcIixcbiAgICAgIGNvZGU6IGxhbWJkYS5Db2RlLmZyb21Bc3NldChcbiAgICAgICAgcGF0aC5qb2luKF9fZGlybmFtZSwgXCIuLi9sYW1iZGFzL2NyZWF0ZS1wb3N0XCIpXG4gICAgICApLFxuICAgICAgZW52aXJvbm1lbnQ6IHtcbiAgICAgICAgUE9TVFNfVEFCTEU6IHRoaXMucG9zdHNUYWJsZS50YWJsZU5hbWUsXG4gICAgICB9LFxuICAgIH0pO1xuXG4gICAgdGhpcy5wb3N0c1RhYmxlLmdyYW50UmVhZFdyaXRlRGF0YShjcmVhdGVQb3N0KTtcblxuICAgIGFkbWluQXBpUmVzb3VyY2UuYWRkTWV0aG9kKFxuICAgICAgXCJQT1NUXCIsXG4gICAgICBkZWZhdWx0cy5sYW1iZGFJbnRlZ3JhdGlvbihjcmVhdGVQb3N0LCB7XG4gICAgICAgIFwiYXBwbGljYXRpb24vanNvblwiOlxuICAgICAgICAgICd7XFxuXCJyZXF1ZXN0Qm9keVwiOiAkaW5wdXQuYm9keSxcXG5cInN1YlwiOiBcIiRjb250ZXh0LmF1dGhvcml6ZXIuY2xhaW1zLnN1YlwiXFxufScsXG4gICAgICB9KSxcbiAgICAgIHtcbiAgICAgICAgLi4uZGVmYXVsdHMub3B0aW9ucyxcbiAgICAgICAgYXV0aG9yaXphdGlvblR5cGU6IGFwaWd3LkF1dGhvcml6YXRpb25UeXBlLkNPR05JVE8sXG4gICAgICAgIGF1dGhvcml6ZXI6IHsgYXV0aG9yaXplcklkOiB0aGlzLmF1dGhvcml6ZXIucmVmIH0sXG4gICAgICB9XG4gICAgKTtcbiAgfVxuXG4gIGRlbGV0ZVBvc3RGdW5jdGlvbihhZG1pbkFwaVJlc291cmNlOiBhcGlndy5SZXNvdXJjZSkge1xuICAgIGNvbnN0IGdldFR5cGVQb3N0cyA9IG5ldyBsYW1iZGEuRnVuY3Rpb24odGhpcywgXCJkZWxldGUtcG9zdFwiLCB7XG4gICAgICBmdW5jdGlvbk5hbWU6IFwiZGVsZXRlLXBvc3RcIixcbiAgICAgIHJ1bnRpbWU6IGxhbWJkYS5SdW50aW1lLk5PREVKU18xMl9YLFxuICAgICAgaGFuZGxlcjogXCJpbmRleC5oYW5kbGVyXCIsXG4gICAgICBjb2RlOiBsYW1iZGEuQ29kZS5mcm9tQXNzZXQoXG4gICAgICAgIHBhdGguam9pbihfX2Rpcm5hbWUsIFwiLi4vbGFtYmRhcy9kZWxldGUtcG9zdFwiKVxuICAgICAgKSxcbiAgICAgIGVudmlyb25tZW50OiB7XG4gICAgICAgIFBPU1RTX1RBQkxFOiB0aGlzLnBvc3RzVGFibGUudGFibGVOYW1lLFxuICAgICAgfSxcbiAgICB9KTtcblxuICAgIHRoaXMucG9zdHNUYWJsZS5ncmFudFdyaXRlRGF0YShnZXRUeXBlUG9zdHMpO1xuXG4gICAgYWRtaW5BcGlSZXNvdXJjZS5hZGRNZXRob2QoXG4gICAgICBcIkRFTEVURVwiLFxuICAgICAgZGVmYXVsdHMubGFtYmRhSW50ZWdyYXRpb24oZ2V0VHlwZVBvc3RzLCB7XG4gICAgICAgIFwiYXBwbGljYXRpb24vanNvblwiOiBgXG4gICAgICAgICAgICAjc2V0KCRoYXNJZCA9ICRpbnB1dC5wYXJhbXMoJ2lkJykpXG4gICAgICAgICAgICB7XG4gICAgICAgICAgICAgIFwic3ViXCI6IFwiJGNvbnRleHQuYXV0aG9yaXplci5jbGFpbXMuc3ViXCJcbiAgICAgICAgICAgICAgI2lmKCRoYXNJZCAhPSBcIlwiKSwgXCJpZFwiIDogXCIkaW5wdXQucGFyYW1zKCdpZCcpXCIjZW5kXG4gICAgICAgICAgICB9XG4gICAgICAgICAgYCxcbiAgICAgIH0pLFxuICAgICAge1xuICAgICAgICAuLi5kZWZhdWx0cy5vcHRpb25zLFxuICAgICAgICBhdXRob3JpemF0aW9uVHlwZTogYXBpZ3cuQXV0aG9yaXphdGlvblR5cGUuQ09HTklUTyxcbiAgICAgICAgYXV0aG9yaXplcjogeyBhdXRob3JpemVySWQ6IHRoaXMuYXV0aG9yaXplci5yZWYgfSxcbiAgICAgIH1cbiAgICApO1xuICB9XG5cbiAgZ2V0TGF0ZXN0UG9zdHNGdW5jdGlvbihsYXRlc3RQb3N0c0FwaVJlc291cmNlOiBhcGlndy5SZXNvdXJjZSkge1xuICAgIGNvbnN0IGdldFR5cGVQb3N0cyA9IG5ldyBsYW1iZGEuRnVuY3Rpb24odGhpcywgXCJnZXQtbGF0ZXN0LXBvc3RzXCIsIHtcbiAgICAgIGZ1bmN0aW9uTmFtZTogXCJnZXQtbGF0ZXN0LXBvc3RzXCIsXG4gICAgICBydW50aW1lOiBsYW1iZGEuUnVudGltZS5OT0RFSlNfMTJfWCxcbiAgICAgIGhhbmRsZXI6IFwiaW5kZXguaGFuZGxlclwiLFxuICAgICAgY29kZTogbGFtYmRhLkNvZGUuZnJvbUFzc2V0KFxuICAgICAgICBwYXRoLmpvaW4oX19kaXJuYW1lLCBcIi4uL2xhbWJkYXMvZ2V0LWxhdGVzdC1wb3N0c1wiKVxuICAgICAgKSxcbiAgICAgIGVudmlyb25tZW50OiB7XG4gICAgICAgIFBPU1RTX1RBQkxFOiB0aGlzLnBvc3RzVGFibGUudGFibGVOYW1lLFxuICAgICAgICBpZGVudGl0eVBvb2xJZDogdGhpcy51c2VyUG9vbC51c2VyUG9vbElkLFxuICAgICAgfSxcbiAgICB9KTtcblxuICAgIHRoaXMucG9zdHNUYWJsZS5ncmFudFJlYWREYXRhKGdldFR5cGVQb3N0cyk7XG5cbiAgICBsYXRlc3RQb3N0c0FwaVJlc291cmNlLmFkZE1ldGhvZChcbiAgICAgIFwiR0VUXCIsXG4gICAgICBkZWZhdWx0cy5sYW1iZGFJbnRlZ3JhdGlvbihnZXRUeXBlUG9zdHMsIHtcbiAgICAgICAgXCJhcHBsaWNhdGlvbi9qc29uXCI6IGBcbiAgICAgICAgI3NldCgkaGFzTGFzdEV2YWx1YXRlZEtleSA9ICRpbnB1dC5wYXJhbXMoJ0xhc3RFdmFsdWF0ZWRLZXknKSlcbiAgICAgICAgI3NldCgkaGFzTGltaXQgPSAkaW5wdXQucGFyYW1zKCdsaW1pdCcpKVxuICAgICAgICAjc2V0KCRoYXNUeXBlSWQgPSAkaW5wdXQucGFyYW1zKCd0eXBlSWQnKSlcbiAgICAgICAgI3NldCgkaGFzS2V5d29yZCA9ICRpbnB1dC5wYXJhbXMoJ2tleXdvcmQnKSlcbiAgICAgICAge1xuICAgICAgICAjaWYoJGhhc0xpbWl0ICE9IFwiXCIpIFwibGltaXRcIiA6IFwiJGlucHV0LnBhcmFtcygnbGltaXQnKVwiI2VuZFxuICAgICAgICAjaWYoJGhhc1R5cGVJZCAhPSBcIlwiKSwgXCJ0eXBlSWRcIiA6IFwiJGlucHV0LnBhcmFtcygndHlwZUlkJylcIiNlbmRcbiAgICAgICAgI2lmKCRoYXNLZXl3b3JkICE9IFwiXCIpLCBcImtleXdvcmRcIiA6IFwiJGlucHV0LnBhcmFtcygna2V5d29yZCcpXCIjZW5kXG4gICAgICAgICNpZigkaGFzTGFzdEV2YWx1YXRlZEtleSAhPSBcIlwiKSwgXCJMYXN0RXZhbHVhdGVkS2V5XCIgOiBcIiRpbnB1dC5wYXJhbXMoJ0xhc3RFdmFsdWF0ZWRLZXknKVwiI2VuZFxuICAgICAgICB9XG4gICAgICAgIGAsXG4gICAgICB9KSxcbiAgICAgIGRlZmF1bHRzLm9wdGlvbnNcbiAgICApO1xuICB9XG5cbiAgZ2V0UG9zdEZ1bmN0aW9uKHBvc3RBcGlSZXNvdXJjZTogYXBpZ3cuUmVzb3VyY2UpIHtcbiAgICBjb25zdCBnZXRQb3N0ID0gbmV3IGxhbWJkYS5GdW5jdGlvbih0aGlzLCBcImdldC1wb3N0XCIsIHtcbiAgICAgIGZ1bmN0aW9uTmFtZTogXCJnZXQtcG9zdFwiLFxuICAgICAgcnVudGltZTogbGFtYmRhLlJ1bnRpbWUuTk9ERUpTXzEyX1gsXG4gICAgICBoYW5kbGVyOiBcImluZGV4LmhhbmRsZXJcIixcbiAgICAgIGNvZGU6IGxhbWJkYS5Db2RlLmZyb21Bc3NldChwYXRoLmpvaW4oX19kaXJuYW1lLCBcIi4uL2xhbWJkYXMvZ2V0LXBvc3RcIikpLFxuICAgICAgZW52aXJvbm1lbnQ6IHtcbiAgICAgICAgUE9TVFNfVEFCTEU6IHRoaXMucG9zdHNUYWJsZS50YWJsZU5hbWUsXG4gICAgICB9LFxuICAgIH0pO1xuXG4gICAgdGhpcy5wb3N0c1RhYmxlLmdyYW50UmVhZERhdGEoZ2V0UG9zdCk7XG5cbiAgICBwb3N0QXBpUmVzb3VyY2UuYWRkTWV0aG9kKFxuICAgICAgXCJHRVRcIixcbiAgICAgIGRlZmF1bHRzLmxhbWJkYUludGVncmF0aW9uKGdldFBvc3QsIHtcbiAgICAgICAgXCJhcHBsaWNhdGlvbi9qc29uXCI6IGBcbiAgICAgICAgICAjc2V0KCRoYXNJZCA9ICRpbnB1dC5wYXJhbXMoJ2lkJykpXG4gICAgICAgICAge1xuICAgICAgICAgICAgI2lmKCRoYXNJZCAhPSBcIlwiKSBcImlkXCIgOiBcIiRpbnB1dC5wYXJhbXMoJ2lkJylcIiNlbmRcbiAgICAgICAgICB9XG4gICAgICAgIGAsXG4gICAgICB9KSxcbiAgICAgIGRlZmF1bHRzLm9wdGlvbnNcbiAgICApO1xuICB9XG5cbiAgZ2V0VHlwZXNGdW5jdGlvbih0eXBlQXBpUmVzb3VyY2U6IGFwaWd3LlJlc291cmNlKSB7XG4gICAgY29uc3QgZ2V0VHlwZXMgPSBuZXcgbGFtYmRhLkZ1bmN0aW9uKHRoaXMsIFwiZ2V0LXR5cGVzXCIsIHtcbiAgICAgIGZ1bmN0aW9uTmFtZTogXCJnZXQtdHlwZXNcIixcbiAgICAgIHJ1bnRpbWU6IGxhbWJkYS5SdW50aW1lLk5PREVKU18xMl9YLFxuICAgICAgaGFuZGxlcjogXCJpbmRleC5oYW5kbGVyXCIsXG4gICAgICBjb2RlOiBsYW1iZGEuQ29kZS5mcm9tQXNzZXQocGF0aC5qb2luKF9fZGlybmFtZSwgXCIuLi9sYW1iZGFzL2dldC10eXBlc1wiKSksXG4gICAgICBlbnZpcm9ubWVudDoge1xuICAgICAgICBTRVRUSU5HU19UQUJMRTogdGhpcy5zZXR0aW5nc1RhYmxlLnRhYmxlTmFtZSxcbiAgICAgIH0sXG4gICAgfSk7XG5cbiAgICB0aGlzLnNldHRpbmdzVGFibGUuZ3JhbnRSZWFkRGF0YShnZXRUeXBlcyk7XG5cbiAgICB0eXBlQXBpUmVzb3VyY2UuYWRkTWV0aG9kKFxuICAgICAgXCJHRVRcIixcbiAgICAgIGRlZmF1bHRzLmxhbWJkYUludGVncmF0aW9uKGdldFR5cGVzLCB7fSksXG4gICAgICBkZWZhdWx0cy5vcHRpb25zXG4gICAgKTtcbiAgfVxuXG4gIGdldExvY2F0aW9uc0Z1bmN0aW9uKGxvY2F0aW9uQXBpUmVzb3VyY2U6IGFwaWd3LlJlc291cmNlKSB7XG4gICAgY29uc3QgZ2V0TG9jYXRpb25zID0gbmV3IGxhbWJkYS5GdW5jdGlvbih0aGlzLCBcImdldC1sb2NhdGlvbnNcIiwge1xuICAgICAgZnVuY3Rpb25OYW1lOiBcImdldC1sb2NhdGlvbnNcIixcbiAgICAgIHJ1bnRpbWU6IGxhbWJkYS5SdW50aW1lLk5PREVKU18xMl9YLFxuICAgICAgaGFuZGxlcjogXCJpbmRleC5oYW5kbGVyXCIsXG4gICAgICBjb2RlOiBsYW1iZGEuQ29kZS5mcm9tQXNzZXQoXG4gICAgICAgIHBhdGguam9pbihfX2Rpcm5hbWUsIFwiLi4vbGFtYmRhcy9nZXQtbG9jYXRpb25zXCIpXG4gICAgICApLFxuICAgICAgZW52aXJvbm1lbnQ6IHtcbiAgICAgICAgU0VUVElOR1NfVEFCTEU6IHRoaXMuc2V0dGluZ3NUYWJsZS50YWJsZU5hbWUsXG4gICAgICB9LFxuICAgIH0pO1xuXG4gICAgdGhpcy5zZXR0aW5nc1RhYmxlLmdyYW50UmVhZERhdGEoZ2V0TG9jYXRpb25zKTtcblxuICAgIGxvY2F0aW9uQXBpUmVzb3VyY2UuYWRkTWV0aG9kKFxuICAgICAgXCJHRVRcIixcbiAgICAgIGRlZmF1bHRzLmxhbWJkYUludGVncmF0aW9uKGdldExvY2F0aW9ucywge30pLFxuICAgICAgZGVmYXVsdHMub3B0aW9uc1xuICAgICk7XG4gIH1cblxuICBnZXRUeXBlUG9zdHNGdW5jdGlvbihwb3N0QXBpUmVzb3VyY2U6IGFwaWd3LlJlc291cmNlKSB7XG4gICAgY29uc3QgZ2V0VHlwZVBvc3RzID0gbmV3IGxhbWJkYS5GdW5jdGlvbih0aGlzLCBcImdldC10eXBlLXBvc3RzXCIsIHtcbiAgICAgIGZ1bmN0aW9uTmFtZTogXCJnZXQtdHlwZS1wb3N0c1wiLFxuICAgICAgcnVudGltZTogbGFtYmRhLlJ1bnRpbWUuTk9ERUpTXzEyX1gsXG4gICAgICBoYW5kbGVyOiBcImluZGV4LmhhbmRsZXJcIixcbiAgICAgIGNvZGU6IGxhbWJkYS5Db2RlLmZyb21Bc3NldChcbiAgICAgICAgcGF0aC5qb2luKF9fZGlybmFtZSwgXCIuLi9sYW1iZGFzL2dldC10eXBlLXBvc3RzXCIpXG4gICAgICApLFxuICAgICAgZW52aXJvbm1lbnQ6IHtcbiAgICAgICAgUE9TVFNfVEFCTEU6IHRoaXMucG9zdHNUYWJsZS50YWJsZU5hbWUsXG4gICAgICB9LFxuICAgIH0pO1xuXG4gICAgdGhpcy5wb3N0c1RhYmxlLmdyYW50UmVhZERhdGEoZ2V0VHlwZVBvc3RzKTtcblxuICAgIHBvc3RBcGlSZXNvdXJjZS5hZGRNZXRob2QoXG4gICAgICBcIkdFVFwiLFxuICAgICAgZGVmYXVsdHMubGFtYmRhSW50ZWdyYXRpb24oZ2V0VHlwZVBvc3RzLCB7XG4gICAgICAgIFwiYXBwbGljYXRpb24vanNvblwiOiBgXG4gICAgICAgICNzZXQoJGhhc1R5cGVJZCA9ICRpbnB1dC5wYXJhbXMoJ3R5cGVJZCcpKVxuICAgICAgICAjc2V0KCRoYXNMYXN0RXZhbHVhdGVkS2V5ID0gJGlucHV0LnBhcmFtcygnTGFzdEV2YWx1YXRlZEtleScpKVxuICAgICAgICAjc2V0KCRoYXNMaW1pdCA9ICRpbnB1dC5wYXJhbXMoJ2xpbWl0JykpXG4gICAgICAgIHtcbiAgICAgICAgICAjaWYoJGhhc1R5cGVJZCAhPSBcIlwiKSBcInR5cGVJZFwiIDogXCIkaW5wdXQucGFyYW1zKCd0eXBlSWQnKVwiI2VuZFxuICAgICAgICAgICNpZigkaGFzTGltaXQgIT0gXCJcIiksXCJsaW1pdFwiIDogXCIkaW5wdXQucGFyYW1zKCdsaW1pdCcpXCIjZW5kXG4gICAgICAgICAgI2lmKCRoYXNMYXN0RXZhbHVhdGVkS2V5ICE9IFwiXCIpLFwiTGFzdEV2YWx1YXRlZEtleVwiOiBcIiRpbnB1dC5wYXJhbXMoJ0xhc3RFdmFsdWF0ZWRLZXknKVwiI2VuZFxuICAgICAgICB9XG4gICAgICBgLFxuICAgICAgfSksXG4gICAgICBkZWZhdWx0cy5vcHRpb25zXG4gICAgKTtcbiAgfVxufVxuIl19