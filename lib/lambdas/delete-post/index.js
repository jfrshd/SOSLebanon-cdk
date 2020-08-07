var AWS = require("aws-sdk");
AWS.config.update({ region: "eu-west-1" });
var ddb = new AWS.DynamoDB({ apiVersion: "2012-08-10" });
exports.handler = async (event) => {
  let id = event.id;
  try {
    await deleteHelp(id);

    return {
      statusCode: 200,
      statusText: JSON.stringify("Success"),
    }; 
  } catch (e) {
    console.log("error", e);
    return {
      statusCode: 401,
      statusText: JSON.stringify(
        "Something wrong happened while deleting help"
      ),
    };
  }
};
let deleteHelp = function (id) {
  let params = {
    TableName: process.env.POSTS_TABLE,
    Key: {
      pk: { S: "help" },
      id: { S: id },
    },
  };
  return ddb.deleteItem(params).promise();
};
