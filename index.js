const { WebClient } = require("@slack/web-api");
const token = process.env.slackToken;
const botId = process.env.slackBot;
const slack = new WebClient(token);
const { DateTime } = require('luxon');

const fs = require('fs');
const readline = require('readline');
const {google} = require('googleapis');
const temperatureStrings = [
  "🌡 I know you're really cool ❄️, but could you quantify that specifically in degrees centigrade?",
  "🌡 BOT DEMANDS YOUR TEMPERATURE!",
  "🌡 Is that a thermometer in your pocket?",
  "🌡 Aren't you looking hot today! No seriously, could you check your temperature?",
  "🌡 What's the difference between an oral and a rectal thermometer? The taste.",
  "🌡 Scientifically speaking you should be reporting in Kelvin, but I will accept celcius this one time.",
  "🌡 Greetings human, for your own safety please reveal your current temperature",
  "🌡 Sorry, my thermal camera is malfunctioning, please input your temperature."
];

const readingStrings = [
  "Thank you! You've made this bot very happy! 🤖",
  "You know I've seen a lot of temperatures in my time, but yours are always the best 💛",
  "Thanks! Just so you know, my friends call me 'Freddie' 🎸",
  "An excellent temperature 🥶"
];

const welcomeStrings = [
  "Hi there! I'm @mercury and I'm a temperature taking bot. My job is to make sure my humans don't overheat 🤒"
];

// If modifying these scopes, delete token.json.
const SCOPES = ['https://www.googleapis.com/auth/spreadsheets'];
let sendList = [];

function authorize(credentials, callback, params) {
  const {client_secret, client_id, redirect_uris} = credentials.installed;
  const oAuth2Client = new google.auth.OAuth2(
      client_id, client_secret, redirect_uris[0]);

  oAuth2Client.setCredentials(JSON.parse(process.env.gsuiteToken));
  callback(oAuth2Client, params);  
}

function writeUsers(auth, params) {
  const sheets = google.sheets({version: 'v4', auth});
  let values = [];

  console.log(params.users);

  params.users.forEach(u => {
    if (Object.keys(u).length) {
      sendMessage(u.user.id, welcomeStrings[Math.floor(Math.random() * welcomeStrings.length)]);
      values.push([u.user.id, u.user.real_name, '@' + u.user.name]);
      sendList.push(u.user.id);
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
  
  sheets.spreadsheets.values.update(req).then((res) => console.log(res.data));
  console.log(sendList);
  sendList.forEach(u => {    
    sendMessage(u, temperatureStrings[Math.floor(Math.random() * temperatureStrings.length)]);
  });
}

const resolveEmailsAndUpdateSheet = async (params) => {
  const resolvedRows = params.rows.map(row => {
    if (!row[1]) {       
      return slack.users.lookupByEmail({email: row[0]}).catch(e => {
        console.log(e + ": " + row[0]);
        return {};
      });
    } else {
      sendList.push(row[1]);
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

function writeTemp(auth, params) {
  const sheets = google.sheets({version: 'v4', auth});

  //Date related garbage
  new Date()

  const req = {
    spreadsheetId: '1dFmuyedPEKJz_BR9aVKOsd5NOm0W5g_H0HE91b-x29c',
    range: 'Readings!A2:E',
    valueInputOption: 'USER_ENTERED',
    resource: {
      majorDimension: "ROWS",
      range: 'Readings!A2:E',
      values: [[
        params.u, 
        "=LOOKUP(A2,Users!B:B,Users!C:C)", 
        params.t, 
        DateTime.local().setZone("Asia/Singapore").toISODate(), 
        (DateTime.local().setZone("Asia/Singapore").hour >= 12) ? "PM" : "AM"
      ]]
    }
  }
  
  sheets.spreadsheets.values.append(req).then((res) => console.log(res.data));
}

function sendMessage(u, m) {
  (async () => {
    // Post a message to the channel, and await the result.
    // Find more arguments and details of the response: https://api.slack.com/methods/chat.postMessage
    const result = await slack.chat.postMessage({
      text: m,
      channel: u,
    });

    // The result contains an identifier for the message, `ts`.
    console.log(`Successfully send message ${result.ts} in conversation ${u}`);
  })();
}

exports.notifyEveryone = (req, res) => {
  authorize(JSON.parse(process.env.gsuiteCreds), getUsers);
  res.sendStatus(200);
};

exports.slackAttack = (req, res) => {
  switch (req.body.type) {
    case "url_verification":
      res.send(req.body);
      break;
    case "event_callback":
      const e = req.body.event
      res.sendStatus(200);
      if (!e.bot_profile && e.channel_type == "im") {
        if (!isFinite(String(e.text).trim() || NaN)) {
          sendMessage(e.user, "That doesn't appear to be a number and I don't do small talk. Could you please try again?");
        } else {
          if (e.text > 50) {
            sendMessage(e.user, "Wow that's really hot 🔥! Are you sure that's in *degrees celcius*?");
          } else {
            authorize(JSON.parse(process.env.gsuiteCreds), writeTemp, {u: e.user, t: e.text});
            sendMessage(e.user, readingStrings[Math.floor(Math.random() * readingStrings.length)]);
          }
        }        
      }
      break;
    default:
      res.sendStatus(500);
      console.log("Well I couldn't figure that one out.")
      break;
  }
};