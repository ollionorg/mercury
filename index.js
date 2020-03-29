const { WebClient } = require("@slack/web-api");
const token = process.env.slackToken;
const botId = process.env.slackBot;
const slack = new WebClient(token);

const fs = require('fs');
const readline = require('readline');
const {google} = require('googleapis');

// If modifying these scopes, delete token.json.
const SCOPES = ['https://www.googleapis.com/auth/spreadsheets'];
// The file token.json stores the user's access and refresh tokens, and is
// created automatically when the authorization flow completes for the first
// time.
const TOKEN_PATH = 'token.json';

function authorize(credentials, callback, params) {
  const {client_secret, client_id, redirect_uris} = credentials.installed;
  const oAuth2Client = new google.auth.OAuth2(
      client_id, client_secret, redirect_uris[0]);

  // Check if we have previously stored a token.
  fs.readFile(TOKEN_PATH, (err, token) => {
    if (err) return getNewToken(oAuth2Client, callback);
    oAuth2Client.setCredentials(JSON.parse(token));
    callback(oAuth2Client, params);
  });
}

function writeUsers(auth, params) {
  const sheets = google.sheets({version: 'v4', auth});
  let values = [];

  console.log(params.users);

  params.users.forEach(u => {
    if (Object.keys(u).length) {
      values.push([u.user.id, u.user.real_name, '@' + u.user.name]);            
    } else {
      values.push([]);
    }
  });
  
  const req = {
    spreadsheetId: '1dFmuyedPEKJz_BR9aVKOsd5NOm0W5g_H0HE91b-x29c',
    range: 'Users!B2:D' + params.rownum,
    valueInputOption: 'USER_ENTERED',
    resource: {
      majorDimension: "ROWS",
      range: 'Users!B2:D' + params.rownum,
      values: values
    }
  }

  console.log(params.values);
  sheets.spreadsheets.values.update(req).then((res) => console.log(res.data));
}

const resolveEmailsAndUpdateSheet = async (params) => {
  const resolvedRows = params.rows.map(row => {
    if (!row[1]) { 
      return slack.users.lookupByEmail({email: row[0]}).catch(e => {
        console.log(e + ": " + row[0]);
        return {};
      });
    } else {
      return {}
    }
  });

  const complete = await Promise.all(resolvedRows);
  writeUsers(params.auth, {rownum: params.rows.length+1, users: complete});
} 

function getUsers(auth, params) {
  const sheets = google.sheets({version: 'v4', auth});  
  let values = [];
  sheets.spreadsheets.values.get({
    spreadsheetId: '1dFmuyedPEKJz_BR9aVKOsd5NOm0W5g_H0HE91b-x29c',
    range: 'Users!A2:D',
  }, (err, res) => {
    if (err) return console.log('The API returned an error: ' + err);    
    const rows = res.data.values;
    if (rows.length) {      
      resolveEmailsAndUpdateSheet({rows: rows, auth: auth});
    } else {
      console.log('No data found.');
    }
  });
}

function sendMessage(u, c, m) {
  (async () => {
    // Post a message to the channel, and await the result.
    // Find more arguments and details of the response: https://api.slack.com/methods/chat.postMessage
    const result = await slack.chat.postMessage({
      text: m,
      channel: c,
    });

    // The result contains an identifier for the message, `ts`.
    console.log(`Successfully send message ${result.ts} in conversation ${c}`);
  })();
}

exports.notifyUsers = (req, res) => {
  // Load client secrets from a local file.
  fs.readFile('credentials.json', (err, content) => {
    if (err) return console.log('Error loading client secret file:', err);
    // Authorize a client with credentials, then call the Google Sheets API.
    authorize(JSON.parse(content), getUsers);
  });

  res.sendStatus(200);  
}

exports.slackAttack = (req, res) => {
  switch (req.body.type) {
    case "url_verification":
      res.send(req.body);
      break;
    case "event_callback":
      const e = req.body.event
      res.sendStatus(200);
      if (!e.bot_profile && e.channel_type == "im") {
        console.log(req.body);
        sendMessage(e.user, e.channel, "I hear you coming in from the other side!");
      }
      break;
    default:
      res.sendStatus(500);
      console.log("Well I couldn't figure that one out.")
      break;
  }
};