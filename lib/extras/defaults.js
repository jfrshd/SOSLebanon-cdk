"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.lambdaIntegration = exports.mockIntegration = exports.options = void 0;
const apigw = require("@aws-cdk/aws-apigateway");
exports.options = {
    methodResponses: [
        {
            statusCode: "200",
            responseModels: {
                "application/json": new apigw.EmptyModel(),
            },
            responseParameters: {
                "method.response.header.Access-Control-Allow-Headers": true,
                "method.response.header.Access-Control-Allow-Methods": true,
                "method.response.header.Access-Control-Allow-Origin": true,
            },
        },
    ],
};
exports.mockIntegration = new apigw.MockIntegration({
    integrationResponses: [
        {
            statusCode: "200",
            responseParameters: {
                "method.response.header.Access-Control-Allow-Headers": "'*'",
                "method.response.header.Access-Control-Allow-Methods": "'*'",
                "method.response.header.Access-Control-Allow-Origin": "'*'",
            },
        },
    ],
    passthroughBehavior: apigw.PassthroughBehavior.WHEN_NO_MATCH,
    requestTemplates: {
        "application/json": '{"statusCode": 200}',
    },
});
exports.lambdaIntegration = (lambdaFN, requestTemplates) => {
    if (requestTemplates == {}) {
        return new apigw.LambdaIntegration(lambdaFN, {
            proxy: false,
            integrationResponses: [
                {
                    statusCode: "200",
                    responseParameters: {
                        "method.response.header.Access-Control-Allow-Headers": "'*'",
                        "method.response.header.Access-Control-Allow-Methods": "'*'",
                        "method.response.header.Access-Control-Allow-Origin": "'*'",
                    },
                },
            ],
            passthroughBehavior: apigw.PassthroughBehavior.WHEN_NO_MATCH,
        });
    }
    else {
        return new apigw.LambdaIntegration(lambdaFN, {
            proxy: false,
            requestTemplates: requestTemplates,
            integrationResponses: [
                {
                    statusCode: "200",
                    responseParameters: {
                        "method.response.header.Access-Control-Allow-Headers": "'*'",
                        "method.response.header.Access-Control-Allow-Methods": "'*'",
                        "method.response.header.Access-Control-Allow-Origin": "'*'",
                    },
                },
            ],
            passthroughBehavior: apigw.PassthroughBehavior.WHEN_NO_MATCH,
        });
    }
};
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZGVmYXVsdHMuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJkZWZhdWx0cy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7QUFBQSxpREFBaUQ7QUFHcEMsUUFBQSxPQUFPLEdBQUc7SUFDckIsZUFBZSxFQUFFO1FBQ2Y7WUFDRSxVQUFVLEVBQUUsS0FBSztZQUNqQixjQUFjLEVBQUU7Z0JBQ2Qsa0JBQWtCLEVBQUUsSUFBSSxLQUFLLENBQUMsVUFBVSxFQUFFO2FBQzNDO1lBQ0Qsa0JBQWtCLEVBQUU7Z0JBQ2xCLHFEQUFxRCxFQUFFLElBQUk7Z0JBQzNELHFEQUFxRCxFQUFFLElBQUk7Z0JBQzNELG9EQUFvRCxFQUFFLElBQUk7YUFDM0Q7U0FDRjtLQUNGO0NBQ0YsQ0FBQztBQUVXLFFBQUEsZUFBZSxHQUFHLElBQUksS0FBSyxDQUFDLGVBQWUsQ0FBQztJQUN2RCxvQkFBb0IsRUFBRTtRQUNwQjtZQUNFLFVBQVUsRUFBRSxLQUFLO1lBQ2pCLGtCQUFrQixFQUFFO2dCQUNsQixxREFBcUQsRUFBRSxLQUFLO2dCQUM1RCxxREFBcUQsRUFBRSxLQUFLO2dCQUM1RCxvREFBb0QsRUFBRSxLQUFLO2FBQzVEO1NBQ0Y7S0FDRjtJQUNELG1CQUFtQixFQUFFLEtBQUssQ0FBQyxtQkFBbUIsQ0FBQyxhQUFhO0lBQzVELGdCQUFnQixFQUFFO1FBQ2hCLGtCQUFrQixFQUFFLHFCQUFxQjtLQUMxQztDQUNGLENBQUMsQ0FBQztBQUVVLFFBQUEsaUJBQWlCLEdBQUcsQ0FDL0IsUUFBbUIsRUFDbkIsZ0JBRUMsRUFDRCxFQUFFO0lBQ0YsSUFBSSxnQkFBZ0IsSUFBSSxFQUFFLEVBQUU7UUFDMUIsT0FBTyxJQUFJLEtBQUssQ0FBQyxpQkFBaUIsQ0FBQyxRQUFRLEVBQUU7WUFDM0MsS0FBSyxFQUFFLEtBQUs7WUFDWixvQkFBb0IsRUFBRTtnQkFDcEI7b0JBQ0UsVUFBVSxFQUFFLEtBQUs7b0JBQ2pCLGtCQUFrQixFQUFFO3dCQUNsQixxREFBcUQsRUFBRSxLQUFLO3dCQUM1RCxxREFBcUQsRUFBRSxLQUFLO3dCQUM1RCxvREFBb0QsRUFBRSxLQUFLO3FCQUM1RDtpQkFDRjthQUNGO1lBQ0QsbUJBQW1CLEVBQUUsS0FBSyxDQUFDLG1CQUFtQixDQUFDLGFBQWE7U0FDN0QsQ0FBQyxDQUFDO0tBQ0o7U0FBTTtRQUNMLE9BQU8sSUFBSSxLQUFLLENBQUMsaUJBQWlCLENBQUMsUUFBUSxFQUFFO1lBQzNDLEtBQUssRUFBRSxLQUFLO1lBQ1osZ0JBQWdCLEVBQUUsZ0JBQWdCO1lBQ2xDLG9CQUFvQixFQUFFO2dCQUNwQjtvQkFDRSxVQUFVLEVBQUUsS0FBSztvQkFDakIsa0JBQWtCLEVBQUU7d0JBQ2xCLHFEQUFxRCxFQUFFLEtBQUs7d0JBQzVELHFEQUFxRCxFQUFFLEtBQUs7d0JBQzVELG9EQUFvRCxFQUFFLEtBQUs7cUJBQzVEO2lCQUNGO2FBQ0Y7WUFDRCxtQkFBbUIsRUFBRSxLQUFLLENBQUMsbUJBQW1CLENBQUMsYUFBYTtTQUM3RCxDQUFDLENBQUM7S0FDSjtBQUNILENBQUMsQ0FBQyIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCAqIGFzIGFwaWd3IGZyb20gXCJAYXdzLWNkay9hd3MtYXBpZ2F0ZXdheVwiO1xyXG5pbXBvcnQgeyBJRnVuY3Rpb24gfSBmcm9tIFwiQGF3cy1jZGsvYXdzLWxhbWJkYVwiO1xyXG5cclxuZXhwb3J0IGNvbnN0IG9wdGlvbnMgPSB7XHJcbiAgbWV0aG9kUmVzcG9uc2VzOiBbXHJcbiAgICB7XHJcbiAgICAgIHN0YXR1c0NvZGU6IFwiMjAwXCIsXHJcbiAgICAgIHJlc3BvbnNlTW9kZWxzOiB7XHJcbiAgICAgICAgXCJhcHBsaWNhdGlvbi9qc29uXCI6IG5ldyBhcGlndy5FbXB0eU1vZGVsKCksXHJcbiAgICAgIH0sXHJcbiAgICAgIHJlc3BvbnNlUGFyYW1ldGVyczoge1xyXG4gICAgICAgIFwibWV0aG9kLnJlc3BvbnNlLmhlYWRlci5BY2Nlc3MtQ29udHJvbC1BbGxvdy1IZWFkZXJzXCI6IHRydWUsXHJcbiAgICAgICAgXCJtZXRob2QucmVzcG9uc2UuaGVhZGVyLkFjY2Vzcy1Db250cm9sLUFsbG93LU1ldGhvZHNcIjogdHJ1ZSxcclxuICAgICAgICBcIm1ldGhvZC5yZXNwb25zZS5oZWFkZXIuQWNjZXNzLUNvbnRyb2wtQWxsb3ctT3JpZ2luXCI6IHRydWUsXHJcbiAgICAgIH0sXHJcbiAgICB9LFxyXG4gIF0sXHJcbn07XHJcblxyXG5leHBvcnQgY29uc3QgbW9ja0ludGVncmF0aW9uID0gbmV3IGFwaWd3Lk1vY2tJbnRlZ3JhdGlvbih7XHJcbiAgaW50ZWdyYXRpb25SZXNwb25zZXM6IFtcclxuICAgIHtcclxuICAgICAgc3RhdHVzQ29kZTogXCIyMDBcIixcclxuICAgICAgcmVzcG9uc2VQYXJhbWV0ZXJzOiB7XHJcbiAgICAgICAgXCJtZXRob2QucmVzcG9uc2UuaGVhZGVyLkFjY2Vzcy1Db250cm9sLUFsbG93LUhlYWRlcnNcIjogXCInKidcIixcclxuICAgICAgICBcIm1ldGhvZC5yZXNwb25zZS5oZWFkZXIuQWNjZXNzLUNvbnRyb2wtQWxsb3ctTWV0aG9kc1wiOiBcIicqJ1wiLFxyXG4gICAgICAgIFwibWV0aG9kLnJlc3BvbnNlLmhlYWRlci5BY2Nlc3MtQ29udHJvbC1BbGxvdy1PcmlnaW5cIjogXCInKidcIixcclxuICAgICAgfSxcclxuICAgIH0sXHJcbiAgXSxcclxuICBwYXNzdGhyb3VnaEJlaGF2aW9yOiBhcGlndy5QYXNzdGhyb3VnaEJlaGF2aW9yLldIRU5fTk9fTUFUQ0gsXHJcbiAgcmVxdWVzdFRlbXBsYXRlczoge1xyXG4gICAgXCJhcHBsaWNhdGlvbi9qc29uXCI6ICd7XCJzdGF0dXNDb2RlXCI6IDIwMH0nLFxyXG4gIH0sXHJcbn0pO1xyXG5cclxuZXhwb3J0IGNvbnN0IGxhbWJkYUludGVncmF0aW9uID0gKFxyXG4gIGxhbWJkYUZOOiBJRnVuY3Rpb24sXHJcbiAgcmVxdWVzdFRlbXBsYXRlczoge1xyXG4gICAgW2NvbnRlbnRUeXBlOiBzdHJpbmddOiBzdHJpbmc7XHJcbiAgfVxyXG4pID0+IHtcclxuICBpZiAocmVxdWVzdFRlbXBsYXRlcyA9PSB7fSkge1xyXG4gICAgcmV0dXJuIG5ldyBhcGlndy5MYW1iZGFJbnRlZ3JhdGlvbihsYW1iZGFGTiwge1xyXG4gICAgICBwcm94eTogZmFsc2UsXHJcbiAgICAgIGludGVncmF0aW9uUmVzcG9uc2VzOiBbXHJcbiAgICAgICAge1xyXG4gICAgICAgICAgc3RhdHVzQ29kZTogXCIyMDBcIixcclxuICAgICAgICAgIHJlc3BvbnNlUGFyYW1ldGVyczoge1xyXG4gICAgICAgICAgICBcIm1ldGhvZC5yZXNwb25zZS5oZWFkZXIuQWNjZXNzLUNvbnRyb2wtQWxsb3ctSGVhZGVyc1wiOiBcIicqJ1wiLFxyXG4gICAgICAgICAgICBcIm1ldGhvZC5yZXNwb25zZS5oZWFkZXIuQWNjZXNzLUNvbnRyb2wtQWxsb3ctTWV0aG9kc1wiOiBcIicqJ1wiLFxyXG4gICAgICAgICAgICBcIm1ldGhvZC5yZXNwb25zZS5oZWFkZXIuQWNjZXNzLUNvbnRyb2wtQWxsb3ctT3JpZ2luXCI6IFwiJyonXCIsXHJcbiAgICAgICAgICB9LFxyXG4gICAgICAgIH0sXHJcbiAgICAgIF0sXHJcbiAgICAgIHBhc3N0aHJvdWdoQmVoYXZpb3I6IGFwaWd3LlBhc3N0aHJvdWdoQmVoYXZpb3IuV0hFTl9OT19NQVRDSCxcclxuICAgIH0pO1xyXG4gIH0gZWxzZSB7XHJcbiAgICByZXR1cm4gbmV3IGFwaWd3LkxhbWJkYUludGVncmF0aW9uKGxhbWJkYUZOLCB7XHJcbiAgICAgIHByb3h5OiBmYWxzZSxcclxuICAgICAgcmVxdWVzdFRlbXBsYXRlczogcmVxdWVzdFRlbXBsYXRlcyxcclxuICAgICAgaW50ZWdyYXRpb25SZXNwb25zZXM6IFtcclxuICAgICAgICB7XHJcbiAgICAgICAgICBzdGF0dXNDb2RlOiBcIjIwMFwiLFxyXG4gICAgICAgICAgcmVzcG9uc2VQYXJhbWV0ZXJzOiB7XHJcbiAgICAgICAgICAgIFwibWV0aG9kLnJlc3BvbnNlLmhlYWRlci5BY2Nlc3MtQ29udHJvbC1BbGxvdy1IZWFkZXJzXCI6IFwiJyonXCIsXHJcbiAgICAgICAgICAgIFwibWV0aG9kLnJlc3BvbnNlLmhlYWRlci5BY2Nlc3MtQ29udHJvbC1BbGxvdy1NZXRob2RzXCI6IFwiJyonXCIsXHJcbiAgICAgICAgICAgIFwibWV0aG9kLnJlc3BvbnNlLmhlYWRlci5BY2Nlc3MtQ29udHJvbC1BbGxvdy1PcmlnaW5cIjogXCInKidcIixcclxuICAgICAgICAgIH0sXHJcbiAgICAgICAgfSxcclxuICAgICAgXSxcclxuICAgICAgcGFzc3Rocm91Z2hCZWhhdmlvcjogYXBpZ3cuUGFzc3Rocm91Z2hCZWhhdmlvci5XSEVOX05PX01BVENILFxyXG4gICAgfSk7XHJcbiAgfVxyXG59O1xyXG4iXX0=