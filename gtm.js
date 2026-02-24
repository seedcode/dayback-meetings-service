/*jshint esversion: 6 */

const apiID = process.env.GTM_ID;
const apiSecret = process.env.GTM_SECRET;
const moment = require('moment');

module.exports = {
    id: apiID,
    secret: process.env.GTM_SECRET,
    apiConfig: {
    id: 'goToMeeting',
    meetingPrefix: 'GTM - ',
    rootURI: 'https://api.getgo.com/G2M/rest/',
    meetingSearchRegex: new RegExp('Meeting ID:\\s(\\d{9})[\\s\\S]*https://www.gotomeeting.com/join/(\\d{9})'),
    refreshTokenErrorRegex: new RegExp('Invalid.*Token'),
    authorizationHeaders: function(headers){headers.Authorization = 'Basic ' + new Buffer(apiID + ':' + apiSecret).toString('base64'); return headers;},
    authTokenHeader: function(headers, authToken){if(authToken){headers.accept = contentType.json; headers.Authorization = authToken;} return headers;},
    openURL: function(meetingNumber){return 'https://www.gotomeeting.com/join/' + meetingNumber;},
    authRequestType: 'POST',
    authURL: function(postData){return 'https://api.getgo.com/oauth/v2/token?grant_type=authorization_code&code=' + postData.authCode + '&redirect_uri=' + postData.redirectURI;},
    authSendData: function(postData){return 'grant_type=authorization_code&code=' + postData.authCode + '&redirect_uri=' + postData.redirectURI;},
    refreshRequestType: 'POST',
    refreshURL: function(refreshToken){return 'https://' + apiID + ':' + apiSecret + '@zoom.us/oauth/token?grant_type=refresh_token&refresh_token=' + refreshToken;},
    deauthRequestType: 'DELETE',
    deauthURL: function(authToken){return 'https://zoom.us/oauth/revoke?token=' + authToken;},
    deleteRequestType: 'DELETE',
    deleteURL: function(meetingNumber, authToken){return this.rootURI + 'meetings/' + meetingNumber;},
    updateRequestType: 'PUT',
    updateURL: function(meetingNumber, authToken){return this.rootURI + 'meetings/' + meetingNumber;},
    existingCheckType: 'GET',
    existingCheckURL: function(meetingNumber, authToken){return this.rootURI + 'meetings/' + meetingNumber;},
    existingSendData: function(authToken){return JSON.stringify({
      access_token: authToken
    });},
    createRequestType: 'POST',
    createURL: function(authToken){return this.rootURI + 'meetings';},
    createSendData: function(postData){ return JSON.stringify({
      'subject': postData.editEvent.titleEdit,
      'starttime': moment(postData.editEvent.start).toISOString().split('.')[0] + 'Z',
      'endtime': moment(postData.editEvent.end).toISOString().split('.')[0] + 'Z',
      'meetingtype': 'scheduled'
    });},
    createReturnData: function(requestResult, postData){return {
      meetingNumber: this.meetingNumber(requestResult),
      joinURL: requestResult.joinURL,
      editEvent: postData.editEvent
    };},
    verifyCreateResult: function(requestResult){ return this.meetingNumber(requestResult);},
    conflictRequestType: 'GET',
    conflictURL: function(pageNumber, authToken){return this.rootURI + 'upcomingMeetings';},
    rescheduleSendData: function (titleWithoutPrefix, postData){
      return JSON.stringify({
        'subject': titleWithoutPrefix,
        'starttime': moment(postData.editEvent.start).toISOString().split('.')[0] + 'Z',
        'endtime': moment(postData.editEvent.end).toISOString().split('.')[0] + 'Z',
        'meetingtype': 'scheduled'
      });
    },
    additionalPageCheck: function (requestResult) {return true;},
    meetingDescription: function (requestResult){return 'Meeting ID: ' + this.meetingNumber(requestResult) + '\nJoin URL: ' + requestResult.joinURL;},
    meetingNumber: function(requestResult){return requestResult.meetingid;},
    conflictVerification: function(postData, meetingDetails, requestResponse){
      return (!meetingDetails || requestResponse.meetingId != meetingDetails[1]) &&
        moment(requestResponse.startTime) < moment(postData.editEvent.end) &&
        moment(requestResponse.endTime) > moment(postData.editEvent.start);
    },
    meetingObject: function(requestResult){
      return {
        meetingNumber: requestResult.meetingId,
        topic: requestResult.subject,
        start: moment(requestResult.startTime),
        end: moment(requestResult.endTime)
      };
    },
    authToken: function(requestResult){return requestResult.access_token;},
    refreshToken: function(requestResult){return requestResult.refresh_token;},
    oauthSrc: function(postData) {return 'https://api.getgo.com/oauth/v2/authorize?response_type=code&client_id=' + apiID + '&redirect_uri=' + postData.redirectURI;},
    oauthStyle: function(postData) {
      
      const leftCalc = postData.innerWidth / 2 - 150;
      const topCalc = postData.innerHeight / 2 - 225;
      return {
        position: 'absolute',
        width: '320px',
        height: '500px',
        left: (leftCalc > 0 ? leftCalc : 0) + 'px',
        top: (topCalc > 0 ? topCalc : 0) + 'px',
        border: '18px rgba(45, 140, 255, .8) solid',
        borderRadius: '18px',
        transition: 'all 2s',
        zIndex: 1000,
        display: 'none',
        opacity: 0
      };
    },
    closeDivStyle: function(postData) {
      const leftCalc = postData.innerWidth / 2 + 9;
      const topCalc = postData.innerHeight / 2 - 199;
      return {
        display: 'none',
        color: 'rgb(255, 255, 255)',
        backgroundColor: 'rgb(14, 113, 235)',
        transition: 'all 2s',
        opacity: 0,
        fontSize: '17px',
        fontWeight: 'bold',
        fontFamily: '"Lato", "Helvetica", "Arial"',
        position: 'absolute',
        left: (leftCalc > 158 ? leftCalc : 159) + 'px',
        top: (topCalc > 25 ? topCalc : 26) + 'px',
        width: '54px',
        height: '24px',
        padding: '5px 55px',
        borderRadius: '8px',
        zIndex: 1000
      };
    },
    redirectAuthIndex: 1,
    redirectAuthRegex: '.*code=(.*)',
    errorCode: function(requestResult, requestResponse){return requestResult.code ? requestResult.code : (requestResult.error != undefined && requestResult.error.code ? requestResult.error.code : requestResponse.statusCode);},
    errorMessage: function(requestResult){return requestResult.msg ? requestResult.msg : (requestResult.reason ? requestResult.reason : (requestResult.error != undefined && requestResult.error.message ? requestResult.error.message : 'No message returned from ' + this.id));},
  },
  meetingType: 'goToMeeting'
};
