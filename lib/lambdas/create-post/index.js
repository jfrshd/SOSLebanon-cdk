const AWS = require("aws-sdk");
const short = require("short-uuid");
var _dynamodbAutoMarshaller = require("@aws/dynamodb-auto-marshaller");
var marshaller = new _dynamodbAutoMarshaller.Marshaller();
const region = "eu-west-1";
AWS.config.region = region;
const dynamodb = new AWS.DynamoDB();
exports.handler = async(event, context) => {
  const user_id = event.sub;
  event = event.requestBody;
  let uuid;
  try {
    if (event.id != '' && event.id != undefined) {
      uuid = event.id.split('#')[1];
      if (user_id != event.id.split('#')[0]) {
        return {
          statusCode: 401,
          statusText: JSON.stringify(
            "Something wrong happened while creating help"
          ),
        };
      }
    }
    else {
      uuid = short.generate();
    }
    let item = {};
    item.pk = "help";
    item.id = user_id + "#" + uuid; //sk1 sub#uuid
    item.creationDate = Date.now(); //sk2 date_added
    item.typeId = event.typeId; //sk3
    item.image = event.image == undefined ? 'N/A' : event.image ;
    item.user = user_id;
    item.title = event.title;
    item.description = event.description;
    item.location = event.location;
    item.phoneNumber = event.phoneNumber;
    item.fulfilled = event.fulfilled;
    const marshalledItem = marshaller.marshallItem(item);
    const params = {
      TableName: process.env.POSTS_TABLE,
      Item: marshalledItem,
    };
    await dynamodb.putItem(params).promise();
    return {
      statusCode: 200,
      statusText: JSON.stringify("Success"),
    };
  }
  catch (e) {
    console.log("error", e);
    return {
      statusCode: 400,
      statusText: JSON.stringify(
        "Something wrong happened while creating help"
      ),
    };
  }
};