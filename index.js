/*jshint esversion: 6 */
'use strict';

//DayBack Meetings Service v2.0
//License: MIT

//Purpose:
//Receives calls from DayBack Custom actions to create, delete, update, or start
//meetings in a related meeting API

//This file is intended to run as a Zeit deployment. See https://zeit.co for more info

const request = require('request');
const moment = require('moment');
const zoomID = process.env.ZOOM_ID;
const zoomSecret = process.env.ZOOM_SECRET;
const auth = 'Basic ' + new Buffer(zoomID + ':' + zoomSecret).toString('base64');
const allowedOrigins = ['http://app.dayback.com', 'https://app.dayback.com'];

const maxRequestsPerSession = 15;

const responseCode = {
  zoomFailedAuth: 124,
  ok: 200,
  created: 201,
  noContent: 204,
  badRequest: 400,
  authRequired: 401,
  loopDetected: 508
};

const meetingTypes = {
  zoom: 'zoom'
};

const actions = {
  create: 'create',
  delete: 'delete',
  eventdelete: 'eventdelete',
  update: 'update',
  start: 'start',
  deauthorize: 'deauthorize',
  authcreate: 'authcreate',
  authdelete: 'authdelete',
  authupdate: 'authupdate',
  deleteandreplace: 'deleteandreplace',
  deleteandcontinue: 'deleteandcontinue',
  leaveandcontinue: 'leaveandcontinue'
};

const contentType = {
  form: 'application/x-www-form-urlencoded',
  json: 'application/json',
  text: 'text/html'
};


