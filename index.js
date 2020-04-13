//Unique bot identifiers and secrets from Slack
const botId = process.env.slackBot;
const clientId = process.env.clientId;
const clientSecret = process.env.clientSecret;

//Set APIs and libraries up
const { WebClient } = require("@slack/web-api");
const {google} = require('googleapis');
const { DateTime } = require('luxon');
const axios = require('axios');

//Ask for temperature
const temperatureStrings = [
  "🌡 I know you're really cool ❄️, but could you quantify that specifically in degrees centigrade?",
  "🌡 BOT DEMANDS YOUR TEMPERATURE! 🤖",
  "🌡 Is that a thermometer in your pocket? 🦾",
  "🌡 Aren't you looking hot today! No seriously, could you check your temperature? 🔥",
  "🌡 What's the difference between an oral and a rectal thermometer? The taste. 🤢",
  "🌡 Scientifically speaking you should be reporting in Kelvin, but I will accept Celsius this one time. 🤓",
  "🌡 Greetings human, for your own safety please reveal your current temperature. 🤒",
  "🌡 Sorry, my thermal camera is malfunctioning, please input your temperature. 📸",
  "🌡 Hey, it's that time of day again. Do your thing! ⏲",
  "🌡 Did you know Galileo is often mistaken to be the inventor of the thermometer? GALILEO FIGARO! 🎶",  
  "🌡 I'm feeling lonely today. Do you have a temperature to cheer me up? 🥺"
];

//Thank for temperature
const readingStrings = [
  "Thank you! You've made this bot very happy! 🤖",
  "You know I've seen a lot of temperatures in my time, but yours are always the best 💛",
  "Thanks! Just so you know, my friends call me 'Freddie' 🎸",
  "An excellent temperature 😙👌",
  "You know you can't spell Hug without the Hg + U ❤️",
  "Smokin'! No wait, that would be bad. Lukewarm! ☀️",
  "What? That's perfect! That's the G.T.O.A.T.! 🐐",
  "Stay chill my homosapien 🥶"
];

//Welcome to @mercury
const welcomeStrings = [
  "Hi there! I'm @mercury and I'm a temperature taking bot. My job is to make sure my humans don't overheat 🤒"
];

// If modifying these scopes, delete token.json.
const SCOPES = ['https://www.googleapis.com/auth/spreadsheets'];

let sendList = [];
let sheetId = "";
let slack = "";

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
    spreadsheetId: sheetId,
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
  sheets.spreadsheets.values.get({
    spreadsheetId: sheetId,
    range: 'Users!A2:D',
  }, (err, res) => {
    if (err) return console.log('The API returned an error: ' + err);    
    const rows = res.data.values;
    
    console.log("SheetResult = " + rows);

    if (rows.length) {      
      resolveEmailsAndUpdateSheet({rows: rows, auth: auth});
    } else {
      console.log('No data found.');
    }
  });
}

function writeTemp(auth, params) {
  console.log(params);  
  const sheets = google.sheets({version: 'v4', auth});

  const req = {
    spreadsheetId: sheetId,
    range: 'Readings!A2:E',
    valueInputOption: 'USER_ENTERED',
    resource: {
      majorDimension: "ROWS",
      range: 'Readings!A2:E',
      values: [[
        params.u, 
        '=VLOOKUP(INDIRECT("A"&row()),Users!B:C,2, FALSE)',
        params.t, 
        DateTime.local().setZone("Asia/Singapore").toISODate(), 
        (params.a) ? "AM" : ((DateTime.local().setZone("Asia/Singapore").hour >= 13) ? "PM" : "AM"),
        DateTime.local().setZone("Asia/Singapore").toLocaleString(DateTime.DATETIME_SHORT)
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
  //Pull team data from environment
  teamData = JSON.parse(process.env[req.query.slack]);

  slack = new WebClient(teamData.slackToken);
  sheetId = teamData.sheetId;
  
  authorize(JSON.parse(process.env.gsuiteCreds), getUsers);
  res.sendStatus(200);
};

exports.auth = (req, res) => {
  if (req.query.code) {
    console.log(req.query);
    const c = req.query.code;

    axios.post("https://slack.com/api/oauth.v2.access", "code=" + c, {
      auth: {
        username: clientId,
        password: clientSecret
      },
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      }
    }).then(function(response) {
      console.log(response.data);
      res.send(response.data);
    });
  } else {
    res.redirect(301, "https://slack.com/oauth/authorize?client_id=" + clientId + "&scope=channels:read chat:write:bot users.profile:read users:read users:read.email&redirect_uri=&state=")  
  }  
};

exports.slackAttack = (req, res) => {
  if (req.get("X-Slack-Retry-Num")) {
    res.sendStatus(200);
    console.log('Caught a retry #' + req.get("X-Slack-Retry-Num"))
  } else {
    switch (req.body.type) {
      case "url_verification":
        res.send(req.body);
        break;
      case "event_callback":      
        //Pull team data from environment
        teamData = JSON.parse(process.env[req.body.team_id]);
        
        slack = new WebClient(teamData.slackToken);
        sheetId = teamData.sheetId;
        
        const e = req.body.event;

        let amFlag = false;
        res.sendStatus(200);        
        if (!e.bot_profile && e.channel_type == "im") {
          if (e.text.split(" ")[1] == "AM") {
            amFlag = true;
            e.text = e.text.split(" ")[0];
          } 
          if (!isFinite(String(e.text).trim() || NaN)) {
            sendMessage(e.user, "That doesn't appear to be a number and I don't do small talk. Could you please try again?");
          } else {
            if (e.text > 50) {
              sendMessage(e.user, "Wow that's really hot 🔥! Are you sure that's in *degrees celcius*?");
            } else if (e.text >= 35 && e.text < 37.5) {
              authorize(JSON.parse(process.env.gsuiteCreds), writeTemp, {u: e.user, t: e.text, a: amFlag});
              sendMessage(e.user, readingStrings[Math.floor(Math.random() * readingStrings.length)]);            
            } else if (e.text < 35) {
              sendMessage(e.user, "Wow that's really cold ❄️! I think your thermal measuring device requires calibration. Try again?");
            } else {
              authorize(JSON.parse(process.env.gsuiteCreds), writeTemp, {u: e.user, t: e.text, a: amFlag});
              sendMessage(e.user, "Fever detected! Alerting team! 🥵");
              sendMessage(teamData.emergencyUser, "FEVER DETECTED in " + e.user);
            }
          }
        }      
        break;
      default:
        res.sendStatus(500);
        console.log("Well I couldn't figure that one out.")
        break;
    }
  }
};