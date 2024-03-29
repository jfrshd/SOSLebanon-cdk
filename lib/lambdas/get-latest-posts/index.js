"use strict";
var _dynamodbAutoMarshaller = require("@aws/dynamodb-auto-marshaller");
var AWS = require("aws-sdk");
AWS.config.update({ region: "eu-west-1" });
var ddb = new AWS.DynamoDB({ apiVersion: "2012-08-10" });
var marshaller = new _dynamodbAutoMarshaller.Marshaller();
const cognito = new AWS.CognitoIdentityServiceProvider({ apiVersion: '2016-04-18' })

exports.handler = async (event) => {
console.log(event);
  let params = {
    TableName: process.env.POSTS_TABLE,
    IndexName: "creationDate",
    FilterExpression: "pk = :pk",
   // ScanIndexForward: false,
    ProjectionExpression: "id,title,creationDate,description,fulfilled,image,#location,phoneNumber,#typeId,#user,phone,keyword",
    ExpressionAttributeNames: {
      "#location": "location",
      "#user": "user",
      "#typeId":"typeId"
    },
   // KeyConditionExpression: "pk = :pk",
    ExpressionAttributeValues: {
     
      ":pk":{S:"help"},
    },
  };
  if (event.hasOwnProperty("LastEvaluatedKey") && event.LastEvaluatedKey.length > 0) {
    params.ExclusiveStartKey = marshaller.marshallItem(JSON.parse(decodeURIComponent(event.LastEvaluatedKey)));
  }

  if (event.hasOwnProperty("typeId") && event.typeId.length > 0) {
    params.FilterExpression = params.FilterExpression + " and #typeId = :typeId";
    params.ExpressionAttributeValues[":typeId"] = { S: event.typeId};
  }

  if (event.hasOwnProperty("keyword") && event.typeId.length > 0) {
    params.FilterExpression = params.FilterExpression + " or #keyword = :keyword";
    params.ExpressionAttributeValues[":keyword"] = { S: event.keyword};
  }
  
  params.Limit = event.hasOwnProperty("limit") ? event.limit : 10;
  try {

    let result = await loopQuery(params);
    //let result = await ddb.query(params).promise();
    
     const promises = result.Items.map(async (item) => {
      let newItem = marshaller.unmarshallItem(item);
      let userInfo = await getUserInformation(newItem.user);
      newItem.userInfo = {
        address: userInfo.address,
        phone_number: userInfo.phone_number,
        given_name: userInfo.given_name,
        family_name: userInfo.family_name,
        email: userInfo.email,
      };
      return newItem;
    });
    result.Items = await Promise.all(promises);

    if (result.hasOwnProperty("LastEvaluatedKey"))
      result.LastEvaluatedKey = marshaller.unmarshallItem(
        result.LastEvaluatedKey
      );

    return {
      statusCode: 200,
      result,
    };
  }
  catch (e) {
    console.log("error", e);
    return {
      statusCode: 400,
      statusText: JSON.stringify(
        "Something went wrong. " + e
      ),
    };
  }
};


async function getUserInformation(sub) {
  try {
  console.log('getUserInformation before');
    const user = await cognito.adminGetUser({
      UserPoolId: process.env.identityPoolId,
      Username: sub,
    }).promise();
  console.log('getUserInformation after');
    console.log(user);
    let res = {};
    user.UserAttributes.forEach(attribute => {
      res[attribute.Name] = attribute.Value;
    })
    return res;
  } catch (er) {
    console.log(er);
  }
}

let loopQuery = async function (params) {
  let finalResult = []
  let finalCount = 0
  let keepGoing = true;
  let result = null;
  while (keepGoing) {
    let newParams = params;
    if (result && result.LastEvaluatedKey) {
      newParams = {
        ...params,
        ExclusiveStartKey: result.LastEvaluatedKey
      };
    }
    result = await ddb.scan(newParams).promise();
    finalCount += result.Count
    result.Items.forEach(item => {
      finalResult.push(item)
    })
    if (finalCount > params.Limit || !result.LastEvaluatedKey) {
      keepGoing = false;
    }
  }

  return { Items: finalResult, Count: finalCount, LastEvaluatedKey: result.LastEvaluatedKey };
}