module.exports = (req, res) => {

  var conflictingMeetings = [];
  var conflictingMeetingIndex;
  var meetingDetails;
  var authToken;
  var refreshToken;
  var meetingType;
  var sendData;
  var postData;
  var meetingSearchRegex;
  var meetingPrefix;
  var meetingToDelete;
  var originalAction;
  var sessionRequests = 0;
  var returnTokens = false;
  var body = '';

  //Set Allowed origins based on constant
  if (allowedOrigins.indexOf(req.headers.origin) > -1) {
    res.setHeader('Access-Control-Allow-Origin', req.headers.origin);
  }

  //Set allowed methods, headers, and default content type
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
      var returnPayload = postData.returnPayload;
      var action = postData.action;

      //Keep track of the original action requested
      originalAction = postData.action;
      if (postData.returnPayload) {
        if (postData.returnPayload.originalAction) {
          originalAction = postData.returnPayload.originalAction;
        }
      }

      //Account for undefined title and description
      if (!postData.editEvent.titleEdit || postData.editEvent.titleEdit === 'undefined') {
        postData.editEvent.titleEdit = '';
      }
      if (!postData.editEvent.description || postData.editEvent.description === 'undefined') {
        postData.editEvent.description = '';
      }

      //Set auth and refresh token if in returnPayload
      if (postData.authToken) {
        authToken = postData.authToken;
      }
      if (postData.refreshToken) {
        refreshToken = postData.refreshToken;
      }
      if (returnPayload != undefined) {
        if (returnPayload.authToken) {
          authToken = returnPayload.authToken;
        }
        if (returnPayload.refreshToken) {
          refreshToken = returnPayload.refreshToken;
        }
      }

      //Returns on valid meeting type and sets matching meetingSearchRegex
      meetingType = verifyMeetingType(postData.meetingType);

      //Find meeting in event description
      meetingDetails = postData.editEvent.description.match(new RegExp(meetingSearchRegex));

      //Initial actions that can be called from the custom action
      if (action === actions.delete || action === actions.eventdelete) {
        if (meetingType === meetingTypes.zoom) {
          if (meetingDetails) {
            if (action === actions.delete) {
              if (authToken && refreshToken) {
                authorizeAPI(function() {
                  deleteMeeting(meetingDetails[1], returnDeleteResult);
                });
              }
              else {
                returnSuccess('Authorizing ' + meetingType, getOAuthConfig(actions.authdelete), responseCode.authRequired);
              }
            } else if (action === actions.eventdelete) {
                if (authToken && refreshToken) {
                  returnModal('Would you like to delete the associated meeting?', '',
                  'No', null, 'Yes', actions.authdelete, null, null,
                    {
                      returnPayload: {
                        originalAction: originalAction,
                        authToken: authToken,
                        refreshToken: refreshToken
                      }
                    },
                  responseCode.ok);
                }
                else {
                  returnModal('Would you like to delete the associated meeting?', '',
                  'No', null, 'Yes', actions.authdelete, null, null,
                  getOAuthConfig(actions.authdelete), responseCode.authRequired);
              }
            }
          } else {
            if (action === actions.delete) {
              returnError('Failed to delete meeting - No meeting found in event details.');
            } else if (action === actions.eventdelete) {
              returnSuccess();
            }
          }
        }
      } else if (action === actions.start) {
        if (meetingType === meetingTypes.zoom) {
          if (meetingDetails) {
            returnSuccess(null, {
              'openUrl': 'https://zoom.us/j/' + meetingDetails[1]
            });
          } else {
            returnError('No meeting details found in description');
          }
        }
      } else if (action === actions.create) {
        if (meetingType === meetingTypes.zoom) {
          if (authToken && refreshToken) {
            checkForInvalidMeetingDuration();
            authorizeAPI(createMeeting);
          }
          else {
            returnSuccess('Authorizing ' + meetingType, getOAuthConfig(actions.authcreate), responseCode.authRequired);
          }
        }
      } else if (action === actions.update) {
        if (meetingType === meetingTypes.zoom) {
          //If start or end changed and meeting data exists in details, prompt to reschedule Meeting
          //TODO: Add check for title change without triggering on meeting create
          if ((postData.changesObject.start || postData.changesObject.end) && meetingDetails) {
            if (authToken && refreshToken) {
              sendData = {
                returnPayload: {
                  originalAction: originalAction,
                  authToken: authToken,
                  refreshToken: refreshToken
                }
              };
              sendData.returnPayload.meetingNumber = meetingDetails[1];
              returnModal('Would you like to update the Meeting?', '', 'No',
              null, 'Update', actions.authupdate, null, null,
              sendData, responseCode.ok);
            }
            else {
              sendData = getOAuthConfig(actions.authupdate);
              sendData.returnPayload.meetingNumber = meetingDetails[1];
              returnModal('Would you like to update the Meeting?', '', 'No',
              null, 'Update', actions.authupdate, null, null,
              sendData, responseCode.authRequired);
            }
          } else {
            returnSuccess();
          }
        }
      } else if (action === actions.deauthorize) {
        if (meetingType === meetingTypes.zoom) {
          if (!authToken) {
            returnModal('Empty Auth Token', 'This token may have already been deauthorized', 'OK');
          }
          else {
          sendData = JSON.stringify(
            {token: authToken}
          );
            submitRequest('POST', 'https://zoom.us/oauth/revoke?token=' + authToken, contentType.form,
              function() {returnModal('Success', 'Successfully deauthorized DayBack from Zoom', 'OK', null, null, null, null, null, {clearAuth: true});},
               responseCode.ok, 'Error deauthorizing Zoom', function () {},
                function(code, message, errorMessage) {
                  if (code === responseCode.badRequest) {
                    returnModal('Success', 'Successfully deauthorized DayBack from Zoom', 'OK', null, null, null, null, null, {clearAuth: true});
                  }
                else {
                  returnError(errorMessage + ' - ' + message, responseCode.badRequest, code);
                  }
                });
          }
        }
      }

      //Actions requiring authorization with meeting API
      else if (action === actions.authdelete) {
        if (meetingType === meetingTypes.zoom) {
          authorizeAPI(function() {
            deleteMeeting(meetingDetails[1], returnDeleteResult);
          });
        }
      } else if (action === actions.authcreate) {
        if (meetingType === meetingTypes.zoom) {
          checkForInvalidMeetingDuration();
          authorizeAPI(createMeeting);
        }
      } else if (action === actions.authupdate) {
        if (meetingType === meetingTypes.zoom) {
          //User requested to reschedule the meeting
          checkForInvalidMeetingDuration();
          authorizeAPI(function() {
            submitConflictingMeetingRequest(1);
          });
        }
      }

      //Modal Callback Actions
      else if (action === actions.deleteandreplace) {
        //User requested to delete and replace the existing meeting
        if (meetingType === meetingTypes.zoom) {
          deleteMeeting(returnPayload.meetingNumber, function() {
            submitConflictingMeetingRequest(1);
          });
        }
      } else if (action === actions.leaveandcontinue) {
        //User requested to leave a conflicting meeting as is
        conflictingMeetings = returnPayload.conflictingMeetings;
        conflictingMeetingIndex = returnPayload.conflictingMeetingIndex + 1;
        if (meetingType === meetingTypes.zoom) {
          loopConflicting();
        }
      } else if (action === actions.deleteandcontinue) {
        //User requested to delete a conflicting meeting
        conflictingMeetings = returnPayload.conflictingMeetings;
        conflictingMeetingIndex = returnPayload.conflictingMeetingIndex;
        meetingToDelete = conflictingMeetings[conflictingMeetingIndex].meetingNumber;
        conflictingMeetingIndex++;
        if (meetingType === meetingTypes.zoom) {
          deleteMeeting(meetingToDelete, loopConflicting);
        }
      }

      //Return an invalid request response if none of the actions are accepted
      else {
        returnError('Invalid request');
      }
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

      //Deauthorization request from Zoom Marketplace
      if (postData.payload) {
        if (postData.user_id && postData.account_id && postData.client_id) {
           if (postData.client_id == zoomID) {
             returnSuccess('Successfully deauthorized DayBack Meetings Service');
           }
        }
      }
      else {
        //Return basic OK page on get request
        res.writeHead(responseCode.ok, {
          'Content-Type': contentType.text
        });
        res.end('DayBack Meetings Service Running');
      }
    });
  }



  function checkForInvalidMeetingDuration() {

    //Check for allDay or event greater than 24 hours
    if (postData.editEvent.allDay ||
      parseInt(moment.duration(moment(postData.editEvent.end).diff(moment(postData.editEvent.start))).asMinutes()) <= 0 ||
      parseInt(moment.duration(moment(postData.editEvent.end).diff(moment(postData.editEvent.start))).asMinutes()) > (24 * 60)) {
      returnModal('Meeting cannot be scheduled for all-day events or those with a duration greater than 24-hours', '', 'OK');
    }

    //Check that start time is in the future
    else if (moment(postData.editEvent.start) < moment(Date.now())) {
      returnModal('Meeting cannot be scheduled in the past', '', 'OK');
    }
  }

  function deleteMeeting(meetingNumber, callback) {
    if (meetingType === meetingTypes.zoom) {

      //Submit the request to delete the meeting
      submitRequest('DELETE',
        'https://api.zoom.us/v2/meetings/' +
        meetingNumber + '?access_token=' + authToken,
        contentType.form,
        callback,
        responseCode.noContent, 'Error deleting meeting');
    }
  }

  function returnDeleteResult(result) {
    if (meetingType === meetingTypes.zoom) {
      removeMeetingDetails();
      returnSuccess('Meeting successfully deleted', {
        editEvent: postData.editEvent
      });
    }
  }

  function sendRescheduleRequest() {
    var titleWithoutPrefix = postData.editEvent.titleEdit;

    //Remove previous meeting prefix from the new title.
    if (postData.editEvent.titleEdit.substring(0, meetingPrefix.length) === meetingPrefix) {
      titleWithoutPrefix = postData.editEvent.titleEdit.substring(meetingPrefix.length);
    }
    if (meetingType === meetingTypes.zoom) {
      sendData = JSON.stringify({
        'topic': titleWithoutPrefix,
        'start_time': moment(postData.editEvent.start).toISOString().split('.')[0] + 'Z',
        'duration': moment.duration(moment(postData.editEvent.end).diff(moment(postData.editEvent.start))).asMinutes(),
        'type': 2
      });

      //Submit request to update the meeting
      submitRequest('PATCH',
        'https://api.zoom.us/v2/meetings/' + meetingDetails[1] + '?access_token=' + authToken,
        contentType.json,
        function() {
          returnSuccess('Meeting successfully rescheduled');
        },
        responseCode.noContent, 'Error rescheduling meeting');
    }
  }

  function createMeeting() {

    if (meetingType === meetingTypes.zoom) {
      //Check for existing meeting if one is in the description
      if (meetingDetails) {
        sendData = JSON.stringify({
          access_token: authToken
        });
        //Submit request to check for existing meeting
        submitRequest('GET',
          'https://api.zoom.us/v2/meetings/' + meetingDetails[1] + '?access_token=' + authToken,
          contentType.form,
          checkExisting,
          responseCode.ok, 'Error checking for existing meeting');
      }

      //Check for Conflicting Meetings
      else {
        submitConflictingMeetingRequest(1);
      }
    }
  }

  function sendCreateRequest() {
    removeMeetingDetails();

    if (meetingType === meetingTypes.zoom) {
      sendData = JSON.stringify({
        'topic': postData.editEvent.titleEdit,
        'start_time': moment(postData.editEvent.start).toISOString().split('.')[0] + 'Z',
        'duration': moment.duration(moment(postData.editEvent.end).diff(moment(postData.editEvent.start))).asMinutes(),
        'type': 2
      });

      //Submit request to create meeting
      submitRequest('POST',
        'https://api.zoom.us/v2/users/me/meetings?access_token=' + authToken,
        contentType.json,
        returnCreateResult,
        responseCode.created, 'Error creating meeting');
    }
  }


  function returnCreateResult(result) {
    var meetingInformation;

    if (meetingType === meetingTypes.zoom) {
      meetingInformation = 'Meeting ID: ' + result.id + '\nJoin URL: ' + result.join_url;

      if (result.uuid) {
        postData.editEvent.titleEdit = meetingPrefix + postData.editEvent.titleEdit;
        postData.editEvent.description = postData.editEvent.description === '' ? meetingInformation : (postData.editEvent.description + '\n' + meetingInformation);
        returnSuccess('Meeting successfully created', {
          meetingNumber: result.id,
          joinURL: result.join_url,
          editEvent: postData.editEvent
        });
      } else {
        returnError('Error Creating Meeting - No meeting data returned');
      }
    }
  }

  function checkExisting(result) {
    var meeting;
    if (meetingType === meetingTypes.zoom) {

      //There is an existing meeting for this event
      if (result.uuid) {
        returnModal('There is already a meeting for this event', '', 'Cancel', null,
          'Delete and Replace', actions.deleteandreplace, null, null, {
            returnPayload: {
              authToken: authToken,
              meetingNumber: result.id,
              originalAction: originalAction
            }
          }, responseCode.OK, 'Cancel', 'Replace');
      } else {
        submitConflictingMeetingRequest(1);
      }
    }
  }

  function submitConflictingMeetingRequest(pageNumber) {
    if (meetingType === meetingTypes.zoom) {

      //Send request to check for conflicting meetings
      submitRequest('GET', 'https://api.zoom.us/v2/users/me/meetings?' +
        'page_number=' + pageNumber +
        '&page_size=' + 100 +
        '&type=' + 'scheduled' +
        '&access_token=' + authToken,
        contentType.form,
        checkConflicting,
        responseCode.ok, 'Error checking for conflicting meetings'
      );
    }
  }

  function checkConflicting(result) {
    var meeting;
    if (meetingType === meetingTypes.zoom) {
      if (result.meetings) {
        for (var i in result.meetings) {
          meeting = result.meetings[i];

          //Add to conflicting meetings if the meeting ID is not the same
          //and the meeting start/end times overlap
          if ((!meetingDetails || meeting.id != meetingDetails[1]) &&
            moment(meeting.start_time) < moment(postData.editEvent.end) &&
            moment(meeting.start_time)
            .add(parseInt(meeting.duration), 'minutes') > moment(postData.editEvent.start)) {
            conflictingMeetings.push({
              meetingNumber: meeting.id,
              topic: meeting.topic,
              start: moment(meeting.start_time),
              end: moment(meeting.start_time).add(parseInt(meeting.duration), 'minutes')
            });
          }
        }
        //Check for additional pages to query
        if (result.page_number == result.page_count) {
          conflictingMeetingIndex = 0;
          loopConflicting();
        } else {
          //Check for additional Conflicting Meetings
          submitConflictingMeetingRequest(result.page_number + 1);
        }
      } else if (originalAction === actions.create) {
        sendCreateRequest();
      } else if (originalAction === actions.update) {
        sendRescheduleRequest();
      } else {
        //Return error if the return payload doesn't have required info
        returnError('Request could not be processed due to invalid return payload');
      }
    }
  }

  //Loops through the conflicting meetings and asks the user if they'd like
  //to cancel the action, leave the existing meeting, or delete the existing meeting
  function loopConflicting() {
    var conflictingMeeting;
    var conflictingMeetingDetails;

    //If conflicting meetings, show modal, else continue action
    if (conflictingMeetings.length > 0 && conflictingMeetingIndex < conflictingMeetings.length) {
      conflictingMeeting = conflictingMeetings[conflictingMeetingIndex];
      conflictingMeetingDetails = 'Meeting: ' + conflictingMeeting.topic;
      returnModal('There is already a meeting scheduled during this time', conflictingMeetingDetails,
        'Cancel', null, 'Keep Both', actions.leaveandcontinue, 'Replace', actions.deleteandcontinue, {
          returnPayload: {
            authToken: authToken,
            conflictingMeetings: conflictingMeetings,
            conflictingMeetingIndex: conflictingMeetingIndex,
            originalAction: originalAction
          }
        }
      );
    } else {
      if (originalAction === actions.create) {
        sendCreateRequest();
      } else if (originalAction === actions.update) {
        sendRescheduleRequest();
      } else {
        //Return error if the return payload doesn't have required info
        returnError('Request could not be processed due to invalid return payload');
      }
    }
  }

  //Returns the configuration for OAuth requests, including iframe/popover styling
  function getOAuthConfig(callback) {
    if (meetingType === meetingTypes.zoom) {
      return {
        oAuthConfig: {
          iFrameInit: {
            src: 'https://zoom.us/oauth/authorize?response_type=code&client_id=' + zoomID + '&redirect_uri=' + postData.redirectURI,
            id: 'APIAuthiFrame',
            sandbox: 'allow-same-origin allow-scripts allow-popups allow-forms',
            className: 'APIAuthiFrame',
            style: {
              position: 'absolute',
              width: '300px',
              height: '500px',
              left: postData.innerWidth / 2 - 150 + 'px',
              top: postData.innerHeight / 2 - 225 + 'px',
              border: '18px rgba(45, 140, 255, .8) solid',
              borderRadius: '18px',
              transition: 'all 2s',
              zIndex: 1000,
              display: 'none',
              opacity: 0
            }
          },
          closeDivInit: {
            id: 'APICloseDiv',
            className: 'APICloseDiv',
            innerHTML: 'Close',
            style: {
              display: 'none',
              backgroundColor: 'lightgray',
              transition: 'all 2s',
              opacity: 0,
              fontWeight: 'bold',
              position: 'absolute',
              left: postData.innerWidth / 2 + 90 + 'px',
              top: postData.innerHeight / 2 - 205 + 'px',
              width: '40px',
              padding: '2px 5px 2px 5px',
              borderRadius: '3px',
              zIndex: 1000
            }
          },
          iFrameDisplay: {
            display: 'block',
            opacity: 1
          },
          closeDivDisplay: {
            display: 'block',
            opacity: 1
          },
          redirectAuthRegex: '.*code=(.*)',
          redirectAuthIndex: 1
        },
        returnPayload: {
          originalAction: originalAction
        },
        callback: callback
      };
    }
  }

  //Method to authorize the API and continue with the requested action
  function authorizeAPI(callback) {
    if (meetingType === meetingTypes.zoom) {
      if (authToken && refreshToken) {
        callback();
      }
      else {
        submitRequest('POST',
          'https://zoom.us/oauth/token?grant_type=authorization_code&code=' + postData.authCode + '&redirect_uri=' + postData.redirectURI,
          contentType.form,
          updateAuthToken,
          responseCode.ok, 'Error authorizing ' + meetingType, callback);
      }
    }
  }

  function updateAuthToken(result, callback) {
    if (meetingType === meetingTypes.zoom) {
      returnTokens = true;
      authToken = result.access_token;
      refreshToken = result.refresh_token;
      callback();
    }
  }

  function removeMeetingDetails() {
    //Remove previous meeting prefix from the new title.
    if (postData.editEvent.titleEdit.substring(0, meetingPrefix.length) === meetingPrefix) {
      postData.editEvent.titleEdit = postData.editEvent.titleEdit.substring(meetingPrefix.length);
    }
    //Remove previous meeting details from description
    if (meetingDetails) {
      postData.editEvent.description = postData.editEvent.description.substring(0, meetingDetails.index - 1) +
        postData.editEvent.description.substring(meetingDetails.index + meetingDetails[0].length);
    }
  }

  //Verify the meeting type has been specified and that this app/proxy can handle it
  function verifyMeetingType(meetingType) {
    if (!meetingType || meetingType === '') {
      returnError('Error - Meeting Type not specified');
    }
    //Add any new meeting types to this if statement
    else if (meetingType === meetingTypes.zoom) {
      meetingPrefix = 'Zoom - ';
      meetingSearchRegex = 'Meeting ID:\\s(\\d{9})[\\s\\S]*https://zoom.us/j/(\\d{9})';
      return meetingType;
    } else {
      returnError('Error - Invalid Meeting Type:' + meetingType);
    }
  }

  //Submit a request to the appropriate meeting API
  function submitRequest(method, url, contentType, callback, successCode, errorMessage, authCallback, errorCallback) {
    var headers = {};
    headers['content-type'] = contentType;

    //Return error if max requests per session exceeded
    sessionRequests++;
    if (sessionRequests > maxRequestsPerSession) {
      returnError('Maximum Session Requests Exceeded. Please deauthorize and try again or contact SeedCode if you continue to see this error',
       responseCode.badRequest, responseCode.loopDetected);
    }

    if (authCallback) {
      headers.Authorization = auth;
    }

    //Replace authCode in url with new authCode
    if (meetingType === meetingTypes.zoom && authToken && url.indexOf('access_token=') >= 0) {
      url = url.substring(0, url.indexOf('access_token=') + 13) + authToken;
    }

    request({
      url: url,
      method: method,
      headers: headers,
      body: sendData ? sendData : ''
    }, function(error, response, body) {

      var result = body ? JSON.parse(body) : '{}';
      var code = responseCode.badRequest;
      var message = 'No message returned from ' + meetingType;

      //Set error code and message returned from meeting API
      if (meetingType === meetingTypes.zoom) {
        code = result.code ? result.code : (result.error != undefined && result.error.code ? result.error.code : response.statusCode);
        message = result.message ? result.message : (result.reason ? result.reason : (result.error != undefined && result.error.message ? result.error.message : 'No message returned from ' + meetingType));
      }

      //Return error if the request failed
      if (error) {
        returnError(errorMessage + ' - ' + error, responseCode.badRequest, response.statusCode);
      }

      //Check for expected response code
      else if (code == successCode) {
        callback(result, authCallback);
      }

      //Refresh auth token if response was auth failed or auth required
      else if (refreshToken &&
          (code == responseCode.zoomFailedAuth || code === responseCode.authRequired)) {
          if (meetingType === meetingTypes.zoom){
            submitRequest('POST', 'https://zoom.us/oauth/token?grant_type=refresh_token&refresh_token=' + refreshToken,
            contentType.form,
            updateAuthToken,
            responseCode.ok, 'Error authorizing ' + meetingType,
            function() {
            submitRequest(method, url, contentType, callback, successCode, errorMessage, authCallback);
          });
        }
      }

      //Attempt to refresh token failed. Request authorization again
      else if (refreshToken && callback === updateAuthToken &&
         (code === responseCode.badRequest || message === 'The refresh token is not exists')) {
        sendData = getOAuthConfig(originalAction);
        sendData.clearAuth = true;
        returnSuccess('Authorizing ' + meetingType, sendData, responseCode.authRequired);
      }

      //Return error if the request was successful but meeting API provided an error code
      else {
        if (errorCallback) {
          errorCallback(code, message, errorMessage);
        }
        else {
          returnError(errorMessage + ' - ' + message, responseCode.badRequest, code);
        }
      }
    });
  }

  //Returns an error to DayBack
  function returnError(errorMessage, status, error) {
    res.end(JSON.stringify({
      status: status ? status : responseCode.badRequest,
      error: error ? error : responseCode.badRequest,
      message: errorMessage
    }));
  }

  //Returns a success message to DayBack
  function returnSuccess(message, payload, status) {
    payload = payload ? payload : {};
    if (returnTokens) {
      payload.authToken = authToken;
      payload.refreshToken = refreshToken;
    }
    res.end(JSON.stringify({
      status: status ? status : responseCode.ok,
      message: message,
      payload: payload
    }));
  }

  //Returns a modal prompt to DayBack
  function returnModal(title, message, button1, callback1, button2, callback2, button3, callback3, payload, status, button1Short, button2Short, button3Short) {
    payload = payload ? payload : {};
    if (returnTokens) {
      payload.authToken = authToken;
      payload.refreshToken = refreshToken;
    }
    payload.modal = {
      title: title,
      message: message,
      button1: button1,
      callback1: callback1,
      button2: button2,
      callback2: callback2,
      button3: button3,
      callback3: callback3,
      button1Short: button1Short,
      button2Short: button2Short,
      button3Short: button3Short
    };
    res.end(JSON.stringify({
      status: status ? status : responseCode.ok,
      payload: payload
    }));
  }
};
