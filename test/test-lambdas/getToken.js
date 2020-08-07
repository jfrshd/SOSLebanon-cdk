global.fetch = require("node-fetch");
const {
  CognitoUserSession,
  CognitoUserPool,
  CognitoUser,
  AuthenticationDetails,
} = require("amazon-cognito-identity-js");
const AWS = require("aws-sdk");

const POOL_DATA = {
  UserPoolId: "eu-west-1_WftRtPBs5",
  ClientId: "6o1jkqd70ubdmeugl5ivm9ltuh",
  // IdentityPoolID: 'eu-west-1:37caf79b-917c-401e-b13a-25c663a7108e',
  // YOUR_USER_POOL_ID_IDP: 'cognito-idp.eu-west-1.amazonaws.com/eu-west-1_1NLLUq3Th'
};

const userPool = new CognitoUserPool(POOL_DATA);
const region = "eu-west-1";

function signIn(username, password, fn) {
  const authData = {
    Username: username,
    Password: password,
  };
  const authDetails = new AuthenticationDetails(authData);
  const userData = {
    Username: username,
    Pool: userPool,
  };
  const cognitoUser = new CognitoUser(userData);
  const that = this;
  cognitoUser.authenticateUser(authDetails, {
    onSuccess(result) {
      // console.log(result);
      console.log("signIn succeed");
      fn(username);
    },
    onFailure(err) {
      console.log(err);
    },
  });
}

function call(username) {
  const data = {
    UserPoolId: POOL_DATA.UserPoolId,
    ClientId: POOL_DATA.ClientId,
    Paranoia: 8,
  };

  const userPool = new CognitoUserPool(data);
  const cognitoUser = userPool.getCurrentUser();

  try {
    if (cognitoUser != null) {
      cognitoUser.getSession((_err, session) => {
        if (_err) {
          console.log("error", _err);
        }

        fetch(
          "https://4cw2c4lng9.execute-api.eu-west-1.amazonaws.com/prod/orgs",
          {
            method: "POST",
            // headers: {
            //   Authorization: "Bearer" + session.getIdToken().getJwtToken(),
            // },
            body: {
              category_id: "1",
              title: "org1",
              location: "loc1",
              key_words: "keyword1keyword2",
              description: "desc1",
              image: "base6444444",
              contact_email: "test@gmail.com",
              contact_phone: "76666",
              organization_id: "org1",
            },
          }
        )
          .then((res) => res.json())
          .then(console.log)
          .catch(console.log);

        console.log(session.getIdToken().getJwtToken());
      });
    } else {
      console.log("cognitoUser null");
    }
  } catch (e) {
    console.log(e);
    console.log("error", e);
  }
}

signIn("jfrshd94@gmail.com", "jaafar179", call);
