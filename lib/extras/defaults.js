"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZGVmYXVsdHMuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJkZWZhdWx0cy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOztBQUFBLGlEQUFpRDtBQUdwQyxRQUFBLE9BQU8sR0FBRztJQUNyQixlQUFlLEVBQUU7UUFDZjtZQUNFLFVBQVUsRUFBRSxLQUFLO1lBQ2pCLGNBQWMsRUFBRTtnQkFDZCxrQkFBa0IsRUFBRSxJQUFJLEtBQUssQ0FBQyxVQUFVLEVBQUU7YUFDM0M7WUFDRCxrQkFBa0IsRUFBRTtnQkFDbEIscURBQXFELEVBQUUsSUFBSTtnQkFDM0QscURBQXFELEVBQUUsSUFBSTtnQkFDM0Qsb0RBQW9ELEVBQUUsSUFBSTthQUMzRDtTQUNGO0tBQ0Y7Q0FDRixDQUFDO0FBRVcsUUFBQSxlQUFlLEdBQUcsSUFBSSxLQUFLLENBQUMsZUFBZSxDQUFDO0lBQ3ZELG9CQUFvQixFQUFFO1FBQ3BCO1lBQ0UsVUFBVSxFQUFFLEtBQUs7WUFDakIsa0JBQWtCLEVBQUU7Z0JBQ2xCLHFEQUFxRCxFQUFFLEtBQUs7Z0JBQzVELHFEQUFxRCxFQUFFLEtBQUs7Z0JBQzVELG9EQUFvRCxFQUFFLEtBQUs7YUFDNUQ7U0FDRjtLQUNGO0lBQ0QsbUJBQW1CLEVBQUUsS0FBSyxDQUFDLG1CQUFtQixDQUFDLGFBQWE7SUFDNUQsZ0JBQWdCLEVBQUU7UUFDaEIsa0JBQWtCLEVBQUUscUJBQXFCO0tBQzFDO0NBQ0YsQ0FBQyxDQUFDO0FBRVUsUUFBQSxpQkFBaUIsR0FBRyxDQUMvQixRQUFtQixFQUNuQixnQkFFQyxFQUNELEVBQUU7SUFDRixJQUFJLGdCQUFnQixJQUFJLEVBQUUsRUFBRTtRQUMxQixPQUFPLElBQUksS0FBSyxDQUFDLGlCQUFpQixDQUFDLFFBQVEsRUFBRTtZQUMzQyxLQUFLLEVBQUUsS0FBSztZQUNaLG9CQUFvQixFQUFFO2dCQUNwQjtvQkFDRSxVQUFVLEVBQUUsS0FBSztvQkFDakIsa0JBQWtCLEVBQUU7d0JBQ2xCLHFEQUFxRCxFQUFFLEtBQUs7d0JBQzVELHFEQUFxRCxFQUFFLEtBQUs7d0JBQzVELG9EQUFvRCxFQUFFLEtBQUs7cUJBQzVEO2lCQUNGO2FBQ0Y7WUFDRCxtQkFBbUIsRUFBRSxLQUFLLENBQUMsbUJBQW1CLENBQUMsYUFBYTtTQUM3RCxDQUFDLENBQUM7S0FDSjtTQUFNO1FBQ0wsT0FBTyxJQUFJLEtBQUssQ0FBQyxpQkFBaUIsQ0FBQyxRQUFRLEVBQUU7WUFDM0MsS0FBSyxFQUFFLEtBQUs7WUFDWixnQkFBZ0IsRUFBRSxnQkFBZ0I7WUFDbEMsb0JBQW9CLEVBQUU7Z0JBQ3BCO29CQUNFLFVBQVUsRUFBRSxLQUFLO29CQUNqQixrQkFBa0IsRUFBRTt3QkFDbEIscURBQXFELEVBQUUsS0FBSzt3QkFDNUQscURBQXFELEVBQUUsS0FBSzt3QkFDNUQsb0RBQW9ELEVBQUUsS0FBSztxQkFDNUQ7aUJBQ0Y7YUFDRjtZQUNELG1CQUFtQixFQUFFLEtBQUssQ0FBQyxtQkFBbUIsQ0FBQyxhQUFhO1NBQzdELENBQUMsQ0FBQztLQUNKO0FBQ0gsQ0FBQyxDQUFDIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0ICogYXMgYXBpZ3cgZnJvbSBcIkBhd3MtY2RrL2F3cy1hcGlnYXRld2F5XCI7XHJcbmltcG9ydCB7IElGdW5jdGlvbiB9IGZyb20gXCJAYXdzLWNkay9hd3MtbGFtYmRhXCI7XHJcblxyXG5leHBvcnQgY29uc3Qgb3B0aW9ucyA9IHtcclxuICBtZXRob2RSZXNwb25zZXM6IFtcclxuICAgIHtcclxuICAgICAgc3RhdHVzQ29kZTogXCIyMDBcIixcclxuICAgICAgcmVzcG9uc2VNb2RlbHM6IHtcclxuICAgICAgICBcImFwcGxpY2F0aW9uL2pzb25cIjogbmV3IGFwaWd3LkVtcHR5TW9kZWwoKSxcclxuICAgICAgfSxcclxuICAgICAgcmVzcG9uc2VQYXJhbWV0ZXJzOiB7XHJcbiAgICAgICAgXCJtZXRob2QucmVzcG9uc2UuaGVhZGVyLkFjY2Vzcy1Db250cm9sLUFsbG93LUhlYWRlcnNcIjogdHJ1ZSxcclxuICAgICAgICBcIm1ldGhvZC5yZXNwb25zZS5oZWFkZXIuQWNjZXNzLUNvbnRyb2wtQWxsb3ctTWV0aG9kc1wiOiB0cnVlLFxyXG4gICAgICAgIFwibWV0aG9kLnJlc3BvbnNlLmhlYWRlci5BY2Nlc3MtQ29udHJvbC1BbGxvdy1PcmlnaW5cIjogdHJ1ZSxcclxuICAgICAgfSxcclxuICAgIH0sXHJcbiAgXSxcclxufTtcclxuXHJcbmV4cG9ydCBjb25zdCBtb2NrSW50ZWdyYXRpb24gPSBuZXcgYXBpZ3cuTW9ja0ludGVncmF0aW9uKHtcclxuICBpbnRlZ3JhdGlvblJlc3BvbnNlczogW1xyXG4gICAge1xyXG4gICAgICBzdGF0dXNDb2RlOiBcIjIwMFwiLFxyXG4gICAgICByZXNwb25zZVBhcmFtZXRlcnM6IHtcclxuICAgICAgICBcIm1ldGhvZC5yZXNwb25zZS5oZWFkZXIuQWNjZXNzLUNvbnRyb2wtQWxsb3ctSGVhZGVyc1wiOiBcIicqJ1wiLFxyXG4gICAgICAgIFwibWV0aG9kLnJlc3BvbnNlLmhlYWRlci5BY2Nlc3MtQ29udHJvbC1BbGxvdy1NZXRob2RzXCI6IFwiJyonXCIsXHJcbiAgICAgICAgXCJtZXRob2QucmVzcG9uc2UuaGVhZGVyLkFjY2Vzcy1Db250cm9sLUFsbG93LU9yaWdpblwiOiBcIicqJ1wiLFxyXG4gICAgICB9LFxyXG4gICAgfSxcclxuICBdLFxyXG4gIHBhc3N0aHJvdWdoQmVoYXZpb3I6IGFwaWd3LlBhc3N0aHJvdWdoQmVoYXZpb3IuV0hFTl9OT19NQVRDSCxcclxuICByZXF1ZXN0VGVtcGxhdGVzOiB7XHJcbiAgICBcImFwcGxpY2F0aW9uL2pzb25cIjogJ3tcInN0YXR1c0NvZGVcIjogMjAwfScsXHJcbiAgfSxcclxufSk7XHJcblxyXG5leHBvcnQgY29uc3QgbGFtYmRhSW50ZWdyYXRpb24gPSAoXHJcbiAgbGFtYmRhRk46IElGdW5jdGlvbixcclxuICByZXF1ZXN0VGVtcGxhdGVzOiB7XHJcbiAgICBbY29udGVudFR5cGU6IHN0cmluZ106IHN0cmluZztcclxuICB9XHJcbikgPT4ge1xyXG4gIGlmIChyZXF1ZXN0VGVtcGxhdGVzID09IHt9KSB7XHJcbiAgICByZXR1cm4gbmV3IGFwaWd3LkxhbWJkYUludGVncmF0aW9uKGxhbWJkYUZOLCB7XHJcbiAgICAgIHByb3h5OiBmYWxzZSxcclxuICAgICAgaW50ZWdyYXRpb25SZXNwb25zZXM6IFtcclxuICAgICAgICB7XHJcbiAgICAgICAgICBzdGF0dXNDb2RlOiBcIjIwMFwiLFxyXG4gICAgICAgICAgcmVzcG9uc2VQYXJhbWV0ZXJzOiB7XHJcbiAgICAgICAgICAgIFwibWV0aG9kLnJlc3BvbnNlLmhlYWRlci5BY2Nlc3MtQ29udHJvbC1BbGxvdy1IZWFkZXJzXCI6IFwiJyonXCIsXHJcbiAgICAgICAgICAgIFwibWV0aG9kLnJlc3BvbnNlLmhlYWRlci5BY2Nlc3MtQ29udHJvbC1BbGxvdy1NZXRob2RzXCI6IFwiJyonXCIsXHJcbiAgICAgICAgICAgIFwibWV0aG9kLnJlc3BvbnNlLmhlYWRlci5BY2Nlc3MtQ29udHJvbC1BbGxvdy1PcmlnaW5cIjogXCInKidcIixcclxuICAgICAgICAgIH0sXHJcbiAgICAgICAgfSxcclxuICAgICAgXSxcclxuICAgICAgcGFzc3Rocm91Z2hCZWhhdmlvcjogYXBpZ3cuUGFzc3Rocm91Z2hCZWhhdmlvci5XSEVOX05PX01BVENILFxyXG4gICAgfSk7XHJcbiAgfSBlbHNlIHtcclxuICAgIHJldHVybiBuZXcgYXBpZ3cuTGFtYmRhSW50ZWdyYXRpb24obGFtYmRhRk4sIHtcclxuICAgICAgcHJveHk6IGZhbHNlLFxyXG4gICAgICByZXF1ZXN0VGVtcGxhdGVzOiByZXF1ZXN0VGVtcGxhdGVzLFxyXG4gICAgICBpbnRlZ3JhdGlvblJlc3BvbnNlczogW1xyXG4gICAgICAgIHtcclxuICAgICAgICAgIHN0YXR1c0NvZGU6IFwiMjAwXCIsXHJcbiAgICAgICAgICByZXNwb25zZVBhcmFtZXRlcnM6IHtcclxuICAgICAgICAgICAgXCJtZXRob2QucmVzcG9uc2UuaGVhZGVyLkFjY2Vzcy1Db250cm9sLUFsbG93LUhlYWRlcnNcIjogXCInKidcIixcclxuICAgICAgICAgICAgXCJtZXRob2QucmVzcG9uc2UuaGVhZGVyLkFjY2Vzcy1Db250cm9sLUFsbG93LU1ldGhvZHNcIjogXCInKidcIixcclxuICAgICAgICAgICAgXCJtZXRob2QucmVzcG9uc2UuaGVhZGVyLkFjY2Vzcy1Db250cm9sLUFsbG93LU9yaWdpblwiOiBcIicqJ1wiLFxyXG4gICAgICAgICAgfSxcclxuICAgICAgICB9LFxyXG4gICAgICBdLFxyXG4gICAgICBwYXNzdGhyb3VnaEJlaGF2aW9yOiBhcGlndy5QYXNzdGhyb3VnaEJlaGF2aW9yLldIRU5fTk9fTUFUQ0gsXHJcbiAgICB9KTtcclxuICB9XHJcbn07XHJcbiJdfQ==