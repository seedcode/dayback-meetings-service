/*jshint esversion: 6 */
'use strict';

//DayBack Meetings Service Zoom Deauth
//License: MIT

//Purpose:
//Receives calls from Zoom Marketplace to deauthorize account

const allowedOrigins = ['*'];

const maxRequestsPerSession = 15;

const responseCode = {
  ok: 200,
  badRequest: 400
};
const meetingTypes = {
  zoom: 'zoom'
};
const contentType = {
  form: 'application/x-www-form-urlencoded',
  json: 'application/json',
  text: 'text/html'
};


module.exports = (req, res) => {

  var body = '';
  var postData;

  //Set Allowed origins based on constant
  if (allowedOrigins.indexOf(req.headers.origin) > -1) {
    res.setHeader('Access-Control-Allow-Origin', req.headers.origin);
  }

  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
  res.setHeader('Content-Type', 'text/json');

  //Check for post data
  if (req.method == 'POST') {
    req.on('data', function(data) {
      body += data;
    });
    req.on('end', function() {
      postData = JSON.parse(body);
      returnSuccess('Successfully Processed Deauthorization Request');
    });
  }
  else {
    req.on('data', function(data) {
      body += data;
    });
    req.on('end', function() {
      try {
        postData = JSON.parse(body);
      } catch (e) {
        postData = body;
      }

      if (postData.payload) {
        if (postData.user_id && postData.account_id && postData.client_id) {
          returnSuccess('Successfully Processed Deauthorization Request');
        }
      }
      else {
        //Return basic OK page on get request
        res.writeHead(responseCode.ok, {
          'Content-Type': contentType.text
        });
        res.end('OK');
      }
    });
  }

  //Returns an error to Zoom
  function returnError(errorMessage, status, error) {
    res.end(JSON.stringify({
      status: status ? status : responseCode.badRequest,
      error: error ? error : responseCode.badRequest,
      message: errorMessage
    }));
  }

  //Returns a success message to Zoom
  function returnSuccess(message, status) {
    res.end(JSON.stringify({
      status: status ? status : responseCode.ok,
      message: message
    }));
  }
};
