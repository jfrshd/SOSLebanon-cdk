"use strict";
var _dynamodbAutoMarshaller = require("@aws/dynamodb-auto-marshaller");
var AWS = require("aws-sdk");
AWS.config.update({ region: "eu-west-1" });
var ddb = new AWS.DynamoDB({ apiVersion: "2012-08-10" });
var marshaller = new _dynamodbAutoMarshaller.Marshaller();
exports.handler = async (event) => {
  let id = event.id;
  let params = {
    TableName: process.env.POSTS_TABLE,
    KeyConditionExpression: "pk = :partitionKey and sk_type_id = :type_id",
    KeyConditionExpression: "Genre = :genre and Price < :price",
    ExpressionAttributeValues: {
      ":partitionKey": { S: "help" },
      ":type_id": { S: event.type_id },
    },
  };
  try {
    let result = await ddb.query(params).promise();
    result.Items = result.Items.map((item) => {
      return marshaller.unmarshallItem(item);
    });
    return {
      statusCode: 200,
      result,
    };
  } catch (e) {
    console.log("error", e);
    return {
      statusCode: 400,
      statusText: JSON.stringify(
        "Something wrong happened while creating help"
      ),
    };
  }
};
