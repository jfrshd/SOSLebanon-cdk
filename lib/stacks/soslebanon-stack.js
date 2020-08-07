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
        this.typesTable = new dynamodb.Table(this, "types-table", {
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
        const latestPostsApiResource = this.api.root.addResource("latest-post");
        latestPostsApiResource.addMethod("OPTIONS", defaults.mockIntegration, defaults.options);
        this.getLatestPostsFunction(latestPostsApiResource); // GET
        ///////////////////////////////////////////////////////////////////////////////////
        const typePostApiResource = this.api.root.addResource("type-post");
        typePostApiResource.addMethod("OPTIONS", defaults.mockIntegration, defaults.options);
        this.getTypePostsFunction(typePostApiResource); // GET
    }
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
            },
        });
        this.postsTable.grantReadData(getTypePosts);
        latestPostsApiResource.addMethod("GET", defaults.lambdaIntegration(getTypePosts, {
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
                TYPES_TABLE: this.typesTable.tableName,
            },
        });
        this.typesTable.grantReadData(getTypes);
        typeApiResource.addMethod("GET", defaults.lambdaIntegration(getTypes, {}), defaults.options);
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic29zbGViYW5vbi1zdGFjay5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbInNvc2xlYmFub24tc3RhY2sudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7QUFBQSxxQ0FBcUM7QUFDckMsa0RBQWtEO0FBQ2xELDhDQUE4QztBQUU5QyxpREFBaUQ7QUFDakQsZ0RBQWdEO0FBQ2hELHdDQUF3QztBQUN4Qyx3Q0FBd0M7QUFDeEMsNkJBQTZCO0FBQzdCLCtDQUErQztBQUMvQyx3Q0FBNkQ7QUFJN0QsTUFBYSxlQUFnQixTQUFRLEdBQUcsQ0FBQyxLQUFLO0lBTTVDLFlBQVksS0FBb0IsRUFBRSxFQUFVLEVBQUUsS0FBc0I7UUFDbEUsS0FBSyxDQUFDLEtBQUssRUFBRSxFQUFFLEVBQUUsS0FBSyxDQUFDLENBQUM7UUFFeEIsSUFBSSxDQUFDLEdBQUcsR0FBRyxJQUFJLEtBQUssQ0FBQyxPQUFPLENBQUMsSUFBSSxFQUFFLGVBQWUsQ0FBQyxDQUFDO1FBRXBELElBQUksQ0FBQyxhQUFhLEVBQUUsQ0FBQztRQUVyQixJQUFJLENBQUMsZ0JBQWdCLEVBQUUsQ0FBQztRQUV4QixJQUFJLENBQUMsVUFBVSxHQUFHLElBQUksUUFBUSxDQUFDLEtBQUssQ0FBQyxJQUFJLEVBQUUsYUFBYSxFQUFFO1lBQ3hELFNBQVMsRUFBRSxhQUFhO1lBQ3hCLFlBQVksRUFBRSxFQUFFLElBQUksRUFBRSxJQUFJLEVBQUUsSUFBSSxFQUFFLFFBQVEsQ0FBQyxhQUFhLENBQUMsTUFBTSxFQUFFO1lBQ2pFLFdBQVcsRUFBRSxRQUFRLENBQUMsV0FBVyxDQUFDLGVBQWU7U0FDbEQsQ0FBQyxDQUFDO1FBRUgsSUFBSSxDQUFDLGtCQUFrQixFQUFFLENBQUM7SUFDNUIsQ0FBQztJQUVELGdCQUFnQjtRQUNkLElBQUksQ0FBQyxVQUFVLEdBQUcsSUFBSSxRQUFRLENBQUMsS0FBSyxDQUFDLElBQUksRUFBRSxhQUFhLEVBQUU7WUFDeEQsU0FBUyxFQUFFLGFBQWE7WUFDeEIsWUFBWSxF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RjtBQW5kRCwwQ0FtZEMiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgKiBhcyBjZGsgZnJvbSBcIkBhd3MtY2RrL2NvcmVcIjtcbmltcG9ydCAqIGFzIGR5bmFtb2RiIGZyb20gXCJAYXdzLWNkay9hd3MtZHluYW1vZGJcIjtcbmltcG9ydCAqIGFzIGxhbWJkYSBmcm9tIFwiQGF3cy1jZGsvYXdzLWxhbWJkYVwiO1xuaW1wb3J0ICogYXMgczMgZnJvbSBcIkBhd3MtY2RrL2F3cy1zM1wiO1xuaW1wb3J0ICogYXMgYXBpZ3cgZnJvbSBcIkBhd3MtY2RrL2F3cy1hcGlnYXRld2F5XCI7XG5pbXBvcnQgKiBhcyBjb2duaXRvIGZyb20gXCJAYXdzLWNkay9hd3MtY29nbml0b1wiO1xuaW1wb3J0ICogYXMgaWFtIGZyb20gXCJAYXdzLWNkay9hd3MtaWFtXCI7XG5pbXBvcnQgKiBhcyBzZXMgZnJvbSBcIkBhd3MtY2RrL2F3cy1zZXNcIjtcbmltcG9ydCAqIGFzIHBhdGggZnJvbSBcInBhdGhcIjtcbmltcG9ydCAqIGFzIGRlZmF1bHRzIGZyb20gXCIuLi9leHRyYXMvZGVmYXVsdHNcIjtcbmltcG9ydCB7IFJlbW92YWxQb2xpY3ksIFRhZywgRHVyYXRpb24gfSBmcm9tIFwiQGF3cy1jZGsvY29yZVwiO1xuaW1wb3J0IHsgTWZhLCBVc2VyUG9vbCB9IGZyb20gXCJAYXdzLWNkay9hd3MtY29nbml0b1wiO1xuaW1wb3J0IHsgSUZ1bmN0aW9uIH0gZnJvbSBcIkBhd3MtY2RrL2F3cy1sYW1iZGFcIjtcblxuZXhwb3J0IGNsYXNzIFNvc2xlYmFub25TdGFjayBleHRlbmRzIGNkay5TdGFjayB7XG4gIGFwaTogYXBpZ3cuUmVzdEFwaTtcbiAgcG9zdHNUYWJsZTogZHluYW1vZGIuVGFibGU7XG4gIHR5cGVzVGFibGU6IGR5bmFtb2RiLlRhYmxlO1xuICBhdXRob3JpemVyOiBhcGlndy5DZm5BdXRob3JpemVyO1xuXG4gIGNvbnN0cnVjdG9yKHNjb3BlOiBjZGsuQ29uc3RydWN0LCBpZDogc3RyaW5nLCBwcm9wcz86IGNkay5TdGFja1Byb3BzKSB7XG4gICAgc3VwZXIoc2NvcGUsIGlkLCBwcm9wcyk7XG5cbiAgICB0aGlzLmFwaSA9IG5ldyBhcGlndy5SZXN0QXBpKHRoaXMsIFwiU09TTGViYW5vbkFQSVwiKTtcblxuICAgIHRoaXMuY3JlYXRlQ29nbml0bygpO1xuXG4gICAgdGhpcy5jcmVhdGVQb3N0c1RhYmxlKCk7XG5cbiAgICB0aGlzLnR5cGVzVGFibGUgPSBuZXcgZHluYW1vZGIuVGFibGUodGhpcywgXCJ0eXBlcy10YWJsZVwiLCB7XG4gICAgICB0YWJsZU5hbWU6IFwidHlwZXMtdGFibGVcIixcbiAgICAgIHBhcnRpdGlvbktleTogeyBuYW1lOiBcInBrXCIsIHR5cGU6IGR5bmFtb2RiLkF0dHJpYnV0ZVR5cGUuU1RSSU5HIH0sXG4gICAgICBiaWxsaW5nTW9kZTogZHluYW1vZGIuQmlsbGluZ01vZGUuUEFZX1BFUl9SRVFVRVNULFxuICAgIH0pO1xuXG4gICAgdGhpcy5jcmVhdGVBUElSZXNvdXJjZXMoKTtcbiAgfVxuXG4gIGNyZWF0ZVBvc3RzVGFibGUoKTogdm9pZCB7XG4gICAgdGhpcy5wb3N0c1RhYmxlID0gbmV3IGR5bmFtb2RiLlRhYmxlKHRoaXMsIFwicG9zdHMtdGFibGVcIiwge1xuICAgICAgdGFibGVOYW1lOiBcInBvc3RzLXRhYmxlXCIsXG4gICAgICBwYXJ0aXRpb25LZXk6IHsgbmFtZTogXCJwa1wiLCB0eXBlOiBkeW5hbW9kYi5BdHRyaWJ1dGVUeXBlLlNUUklORyB9LFxuICAgICAgc29ydEtleToge1xuICAgICAgICBuYW1lOiBcImlkXCIsXG4gICAgICAgIHR5cGU6IGR5bmFtb2RiLkF0dHJpYnV0ZVR5cGUuU1RSSU5HLFxuICAgICAgfSxcbiAgICAgIGJpbGxpbmdNb2RlOiBkeW5hbW9kYi5CaWxsaW5nTW9kZS5QQVlfUEVSX1JFUVVFU1QsXG4gICAgICAvLyByZWFkQ2FwYWNpdHk6IDUsXG4gICAgICAvLyB3cml0ZUNhcGFjaXR5OiA1LFxuICAgIH0pO1xuICAgIHRoaXMucG9zdHNUYWJsZS5hZGRMb2NhbFNlY29uZGFyeUluZGV4KHtcbiAgICAgIGluZGV4TmFtZTogXCJjcmVhdGlvbkRhdGVcIixcbiAgICAgIHNvcnRLZXk6IHtcbiAgICAgICAgbmFtZTogXCJjcmVhdGlvbkRhdGVcIixcbiAgICAgICAgdHlwZTogZHluYW1vZGIuQXR0cmlidXRlVHlwZS5OVU1CRVIsXG4gICAgICB9LFxuICAgIH0pO1xuICAgIHRoaXMucG9zdHNUYWJsZS5hZGRMb2NhbFNlY29uZGFyeUluZGV4KHtcbiAgICAgIGluZGV4TmFtZTogXCJ0eXBlSWRcIixcbiAgICAgIHNvcnRLZXk6IHtcbiAgICAgICAgbmFtZTogXCJ0eXBlSWRcIixcbiAgICAgICAgdHlwZTogZHluYW1vZGIuQXR0cmlidXRlVHlwZS5TVFJJTkcsXG4gICAgICB9LFxuICAgIH0pO1xuICB9XG5cbiAgY3JlYXRlQ29nbml0bygpOiB2b2lkIHtcbiAgICBjb25zdCBjb25mU2V0ID0gbmV3IHNlcy5DZm5Db25maWd1cmF0aW9uU2V0KHRoaXMsIFwic29zbGViYW5vbi1jb25mLXNldFwiLCB7XG4gICAgICBuYW1lOiBcInNvc2xlYmFub24tc2VzLWNvbmYtc2V0XCIsXG4gICAgfSk7XG5cbiAgICBjb25zdCB1c2VyUG9vbCA9IG5ldyBjb2duaXRvLlVzZXJQb29sKHRoaXMsIFwic29zbGViYW5vbi11c2VyLXBvb2xcIiwge1xuICAgICAgdXNlclBvb2xOYW1lOiBcInNvc2xlYmFub24tdXNlci1wb29sXCIsXG4gICAgICBzZWxmU2lnblVwRW5hYmxlZDogdHJ1ZSxcbiAgICAgIHNpZ25JbkFsaWFzZXM6IHtcbiAgICAgICAgdXNlcm5hbWU6IGZhbHNlLFxuICAgICAgICBlbWFpbDogdHJ1ZSxcbiAgICAgIH0sXG4gICAgICBzdGFuZGFyZEF0dHJpYnV0ZXM6IHtcbiAgICAgICAgZ2l2ZW5OYW1lOiB7IG11dGFibGU6IHRydWUsIHJlcXVpcmVkOiB0cnVlIH0sXG4gICAgICAgIGZhbWlseU5hbWU6IHsgbXV0YWJsZTogdHJ1ZSwgcmVxdWlyZWQ6IHRydWUgfSxcbiAgICAgICAgZW1haWw6IHsgbXV0YWJsZTogdHJ1ZSwgcmVxdWlyZWQ6IHRydWUgfSxcbiAgICAgICAgcGhvbmVOdW1iZXI6IHsgbXV0YWJsZTogdHJ1ZSwgcmVxdWlyZWQ6IHRydWUgfSxcbiAgICAgICAgYWRkcmVzczogeyBtdXRhYmxlOiB0cnVlLCByZXF1aXJlZDogdHJ1ZSB9LFxuICAgICAgfSxcbiAgICAgIGN1c3RvbUF0dHJpYnV0ZXM6IHtcbiAgICAgICAgdHlwZTogbmV3IGNvZ25pdG8uU3RyaW5nQXR0cmlidXRlKHsgbXV0YWJsZTogdHJ1ZSB9KSxcbiAgICAgIH0sXG4gICAgICBhdXRvVmVyaWZ5OiB7XG4gICAgICAgIGVtYWlsOiB0cnVlLFxuICAgICAgICBwaG9uZTogdHJ1ZSxcbiAgICAgIH0sXG4gICAgICBwYXNzd29yZFBvbGljeToge1xuICAgICAgICBtaW5MZW5ndGg6IDgsXG4gICAgICAgIHJlcXVpcmVMb3dlcmNhc2U6IGZhbHNlLFxuICAgICAgICByZXF1aXJlRGlnaXRzOiBmYWxzZSxcbiAgICAgICAgcmVxdWlyZVN5bWJvbHM6IGZhbHNlLFxuICAgICAgICByZXF1aXJlVXBwZXJjYXNlOiBmYWxzZSxcbiAgICAgICAgdGVtcFBhc3N3b3JkVmFsaWRpdHk6IER1cmF0aW9uLmRheXMoNyksXG4gICAgICB9LFxuICAgICAgLy8gZW1haWxTZXR0aW5nczoge1xuICAgICAgLy8gICBmcm9tOiBcImhlbHBkZXNrQHNvc2xlYmFub24uY29tXCIsXG4gICAgICAvLyAgIHJlcGx5VG86IFwiaGVscGRlc2tAc29zbGViYW5vbi5jb21cIixcbiAgICAgIC8vIH0sXG4gICAgICBzaWduSW5DYXNlU2Vuc2l0aXZlOiB0cnVlLFxuICAgICAgYWNjb3VudFJlY292ZXJ5OiBjb2duaXRvLkFjY291bnRSZWNvdmVyeS5FTUFJTF9PTkxZLFxuICAgIH0pO1xuXG4gICAgY29uc3QgY2ZuVXNlclBvb2wgPSB1c2VyUG9vbC5ub2RlLmRlZmF1bHRDaGlsZCBhcyBjb2duaXRvLkNmblVzZXJQb29sO1xuICAgIC8vIGNmblVzZXJQb29sLmVtYWlsQ29uZmlndXJhdGlvbiA9IHtcbiAgICAvLyAgIGNvbmZpZ3VyYXRpb25TZXQ6IGNvbmZTZXQucmVmLFxuICAgIC8vICAgZW1haWxTZW5kaW5nQWNjb3VudDogXCJERVZFTE9QRVJcIixcbiAgICAvLyAgIGZyb206IFwiaGVscGRlc2tAc29zbGViYW5vbi5jb21cIixcbiAgICAvLyAgIHJlcGx5VG9FbWFpbEFkZHJlc3M6IFwiaGVscGRlc2tAc29zbGViYW5vbi5jb21cIixcbiAgICAvLyAgIHNvdXJjZUFybjpcbiAgICAvLyAgICAgXCJhcm46YXdzOnNlczpldS13ZXN0LTE6MjE4NTYxODYxNTgzOmlkZW50aXR5L2hlbHBkZXNrQHNvc2xlYmFub24uY29tXCIsXG4gICAgLy8gfTtcblxuICAgIHRoaXMuYXV0aG9yaXplciA9IG5ldyBhcGlndy5DZm5BdXRob3JpemVyKHRoaXMsIFwiQVBJR2F0ZXdheUF1dGhvcml6ZXJcIiwge1xuICAgICAgbmFtZTogXCJjb2duaXRvLWF1dGhvcml6ZXJcIixcbiAgICAgIGlkZW50aXR5U291cmNlOiBcIm1ldGhvZC5yZXF1ZXN0LmhlYWRlci5BdXRob3JpemF0aW9uXCIsXG4gICAgICBwcm92aWRlckFybnM6IFtjZm5Vc2VyUG9vbC5hdHRyQXJuXSxcbiAgICAgIHJlc3RBcGlJZDogdGhpcy5hcGkucmVzdEFwaUlkLFxuICAgICAgdHlwZTogYXBpZ3cuQXV0aG9yaXphdGlvblR5cGUuQ09HTklUTyxcbiAgICB9KTtcblxuICAgIGNvbnN0IHVzZXJQb29sQ2xpZW50ID0gbmV3IGNvZ25pdG8uVXNlclBvb2xDbGllbnQoXG4gICAgICB0aGlzLFxuICAgICAgXCJzb3NsZWJhbm9uLWNsaWVudFwiLFxuICAgICAge1xuICAgICAgICB1c2VyUG9vbENsaWVudE5hbWU6IFwic29zbGViYW5vbi1jbGllbnRcIixcbiAgICAgICAgZ2VuZXJhdGVTZWNyZXQ6IGZhbHNlLFxuICAgICAgICB1c2VyUG9vbDogdXNlclBvb2wsXG4gICAgICB9XG4gICAgKTtcbiAgICBjb25zdCBpZGVudGl0eVBvb2wgPSBuZXcgY29nbml0by5DZm5JZGVudGl0eVBvb2woXG4gICAgICB0aGlzLFxuICAgICAgXCJzb3NsZWJhbm9uLWlkZW50aXR5LXBvb2xcIixcbiAgICAgIHtcbiAgICAgICAgaWRlbnRpdHlQb29sTmFtZTogXCJzb3NsZWJhbm9uLWlkZW50aXR5LXBvb2xcIixcbiAgICAgICAgYWxsb3dVbmF1dGhlbnRpY2F0ZWRJZGVudGl0aWVzOiBmYWxzZSxcbiAgICAgICAgY29nbml0b0lkZW50aXR5UHJvdmlkZXJzOiBbXG4gICAgICAgICAge1xuICAgICAgICAgICAgY2xpZW50SWQ6IHVzZXJQb29sQ2xpZW50LnVzZXJQb29sQ2xpZW50SWQsXG4gICAgICAgICAgICBwcm92aWRlck5hbWU6IHVzZXJQb29sLnVzZXJQb29sUHJvdmlkZXJOYW1lLFxuICAgICAgICAgIH0sXG4gICAgICAgIF0sXG4gICAgICB9XG4gICAgKTtcbiAgICAvLyBjb25zdCB1bmF1dGhlbnRpY2F0ZWRSb2xlID0gbmV3IGlhbS5Sb2xlKFxuICAgIC8vICAgdGhpcyxcbiAgICAvLyAgIFwiQ29nbml0b0RlZmF1bHRVbmF1dGhlbnRpY2F0ZWRSb2xlXCIsXG4gICAgLy8gICB7XG4gICAgLy8gICAgIGFzc3VtZWRCeTogbmV3IGlhbS5GZWRlcmF0ZWRQcmluY2lwYWwoXG4gICAgLy8gICAgICAgXCJjb2duaXRvLWlkZW50aXR5LmFtYXpvbmF3cy5jb21cIixcbiAgICAvLyAgICAgICB7XG4gICAgLy8gICAgICAgICBTdHJpbmdFcXVhbHM6IHtcbiAgICAvLyAgICAgICAgICAgXCJjb2duaXRvLWlkZW50aXR5LmFtYXpvbmF3cy5jb206YXVkXCI6IGlkZW50aXR5UG9vbC5yZWYsXG4gICAgLy8gICAgICAgICB9LFxuICAgIC8vICAgICAgICAgXCJGb3JBbnlWYWx1ZTpTdHJpbmdMaWtlXCI6IHtcbiAgICAvLyAgICAgICAgICAgXCJjb2duaXRvLWlkZW50aXR5LmFtYXpvbmF3cy5jb206YW1yXCI6IFwidW5hdXRoZW50aWNhdGVkXCIsXG4gICAgLy8gICAgICAgICB9LFxuICAgIC8vICAgICAgIH0sXG4gICAgLy8gICAgICAgXCJzdHM6QXNzdW1lUm9sZVdpdGhXZWJJZGVudGl0eVwiXG4gICAgLy8gICAgICksXG4gICAgLy8gICB9XG4gICAgLy8gKTtcbiAgICAvLyB1bmF1dGhlbnRpY2F0ZWRSb2xlLmFkZFRvUG9saWN5KFxuICAgIC8vICAgbmV3IFBvbGljeVN0YXRlbWVudCh7XG4gICAgLy8gICAgIGVmZmVjdDogRWZmZWN0LkFMTE9XLFxuICAgIC8vICAgICBhY3Rpb25zOiBbXCJtb2JpbGVhbmFseXRpY3M6UHV0RXZlbnRzXCIsIFwiY29nbml0by1zeW5jOipcIl0sXG4gICAgLy8gICAgIHJlc291cmNlczogW1wiKlwiXSxcbiAgICAvLyAgIH0pXG4gICAgLy8gKTtcblxuICAgIGNvbnN0IGF1dGhlbnRpY2F0ZWRSb2xlID0gbmV3IGlhbS5Sb2xlKFxuICAgICAgdGhpcyxcbiAgICAgIFwiQ29nbml0b0RlZmF1bHRBdXRoZW50aWNhdGVkUm9sZVwiLFxuICAgICAge1xuICAgICAgICBhc3N1bWVkQnk6IG5ldyBpYW0uRmVkZXJhdGVkUHJpbmNpcGFsKFxuICAgICAgICAgIFwiY29nbml0by1pZGVudGl0eS5hbWF6b25hd3MuY29tXCIsXG4gICAgICAgICAge1xuICAgICAgICAgICAgU3RyaW5nRXF1YWxzOiB7XG4gICAgICAgICAgICAgIFwiY29nbml0by1pZGVudGl0eS5hbWF6b25hd3MuY29tOmF1ZFwiOiBpZGVudGl0eVBvb2wucmVmLFxuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIFwiRm9yQW55VmFsdWU6U3RyaW5nTGlrZVwiOiB7XG4gICAgICAgICAgICAgIFwiY29nbml0by1pZGVudGl0eS5hbWF6b25hd3MuY29tOmFtclwiOiBcImF1dGhlbnRpY2F0ZWRcIixcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgfSxcbiAgICAgICAgICBcInN0czpBc3N1bWVSb2xlV2l0aFdlYklkZW50aXR5XCJcbiAgICAgICAgKSxcbiAgICAgIH1cbiAgICApO1xuXG4gICAgYXV0aGVudGljYXRlZFJvbGUuYWRkVG9Qb2xpY3koXG4gICAgICBuZXcgaWFtLlBvbGljeVN0YXRlbWVudCh7XG4gICAgICAgIGVmZmVjdDogaWFtLkVmZmVjdC5BTExPVyxcbiAgICAgICAgYWN0aW9uczogW1xuICAgICAgICAgIFwibW9iaWxlYW5hbHl0aWNzOlB1dEV2ZW50c1wiLFxuICAgICAgICAgIFwiY29nbml0by1zeW5jOipcIixcbiAgICAgICAgICBcImNvZ25pdG8taWRlbnRpdHk6KlwiLFxuICAgICAgICBdLFxuICAgICAgICByZXNvdXJjZXM6IFtcIipcIl0sXG4gICAgICB9KVxuICAgICk7XG5cbiAgICBhdXRoZW50aWNhdGVkUm9sZS5hZGRUb1BvbGljeShcbiAgICAgIG5ldyBpYW0uUG9saWN5U3RhdGVtZW50KHtcbiAgICAgICAgZWZmZWN0OiBpYW0uRWZmZWN0LkFMTE9XLFxuICAgICAgICBhY3Rpb25zOiBbXCJsYW1iZGE6SW52b2tlRnVuY3Rpb25cIl0sXG4gICAgICAgIHJlc291cmNlczogW1wiKlwiXSxcbiAgICAgIH0pXG4gICAgKTtcblxuICAgIGNvbnN0IGRlZmF1bHRQb2xpY3kgPSBuZXcgY29nbml0by5DZm5JZGVudGl0eVBvb2xSb2xlQXR0YWNobWVudChcbiAgICAgIHRoaXMsXG4gICAgICBcIklkZW50aXR5UG9vbFJvbGVNYXBwaW5nXCIsXG4gICAgICB7XG4gICAgICAgIGlkZW50aXR5UG9vbElkOiBpZGVudGl0eVBvb2wucmVmLFxuICAgICAgICByb2xlczoge1xuICAgICAgICAgIC8vIHVuYXV0aGVudGljYXRlZDogdW5hdXRoZW50aWNhdGVkUm9sZS5yb2xlQXJuLFxuICAgICAgICAgIGF1dGhlbnRpY2F0ZWQ6IGF1dGhlbnRpY2F0ZWRSb2xlLnJvbGVBcm4sXG4gICAgICAgIH0sXG4gICAgICB9XG4gICAgKTtcbiAgfVxuICAvLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vL1xuICBjcmVhdGVBUElSZXNvdXJjZXMoKSB7XG4gICAgY29uc3QgYWRtaW5BcGlSZXNvdXJjZSA9IHRoaXMuYXBpLnJvb3QuYWRkUmVzb3VyY2UoXCJhZG1pblwiKTtcbiAgICBhZG1pbkFwaVJlc291cmNlLmFkZE1ldGhvZChcbiAgICAgIFwiT1BUSU9OU1wiLFxuICAgICAgZGVmYXVsdHMubW9ja0ludGVncmF0aW9uLFxuICAgICAgZGVmYXVsdHMub3B0aW9uc1xuICAgICk7XG5cbiAgICB0aGlzLmdldEFkbWluUG9zdHNGdW5jdGlvbihhZG1pbkFwaVJlc291cmNlKTsgLy8gR0VUXG4gICAgdGhpcy5jcmVhdGVQb3N0c0Z1bmN0aW9uKGFkbWluQXBpUmVzb3VyY2UpOyAvLyBQT1NUXG4gICAgdGhpcy5kZWxldGVQb3N0RnVuY3Rpb24oYWRtaW5BcGlSZXNvdXJjZSk7IC8vIERFTEVURVxuXG4gICAgLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy9cbiAgICBjb25zdCBwb3N0QXBpUmVzb3VyY2UgPSB0aGlzLmFwaS5yb290LmFkZFJlc291cmNlKFwicG9zdFwiKTtcbiAgICBwb3N0QXBpUmVzb3VyY2UuYWRkTWV0aG9kKFxuICAgICAgXCJPUFRJT05TXCIsXG4gICAgICBkZWZhdWx0cy5tb2NrSW50ZWdyYXRpb24sXG4gICAgICBkZWZhdWx0cy5vcHRpb25zXG4gICAgKTtcblxuICAgIHRoaXMuZ2V0UG9zdEZ1bmN0aW9uKHBvc3RBcGlSZXNvdXJjZSk7IC8vIEdFVFxuXG4gICAgLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy9cbiAgICBjb25zdCB0eXBlQXBpUmVzb3VyY2UgPSB0aGlzLmFwaS5yb290LmFkZFJlc291cmNlKFwidHlwZVwiKTtcbiAgICB0eXBlQXBpUmVzb3VyY2UuYWRkTWV0aG9kKFxuICAgICAgXCJPUFRJT05TXCIsXG4gICAgICBkZWZhdWx0cy5tb2NrSW50ZWdyYXRpb24sXG4gICAgICBkZWZhdWx0cy5vcHRpb25zXG4gICAgKTtcblxuICAgIHRoaXMuZ2V0VHlwZXNGdW5jdGlvbih0eXBlQXBpUmVzb3VyY2UpOyAvLyBHRVRcblxuICAgIC8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vXG4gICAgY29uc3QgbGF0ZXN0UG9zdHNBcGlSZXNvdXJjZSA9IHRoaXMuYXBpLnJvb3QuYWRkUmVzb3VyY2UoXCJsYXRlc3QtcG9zdFwiKTtcbiAgICBsYXRlc3RQb3N0c0FwaVJlc291cmNlLmFkZE1ldGhvZChcbiAgICAgIFwiT1BUSU9OU1wiLFxuICAgICAgZGVmYXVsdHMubW9ja0ludGVncmF0aW9uLFxuICAgICAgZGVmYXVsdHMub3B0aW9uc1xuICAgICk7XG5cbiAgICB0aGlzLmdldExhdGVzdFBvc3RzRnVuY3Rpb24obGF0ZXN0UG9zdHNBcGlSZXNvdXJjZSk7IC8vIEdFVFxuXG4gICAgLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy9cbiAgICBjb25zdCB0eXBlUG9zdEFwaVJlc291cmNlID0gdGhpcy5hcGkucm9vdC5hZGRSZXNvdXJjZShcInR5cGUtcG9zdFwiKTtcbiAgICB0eXBlUG9zdEFwaVJlc291cmNlLmFkZE1ldGhvZChcbiAgICAgIFwiT1BUSU9OU1wiLFxuICAgICAgZGVmYXVsdHMubW9ja0ludGVncmF0aW9uLFxuICAgICAgZGVmYXVsdHMub3B0aW9uc1xuICAgICk7XG5cbiAgICB0aGlzLmdldFR5cGVQb3N0c0Z1bmN0aW9uKHR5cGVQb3N0QXBpUmVzb3VyY2UpOyAvLyBHRVRcbiAgfVxuXG4gIGdldEFkbWluUG9zdHNGdW5jdGlvbihhZG1pbkFwaVJlc291cmNlOiBhcGlndy5SZXNvdXJjZSkge1xuICAgIGNvbnN0IGdldFR5cGVQb3N0cyA9IG5ldyBsYW1iZGEuRnVuY3Rpb24odGhpcywgXCJnZXQtYWRtaW4tcG9zdHNcIiwge1xuICAgICAgZnVuY3Rpb25OYW1lOiBcImdldC1hZG1pbi1wb3N0c1wiLFxuICAgICAgcnVudGltZTogbGFtYmRhLlJ1bnRpbWUuTk9ERUpTXzEyX1gsXG4gICAgICBoYW5kbGVyOiBcImluZGV4LmhhbmRsZXJcIixcbiAgICAgIGNvZGU6IGxhbWJkYS5Db2RlLmZyb21Bc3NldChcbiAgICAgICAgcGF0aC5qb2luKF9fZGlybmFtZSwgXCIuLi9sYW1iZGFzL2dldC1hZG1pbi1wb3N0c1wiKVxuICAgICAgKSxcbiAgICAgIGVudmlyb25tZW50OiB7XG4gICAgICAgIFBPU1RTX1RBQkxFOiB0aGlzLnBvc3RzVGFibGUudGFibGVOYW1lLFxuICAgICAgfSxcbiAgICB9KTtcblxuICAgIHRoaXMucG9zdHNUYWJsZS5ncmFudFJlYWREYXRhKGdldFR5cGVQb3N0cyk7XG5cbiAgICBhZG1pbkFwaVJlc291cmNlLmFkZE1ldGhvZChcbiAgICAgIFwiR0VUXCIsXG4gICAgICBkZWZhdWx0cy5sYW1iZGFJbnRlZ3JhdGlvbihnZXRUeXBlUG9zdHMsIHtcbiAgICAgICAgXCJhcHBsaWNhdGlvbi9qc29uXCI6ICd7XFxuXCJzdWJcIjogXCIkY29udGV4dC5hdXRob3JpemVyLmNsYWltcy5zdWJcIlxcbn0nLFxuICAgICAgfSksXG4gICAgICB7XG4gICAgICAgIC4uLmRlZmF1bHRzLm9wdGlvbnMsXG4gICAgICAgIGF1dGhvcml6YXRpb25UeXBlOiBhcGlndy5BdXRob3JpemF0aW9uVHlwZS5DT0dOSVRPLFxuICAgICAgICBhdXRob3JpemVyOiB7IGF1dGhvcml6ZXJJZDogdGhpcy5hdXRob3JpemVyLnJlZiB9LFxuICAgICAgfVxuICAgICk7XG4gIH1cblxuICBjcmVhdGVQb3N0c0Z1bmN0aW9uKGFkbWluQXBpUmVzb3VyY2U6IGFwaWd3LlJlc291cmNlKSB7XG4gICAgY29uc3QgY3JlYXRlUG9zdCA9IG5ldyBsYW1iZGEuRnVuY3Rpb24odGhpcywgXCJjcmVhdGUtcG9zdFwiLCB7XG4gICAgICBmdW5jdGlvbk5hbWU6IFwiY3JlYXRlLXBvc3RcIixcbiAgICAgIHJ1bnRpbWU6IGxhbWJkYS5SdW50aW1lLk5PREVKU18xMl9YLFxuICAgICAgaGFuZGxlcjogXCJpbmRleC5oYW5kbGVyXCIsXG4gICAgICBjb2RlOiBsYW1iZGEuQ29kZS5mcm9tQXNzZXQoXG4gICAgICAgIHBhdGguam9pbihfX2Rpcm5hbWUsIFwiLi4vbGFtYmRhcy9jcmVhdGUtcG9zdFwiKVxuICAgICAgKSxcbiAgICAgIGVudmlyb25tZW50OiB7XG4gICAgICAgIFBPU1RTX1RBQkxFOiB0aGlzLnBvc3RzVGFibGUudGFibGVOYW1lLFxuICAgICAgfSxcbiAgICB9KTtcblxuICAgIHRoaXMucG9zdHNUYWJsZS5ncmFudFJlYWRXcml0ZURhdGEoY3JlYXRlUG9zdCk7XG5cbiAgICBhZG1pbkFwaVJlc291cmNlLmFkZE1ldGhvZChcbiAgICAgIFwiUE9TVFwiLFxuICAgICAgZGVmYXVsdHMubGFtYmRhSW50ZWdyYXRpb24oY3JlYXRlUG9zdCwge1xuICAgICAgICBcImFwcGxpY2F0aW9uL2pzb25cIjpcbiAgICAgICAgICAne1xcblwicmVxdWVzdEJvZHlcIjogJGlucHV0LmJvZHksXFxuXCJzdWJcIjogXCIkY29udGV4dC5hdXRob3JpemVyLmNsYWltcy5zdWJcIlxcbn0nLFxuICAgICAgfSksXG4gICAgICB7XG4gICAgICAgIC4uLmRlZmF1bHRzLm9wdGlvbnMsXG4gICAgICAgIGF1dGhvcml6YXRpb25UeXBlOiBhcGlndy5BdXRob3JpemF0aW9uVHlwZS5DT0dOSVRPLFxuICAgICAgICBhdXRob3JpemVyOiB7IGF1dGhvcml6ZXJJZDogdGhpcy5hdXRob3JpemVyLnJlZiB9LFxuICAgICAgfVxuICAgICk7XG4gIH1cblxuICBkZWxldGVQb3N0RnVuY3Rpb24oYWRtaW5BcGlSZXNvdXJjZTogYXBpZ3cuUmVzb3VyY2UpIHtcbiAgICBjb25zdCBnZXRUeXBlUG9zdHMgPSBuZXcgbGFtYmRhLkZ1bmN0aW9uKHRoaXMsIFwiZGVsZXRlLXBvc3RcIiwge1xuICAgICAgZnVuY3Rpb25OYW1lOiBcImRlbGV0ZS1wb3N0XCIsXG4gICAgICBydW50aW1lOiBsYW1iZGEuUnVudGltZS5OT0RFSlNfMTJfWCxcbiAgICAgIGhhbmRsZXI6IFwiaW5kZXguaGFuZGxlclwiLFxuICAgICAgY29kZTogbGFtYmRhLkNvZGUuZnJvbUFzc2V0KFxuICAgICAgICBwYXRoLmpvaW4oX19kaXJuYW1lLCBcIi4uL2xhbWJkYXMvZGVsZXRlLXBvc3RcIilcbiAgICAgICksXG4gICAgICBlbnZpcm9ubWVudDoge1xuICAgICAgICBQT1NUU19UQUJMRTogdGhpcy5wb3N0c1RhYmxlLnRhYmxlTmFtZSxcbiAgICAgIH0sXG4gICAgfSk7XG5cbiAgICB0aGlzLnBvc3RzVGFibGUuZ3JhbnRXcml0ZURhdGEoZ2V0VHlwZVBvc3RzKTtcblxuICAgIGFkbWluQXBpUmVzb3VyY2UuYWRkTWV0aG9kKFxuICAgICAgXCJERUxFVEVcIixcbiAgICAgIGRlZmF1bHRzLmxhbWJkYUludGVncmF0aW9uKGdldFR5cGVQb3N0cywge1xuICAgICAgICBcImFwcGxpY2F0aW9uL2pzb25cIjogYFxuICAgICAgICAgICAgI3NldCgkaGFzSWQgPSAkaW5wdXQucGFyYW1zKCdpZCcpKVxuICAgICAgICAgICAge1xuICAgICAgICAgICAgICBcInN1YlwiOiBcIiRjb250ZXh0LmF1dGhvcml6ZXIuY2xhaW1zLnN1YlwiXG4gICAgICAgICAgICAgICNpZigkaGFzSWQgIT0gXCJcIiksIFwiaWRcIiA6IFwiJGlucHV0LnBhcmFtcygnaWQnKVwiI2VuZFxuICAgICAgICAgICAgfVxuICAgICAgICAgIGAsXG4gICAgICB9KSxcbiAgICAgIHtcbiAgICAgICAgLi4uZGVmYXVsdHMub3B0aW9ucyxcbiAgICAgICAgYXV0aG9yaXphdGlvblR5cGU6IGFwaWd3LkF1dGhvcml6YXRpb25UeXBlLkNPR05JVE8sXG4gICAgICAgIGF1dGhvcml6ZXI6IHsgYXV0aG9yaXplcklkOiB0aGlzLmF1dGhvcml6ZXIucmVmIH0sXG4gICAgICB9XG4gICAgKTtcbiAgfVxuXG4gIGdldExhdGVzdFBvc3RzRnVuY3Rpb24obGF0ZXN0UG9zdHNBcGlSZXNvdXJjZTogYXBpZ3cuUmVzb3VyY2UpIHtcbiAgICBjb25zdCBnZXRUeXBlUG9zdHMgPSBuZXcgbGFtYmRhLkZ1bmN0aW9uKHRoaXMsIFwiZ2V0LWxhdGVzdC1wb3N0c1wiLCB7XG4gICAgICBmdW5jdGlvbk5hbWU6IFwiZ2V0LWxhdGVzdC1wb3N0c1wiLFxuICAgICAgcnVudGltZTogbGFtYmRhLlJ1bnRpbWUuTk9ERUpTXzEyX1gsXG4gICAgICBoYW5kbGVyOiBcImluZGV4LmhhbmRsZXJcIixcbiAgICAgIGNvZGU6IGxhbWJkYS5Db2RlLmZyb21Bc3NldChcbiAgICAgICAgcGF0aC5qb2luKF9fZGlybmFtZSwgXCIuLi9sYW1iZGFzL2dldC1sYXRlc3QtcG9zdHNcIilcbiAgICAgICksXG4gICAgICBlbnZpcm9ubWVudDoge1xuICAgICAgICBQT1NUU19UQUJMRTogdGhpcy5wb3N0c1RhYmxlLnRhYmxlTmFtZSxcbiAgICAgIH0sXG4gICAgfSk7XG5cbiAgICB0aGlzLnBvc3RzVGFibGUuZ3JhbnRSZWFkRGF0YShnZXRUeXBlUG9zdHMpO1xuXG4gICAgbGF0ZXN0UG9zdHNBcGlSZXNvdXJjZS5hZGRNZXRob2QoXG4gICAgICBcIkdFVFwiLFxuICAgICAgZGVmYXVsdHMubGFtYmRhSW50ZWdyYXRpb24oZ2V0VHlwZVBvc3RzLCB7XG4gICAgICAgIFwiYXBwbGljYXRpb24vanNvblwiOiBgXG4gICAgICAgICAgI3NldCgkaGFzTGFzdEV2YWx1YXRlZEtleSA9ICRpbnB1dC5wYXJhbXMoJ2xhc3RFdmFsdWF0ZWRLZXknKSlcbiAgICAgICAgICAjc2V0KCRoYXNMaW1pdCA9ICRpbnB1dC5wYXJhbXMoJ2xpbWl0JykpXG4gICAgICAgICAge1xuICAgICAgICAgICAgI2lmKCRoYXNMaW1pdCAhPSBcIlwiKSBcImxpbWl0XCIgOiBcIiRpbnB1dC5wYXJhbXMoJ2xpbWl0JylcIiNlbmRcbiAgICAgICAgICAgICNpZigkaGFzTGFzdEV2YWx1YXRlZEtleSAhPSBcIlwiKSxcImxhc3RFdmFsdWF0ZWRLZXlcIjogXCIkaW5wdXQucGFyYW1zKCdsYXN0RXZhbHVhdGVkS2V5JylcIiNlbmRcbiAgICAgICAgICB9XG4gICAgICAgIGAsXG4gICAgICB9KSxcbiAgICAgIGRlZmF1bHRzLm9wdGlvbnNcbiAgICApO1xuICB9XG5cbiAgZ2V0UG9zdEZ1bmN0aW9uKHBvc3RBcGlSZXNvdXJjZTogYXBpZ3cuUmVzb3VyY2UpIHtcbiAgICBjb25zdCBnZXRQb3N0ID0gbmV3IGxhbWJkYS5GdW5jdGlvbih0aGlzLCBcImdldC1wb3N0XCIsIHtcbiAgICAgIGZ1bmN0aW9uTmFtZTogXCJnZXQtcG9zdFwiLFxuICAgICAgcnVudGltZTogbGFtYmRhLlJ1bnRpbWUuTk9ERUpTXzEyX1gsXG4gICAgICBoYW5kbGVyOiBcImluZGV4LmhhbmRsZXJcIixcbiAgICAgIGNvZGU6IGxhbWJkYS5Db2RlLmZyb21Bc3NldChwYXRoLmpvaW4oX19kaXJuYW1lLCBcIi4uL2xhbWJkYXMvZ2V0LXBvc3RcIikpLFxuICAgICAgZW52aXJvbm1lbnQ6IHtcbiAgICAgICAgUE9TVFNfVEFCTEU6IHRoaXMucG9zdHNUYWJsZS50YWJsZU5hbWUsXG4gICAgICB9LFxuICAgIH0pO1xuXG4gICAgdGhpcy5wb3N0c1RhYmxlLmdyYW50UmVhZERhdGEoZ2V0UG9zdCk7XG5cbiAgICBwb3N0QXBpUmVzb3VyY2UuYWRkTWV0aG9kKFxuICAgICAgXCJHRVRcIixcbiAgICAgIGRlZmF1bHRzLmxhbWJkYUludGVncmF0aW9uKGdldFBvc3QsIHtcbiAgICAgICAgXCJhcHBsaWNhdGlvbi9qc29uXCI6IGBcbiAgICAgICAgICAjc2V0KCRoYXNJZCA9ICRpbnB1dC5wYXJhbXMoJ2lkJykpXG4gICAgICAgICAge1xuICAgICAgICAgICAgI2lmKCRoYXNJZCAhPSBcIlwiKSBcImlkXCIgOiBcIiRpbnB1dC5wYXJhbXMoJ2lkJylcIiNlbmRcbiAgICAgICAgICB9XG4gICAgICAgIGAsXG4gICAgICB9KSxcbiAgICAgIGRlZmF1bHRzLm9wdGlvbnNcbiAgICApO1xuICB9XG5cbiAgZ2V0VHlwZXNGdW5jdGlvbih0eXBlQXBpUmVzb3VyY2U6IGFwaWd3LlJlc291cmNlKSB7XG4gICAgY29uc3QgZ2V0VHlwZXMgPSBuZXcgbGFtYmRhLkZ1bmN0aW9uKHRoaXMsIFwiZ2V0LXR5cGVzXCIsIHtcbiAgICAgIGZ1bmN0aW9uTmFtZTogXCJnZXQtdHlwZXNcIixcbiAgICAgIHJ1bnRpbWU6IGxhbWJkYS5SdW50aW1lLk5PREVKU18xMl9YLFxuICAgICAgaGFuZGxlcjogXCJpbmRleC5oYW5kbGVyXCIsXG4gICAgICBjb2RlOiBsYW1iZGEuQ29kZS5mcm9tQXNzZXQocGF0aC5qb2luKF9fZGlybmFtZSwgXCIuLi9sYW1iZGFzL2dldC10eXBlc1wiKSksXG4gICAgICBlbnZpcm9ubWVudDoge1xuICAgICAgICBUWVBFU19UQUJMRTogdGhpcy50eXBlc1RhYmxlLnRhYmxlTmFtZSxcbiAgICAgIH0sXG4gICAgfSk7XG5cbiAgICB0aGlzLnR5cGVzVGFibGUuZ3JhbnRSZWFkRGF0YShnZXRUeXBlcyk7XG5cbiAgICB0eXBlQXBpUmVzb3VyY2UuYWRkTWV0aG9kKFxuICAgICAgXCJHRVRcIixcbiAgICAgIGRlZmF1bHRzLmxhbWJkYUludGVncmF0aW9uKGdldFR5cGVzLCB7fSksXG4gICAgICBkZWZhdWx0cy5vcHRpb25zXG4gICAgKTtcbiAgfVxuXG4gIGdldFR5cGVQb3N0c0Z1bmN0aW9uKHBvc3RBcGlSZXNvdXJjZTogYXBpZ3cuUmVzb3VyY2UpIHtcbiAgICBjb25zdCBnZXRUeXBlUG9zdHMgPSBuZXcgbGFtYmRhLkZ1bmN0aW9uKHRoaXMsIFwiZ2V0LXR5cGUtcG9zdHNcIiwge1xuICAgICAgZnVuY3Rpb25OYW1lOiBcImdldC10eXBlLXBvc3RzXCIsXG4gICAgICBydW50aW1lOiBsYW1iZGEuUnVudGltZS5OT0RFSlNfMTJfWCxcbiAgICAgIGhhbmRsZXI6IFwiaW5kZXguaGFuZGxlclwiLFxuICAgICAgY29kZTogbGFtYmRhLkNvZGUuZnJvbUFzc2V0KFxuICAgICAgICBwYXRoLmpvaW4oX19kaXJuYW1lLCBcIi4uL2xhbWJkYXMvZ2V0LXR5cGUtcG9zdHNcIilcbiAgICAgICksXG4gICAgICBlbnZpcm9ubWVudDoge1xuICAgICAgICBQT1NUU19UQUJMRTogdGhpcy5wb3N0c1RhYmxlLnRhYmxlTmFtZSxcbiAgICAgIH0sXG4gICAgfSk7XG5cbiAgICB0aGlzLnBvc3RzVGFibGUuZ3JhbnRSZWFkRGF0YShnZXRUeXBlUG9zdHMpO1xuXG4gICAgcG9zdEFwaVJlc291cmNlLmFkZE1ldGhvZChcbiAgICAgIFwiR0VUXCIsXG4gICAgICBkZWZhdWx0cy5sYW1iZGFJbnRlZ3JhdGlvbihnZXRUeXBlUG9zdHMsIHtcbiAgICAgICAgXCJhcHBsaWNhdGlvbi9qc29uXCI6IGBcbiAgICAgICAgI3NldCgkaGFzVHlwZUlkID0gJGlucHV0LnBhcmFtcygndHlwZUlkJykpXG4gICAgICAgICNzZXQoJGhhc0xhc3RFdmFsdWF0ZWRLZXkgPSAkaW5wdXQucGFyYW1zKCdsYXN0RXZhbHVhdGVkS2V5JykpXG4gICAgICAgICNzZXQoJGhhc0xpbWl0ID0gJGlucHV0LnBhcmFtcygnbGltaXQnKSlcbiAgICAgICAge1xuICAgICAgICAgICNpZigkaGFzVHlwZUlkICE9IFwiXCIpIFwidHlwZUlkXCIgOiBcIiRpbnB1dC5wYXJhbXMoJ3R5cGVJZCcpXCIjZW5kXG4gICAgICAgICAgI2lmKCRoYXNMaW1pdCAhPSBcIlwiKSxcImxpbWl0XCIgOiBcIiRpbnB1dC5wYXJhbXMoJ2xpbWl0JylcIiNlbmRcbiAgICAgICAgICAjaWYoJGhhc0xhc3RFdmFsdWF0ZWRLZXkgIT0gXCJcIiksXCJsYXN0RXZhbHVhdGVkS2V5XCI6IFwiJGlucHV0LnBhcmFtcygnbGFzdEV2YWx1YXRlZEtleScpXCIjZW5kXG4gICAgICAgIH1cbiAgICAgIGAsXG4gICAgICB9KSxcbiAgICAgIGRlZmF1bHRzLm9wdGlvbnNcbiAgICApO1xuICB9XG59XG4iXX0=