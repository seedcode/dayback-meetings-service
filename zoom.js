/*jshint esversion: 6 */

//Zoom config for DayBack Meetings Service v4.1
//License: MIT

const apiID = process.env.ZOOM_ID;
const apiSecret = process.env.ZOOM_SECRET;
const moment = require('moment');

module.exports = {
	id: apiID,
	secret: apiSecret,
	apiConfig: {
		id: 'zoom',
		meetingPrefix: 'Zoom - ',
		rootURI: 'https://api.zoom.us/v2/meetings/',
		meetingSearchRegex: new RegExp(
			'Meeting ID:\\s(\\d*)[\\s\\S]*(https://(.*.)?zoom.us/j/(\\d*)(\\?pwd=)?(\\w*)?)'
		),
		refreshTokenErrorRegex: new RegExp('Invalid.*Token'),
		authorizationHeaders: function (headers) {
			headers.Authorization =
				'Basic ' +
				Buffer.from(apiID + ':' + apiSecret).toString('base64');
			return headers;
		},
		authTokenHeader: function (headers, authToken) {
			if (authToken) {
				headers.authorization = 'Bearer ' + authToken;
			}
			return headers;
		},
		openURL: function (meetingDetails) {
			return meetingDetails[2];
		},
		authRequestType: 'POST',
		authURL: function (postData) {
			return 'https://zoom.us/oauth/token';
		},
		authSendData: function (postData) {
			return {
				grant_type: 'authorization_code',
				code: postData.authCode,
				redirect_uri: postData.redirectURI,
			};
		},
		refreshRequestType: 'POST',
		refreshURL: function (refreshToken) {
			return 'https://zoom.us/oauth/token';
		},
		refreshSendData: function (refreshToken) {
			return {
				grant_type: 'refresh_token',
				refresh_token: refreshToken,
			};
		},
		deauthRequestType: 'DELETE',
		deauthURL: function (authToken) {
			return 'https://zoom.us/oauth/revoke?token=' + authToken;
		},
		deleteRequestType: 'DELETE',
		deleteURL: function (meetingNumber, authToken) {
			return this.rootURI + meetingNumber;
		},
		deleteSendData: function (authToken) {
			return {};
		},
		updateRequestType: 'PATCH',
		updateURL: function (meetingNumber, authToken) {
			return this.rootURI + meetingNumber;
		},
		existingCheckType: 'GET',
		existingCheckURL: function (meetingNumber, authToken) {
			return this.rootURI + meetingNumber;
		},
		existingSendData: function (authToken) {
			return {};
		},
		createRequestType: 'POST',
		createURL: function (authToken) {
			return 'https://api.zoom.us/v2/users/me/meetings';
		},
		createSendData: function (postData, authToken) {
			return {
				topic: postData.editEvent.titleEdit,
				start_time:
					moment(postData.editEvent.start)
						.toISOString()
						.split('.')[0] + 'Z',
				duration: moment
					.duration(
						moment(postData.editEvent.end).diff(
							moment(postData.editEvent.start)
						)
					)
					.asMinutes(),
				type: 2,
				password: this.makePassword(),
				settings: {
					join_before_host: false,
					waiting_room: true,
				},
			};
		},
		makePassword: function () {
			return Math.round(
				Math.pow(36, 10 + 1) - Math.random() * Math.pow(36, 10)
			)
				.toString(36)
				.slice(1);
		},
		createReturnData: function (requestResult, postData) {
			return {
				meetingNumber: this.meetingNumber(requestResult),
				joinURL: requestResult.join_url,
				password: requestResult.password,
				editEvent: postData.editEvent,
			};
		},
		verifyCreateResult: function (requestResult) {
			return requestResult.uuid;
		},
		conflictRequestType: 'GET',
		conflictURL: function (nextPageToken, authToken) {
			return (
				'https://api.zoom.us/v2/users/me/meetings?' +
				(nextPageToken
					? 'next_page_token=' + nextPageToken + '&'
					: '') +
				'page_size=' +
				100 +
				'&type=' +
				'upcoming'
			);
		},
		conflictSendData: function (authToken) {
			return {};
		},
		rescheduleSendData: function (titleWithoutPrefix, postData, authToken) {
			return {
				topic: titleWithoutPrefix,
				start_time:
					moment(postData.editEvent.start)
						.toISOString()
						.split('.')[0] + 'Z',
				duration: moment
					.duration(
						moment(postData.editEvent.end).diff(
							moment(postData.editEvent.start)
						)
					)
					.asMinutes(),
				type: 2,
			};
		},
		additionalPageCheck: function (requestResult) {
			return (
				typeof requestResult.next_page_token === 'undefined' ||
				requestResult.next_page_token === ''
			);
		},
		meetingDescription: function (requestResult) {
			return (
				'Meeting ID: ' +
				requestResult.id +
				'\nJoin URL: ' +
				requestResult.join_url
			);
		},
		meetingNumber: function (requestResult) {
			return requestResult.id;
		},
		conflictVerification: function (
			postData,
			meetingDetails,
			requestResponse
		) {
			return (
				(!meetingDetails || requestResponse.id != meetingDetails[1]) &&
				moment(requestResponse.start_time) <
					moment(postData.editEvent.end) &&
				moment(requestResponse.start_time).add(
					parseInt(requestResponse.duration),
					'minutes'
				) > moment(postData.editEvent.start)
			);
		},
		meetingObject: function (requestResult) {
			return {
				meetingNumber: requestResult.id,
				topic: requestResult.topic,
				start: moment(requestResult.start_time),
				end: moment(requestResult.start_time).add(
					parseInt(requestResult.duration),
					'minutes'
				),
			};
		},
		authToken: function (requestResult) {
			return requestResult.access_token;
		},
		refreshToken: function (requestResult) {
			return requestResult.refresh_token;
		},
		oauthSrc: function (postData) {
			return (
				'https://zoom.us/oauth/authorize?response_type=code&client_id=' +
				apiID +
				'&redirect_uri=' +
				postData.redirectURI
			);
		},
		oauthStyle: function (postData) {
			var leftCalc = postData.innerWidth / 2 - 190;
			var topCalc = postData.innerHeight / 2 - 310;
			return {
				position: 'absolute',
				width: '400px',
				height: '700px',
				left: (leftCalc > 0 ? leftCalc : 0) + 'px',
				top: (topCalc > 0 ? topCalc : 0) + 'px',
				border: '18px rgba(45, 140, 255, .8) solid',
				borderRadius: '18px',
				transition: 'all 2s',
				zIndex: 1000,
				display: 'none',
				opacity: 0,
			};
		},
		closeDivStyle: function (postData) {
			var leftCalc = postData.innerWidth / 2 + 9;
			var topCalc = postData.innerHeight / 2 - 199;
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
				zIndex: 1000,
			};
		},
		redirectAuthIndex: 1,
		redirectAuthRegex: '.*code=(.*)',
		errorCode: function (requestResult, requestResponse) {
			return requestResult.code
				? requestResult.code
				: requestResult.error != undefined && requestResult.error.code
				? requestResult.error.code
				: requestResponse
				? requestResponse.statusCode
				: 'general error';
		},
		errorMessage: function (requestResult) {
			return requestResult.message
				? requestResult.message
				: requestResult.reason
				? requestResult.reason
				: requestResult.error != undefined &&
				  requestResult.error.message
				? requestResult.error.message
				: 'No message returned from ' + this.id;
		},
	},
	meetingType: 'zoom',
};
