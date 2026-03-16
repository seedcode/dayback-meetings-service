/*jshint esversion: 6 */

//DayBack Meetings Service v4.2
//License: MIT

//Purpose:
//Receives calls from DayBack Custom actions to create, delete, update, or start
//meetings in a related meeting API

const zoom = require('./zoom');
const needle = require('needle');
const moment = require('moment');
const crypto = require('crypto');
const cookie = require('cookie');
const algorithm = 'aes-256-cbc';
const dmscKey = process.env.DMSC_KEY;
const xss = require('xss');
const allowedOrigins = [
	'https://app.dayback.com',
	'https://beta.dayback.com',
	'https://staging.dayback.com',
];
const maxRequestsPerSession = 15;
const clientVersion = 5.0;
const upgradeInstructions =
	'https://dayback.com/schedule-zoom-meetings-salesforce#upgrade';
const fileMakerUACheck = function (userAgent) {
	return userAgent.substring(0, 9) === 'FileMaker';
};

const meetingDetailFields = [titleEdit];

const responseCode = {
	zoomFailedAuth: 124,
	ok: 200,
	created: 201,
	noContent: 204,
	badRequest: 400,
	authRequired: 401,
	loopDetected: 508,
};

const apiPackages = [
	zoom.apiConfig,
	// gtm.apiConfig
];

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
	leaveandcontinue: 'leaveandcontinue',
	openupgradeurl: 'openupgradeurl',
};

const contentType = {
	form: 'application/x-www-form-urlencoded',
	json: 'application/json',
	text: 'text/html',
};

const cookieConfig = {
	httpOnly: true, // to disable accessing cookie via client side js
	secure: true, // to force https
	sameSite: true, // to prevent CSRF attacks
};

module.exports = (req, res) => {
	'use strict';

	const conflictingMeetings = [];
	let conflictingMeetingIndex;
	let meetingDetails;
	let authToken;
	let refreshToken;
	let encryptedAuthData;
	let apiPackage;
	let sendData;
	let postData;
	let meetingToDelete;
	let originalAction;
	let sessionRequests = 0;
	let body = '';

	//Set allowed methods, headers, and default content type
	//Set these headers if the node server is directly exposed to the internet
	//Set Allowed origins based on constant
	// if (allowedOrigins.indexOf(req.headers.origin) > -1) {
	// 	res.setHeader('Access-Control-Allow-Origin', req.headers.origin);
	// }
	// res.setHeader('Access-Control-Allow-Credentials', true);
	// res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
	// res.setHeader(
	// 	'Access-Control-Allow-Headers',
	// 	'Origin, X-Requested-With, Content-Type, Accept'
	// );

	res.setHeader('Content-Type', 'text/json');

	// Make sure required environment variables are set
	if (!dmscKey) {
		console.log('Missing DMSC_KEY environment variable');
		return;
	}

	//Check for post data
	if (req.method == 'POST') {
		req.on('data', function (data) {
			body += data;
		});
		req.on('end', function () {
			try {
				postData = JSON.parse(body);
				const returnPayload = postData.returnPayload;
				const action = postData.action;

				// Sanitize all input that will be passed to 3rd party endpoint
				for (const field of meetingDetailFields) {
					if (postData.editEvent[field]) {
						postData.editEvent[field] = xss(
							postData.editEvent[field]
						);
					}
				}

				if (action === actions.openupgradeurl) {
					returnSuccess(null, {openUrl: upgradeInstructions});
				} else if (
					!fileMakerUACheck(req.headers['user-agent']) &&
					(!postData.version || postData.version < clientVersion)
				) {
					if (
						action === actions.eventdelete ||
						action === actions.update
					) {
						returnSuccess();
						return;
					} else {
						returnModal(
							'Update Required',
							'There is a newer version of this meetings service custom action reflecting updates to Zoom. Please click OK for directions.',
							'cancel',
							null,
							'OK',
							actions.openupgradeurl
						);
						return;
					}
				}

				//Keep track of the original action requested
				originalAction = postData.action;
				if (postData.returnPayload) {
					if (postData.returnPayload.originalAction) {
						originalAction = postData.returnPayload.originalAction;
					}
				}

				//Account for undefined title and description
				if (
					!postData.editEvent.titleEdit ||
					postData.editEvent.titleEdit === 'undefined'
				) {
					postData.editEvent.titleEdit = '';
				}
				if (
					!postData.editEvent.description ||
					postData.editEvent.description === 'undefined'
				) {
					postData.editEvent.description = '';
				}

				//Returns on valid meeting type and sets matching meetingSearchRegex
				apiPackage = verifyMeetingType(postData.meetingType);

				//Set auth and refresh token
				if (!postData.authCode) {
					decryptAuthCookie(dmscKey);
				}

				if (!apiPackage) {
					return returnError(
						'Meeting type - ' +
							postData.meetingType +
							' - is not supported by this service'
					);
				}

				//Find meeting in event description
				meetingDetails = postData.editEvent.description.match(
					apiPackage.meetingSearchRegex
				);

				//Initial actions that can be called from the custom action
				if (
					action === actions.delete ||
					action === actions.eventdelete
				) {
					if (meetingDetails) {
						if (action === actions.delete) {
							if (
								postData.authCode ||
								(authToken && refreshToken)
							) {
								authorizeAPI(function () {
									deleteMeeting(
										meetingDetails[1],
										returnDeleteResult
									);
								});
							} else {
								returnSuccess(
									'Authorizing ' + apiPackage.id,
									getOAuthConfig(actions.authdelete),
									responseCode.authRequired
								);
							}
						} else if (action === actions.eventdelete) {
							if (
								postData.authCode ||
								(authToken && refreshToken)
							) {
								returnModal(
									'Would you like to delete the associated meeting?',
									'',
									'No',
									null,
									'Yes',
									actions.authdelete,
									null,
									null,
									{
										returnPayload: {
											originalAction: originalAction,
										},
									},
									responseCode.ok
								);
							} else {
								returnModal(
									'Would you like to delete the associated meeting?',
									'',
									'No',
									null,
									'Yes',
									actions.authdelete,
									null,
									null,
									getOAuthConfig(actions.authdelete),
									responseCode.authRequired
								);
							}
						}
					} else {
						if (action === actions.delete) {
							returnError(
								'Failed to delete meeting - No meeting found in event details.'
							);
						} else if (action === actions.eventdelete) {
							returnSuccess();
						}
					}
				} else if (action === actions.start) {
					if (meetingDetails) {
						returnSuccess(null, {
							openUrl: apiPackage.openURL(meetingDetails),
						});
					} else {
						returnError('No meeting details found in description');
					}
				} else if (action === actions.create) {
					if (postData.authCode || (authToken && refreshToken)) {
						checkForInvalidMeetingDuration();
						authorizeAPI(createMeeting);
					} else {
						returnSuccess(
							'Authorizing ' + apiPackage.id,
							getOAuthConfig(actions.authcreate),
							responseCode.authRequired
						);
					}
				} else if (action === actions.update) {
					//If start or end changed and meeting data exists in details, prompt to reschedule Meeting
					//TODO: Add check for title change without triggering on meeting create
					if (
						(postData.changesObject.start ||
							postData.changesObject.end) &&
						meetingDetails
					) {
						if (postData.authCode || (authToken && refreshToken)) {
							sendData = {
								returnPayload: {
									originalAction: originalAction,
								},
							};
							sendData.returnPayload.meetingNumber =
								meetingDetails[1];
							returnModal(
								'Would you like to update the Meeting?',
								'',
								'No',
								null,
								'Update',
								actions.authupdate,
								null,
								null,
								sendData,
								responseCode.ok
							);
						} else {
							sendData = getOAuthConfig(actions.authupdate);
							sendData.returnPayload.meetingNumber =
								meetingDetails[1];
							returnModal(
								'Would you like to update the Meeting?',
								'',
								'No',
								null,
								'Update',
								actions.authupdate,
								null,
								null,
								sendData,
								responseCode.authRequired
							);
						}
					} else {
						returnSuccess();
					}
				} else if (action === actions.deauthorize) {
					if (!authToken) {
						returnModal(
							'Empty Auth Token',
							'This token may have already been deauthorized',
							'OK'
						);
					} else {
						sendData = JSON.stringify({token: authToken});
						submitRequest(
							'POST',
							apiPackage.deauthURL(authToken),
							contentType.form,
							function () {
								returnModal(
									'Success',
									'Successfully deauthorized DayBack from ' +
										apiPackage.id,
									'OK',
									null,
									null,
									null,
									null,
									null,
									{clearAuth: true}
								);
							},
							responseCode.ok,
							'Error deauthorizing ' + apiPackage.id,
							function () {},
							function (code, message, errorMessage) {
								if (code === responseCode.badRequest) {
									clearAuthCookie();
									returnModal(
										'Success',
										'Successfully deauthorized DayBack from ' +
											apiPackage.id,
										'OK',
										null,
										null,
										null,
										null,
										null,
										{clearAuth: true}
									);
								} else {
									returnError(
										errorMessage + ' - ' + message,
										responseCode.badRequest,
										code
									);
								}
							}
						);
					}
				}

				//Actions requiring authorization with meeting API
				else if (action === actions.authdelete) {
					authorizeAPI(function () {
						deleteMeeting(meetingDetails[1], returnDeleteResult);
					});
				} else if (action === actions.authcreate) {
					checkForInvalidMeetingDuration();
					authorizeAPI(createMeeting);
				} else if (action === actions.authupdate) {
					//User requested to reschedule the meeting
					checkForInvalidMeetingDuration();
					authorizeAPI(function () {
						submitConflictingMeetingRequest();
					});
				}

				//Modal Callback Actions
				else if (action === actions.deleteandreplace) {
					//User requested to delete and replace the existing meeting
					deleteMeeting(returnPayload.meetingNumber, function () {
						submitConflictingMeetingRequest();
					});
				} else if (action === actions.leaveandcontinue) {
					//User requested to leave a conflicting meeting as is
					conflictingMeetings = returnPayload.conflictingMeetings;
					conflictingMeetingIndex =
						returnPayload.conflictingMeetingIndex + 1;
					loopConflicting();
				} else if (action === actions.deleteandcontinue) {
					//User requested to delete a conflicting meeting
					conflictingMeetings = returnPayload.conflictingMeetings;
					conflictingMeetingIndex =
						returnPayload.conflictingMeetingIndex;
					meetingToDelete =
						conflictingMeetings[conflictingMeetingIndex]
							.meetingNumber;
					conflictingMeetingIndex++;
					deleteMeeting(meetingToDelete, loopConflicting);
				}

				//Return an invalid request response if none of the actions are accepted
				else {
					returnError('Invalid request');
				}
			} catch (error) {
				console.log('Caught Error: ' + error);
				returnError('Server Error');
			}
		});
	} else {
		req.on('data', function (data) {
			body += data;
		});
		req.on('end', function () {
			try {
				postData = JSON.parse(body);
			} catch (e) {
				postData = body;
			}

			//Deauthorization request from Zoom Marketplace
			if (postData.payload) {
				if (
					postData.user_id &&
					postData.account_id &&
					postData.client_id
				) {
					if (postData.client_id == zoom.id) {
						returnSuccess(
							'Successfully deauthorized DayBack Meetings Service'
						);
					}
				}
			} else {
				//Return basic OK page on get request
				res.writeHead(responseCode.ok, {
					'Content-Type': contentType.text,
				});
				res.end('DayBack Meetings Service Running');
			}
		});
	}

	function checkForInvalidMeetingDuration() {
		//Check for allDay or event greater than 24 hours
		if (
			postData.editEvent.allDay ||
			moment
				.duration(
					moment(postData.editEvent.end).diff(
						moment(postData.editEvent.start)
					)
				)
				.asMinutes() <= 0 ||
			moment
				.duration(
					moment(postData.editEvent.end).diff(
						moment(postData.editEvent.start)
					)
				)
				.asMinutes() >
				24 * 60
		) {
			returnModal(
				'Meeting cannot be scheduled for all-day events or those with a duration greater than 24-hours',
				'',
				'OK'
			);
		}

		//Check that start time is in the future
		else if (moment(postData.editEvent.start) < moment(Date.now())) {
			returnModal('Meeting cannot be scheduled in the past', '', 'OK');
		}
	}

	function deleteMeeting(meetingNumber, callback) {
		//Submit the request to delete the meeting
		sendData = apiPackage.deleteSendData(authToken);
		submitRequest(
			apiPackage.deleteRequestType,
			apiPackage.deleteURL(meetingNumber, authToken),
			contentType.form,
			callback,
			responseCode.noContent,
			'Error deleting meeting'
		);
	}

	function returnDeleteResult(result) {
		removeMeetingDetails();
		returnSuccess('Meeting successfully deleted', {
			editEvent: postData.editEvent,
		});
	}

	function sendRescheduleRequest() {
		let titleWithoutPrefix = postData.editEvent.titleEdit;

		//Remove previous meeting prefix from the new title.
		if (
			postData.editEvent.titleEdit.substring(
				0,
				apiPackage.meetingPrefix.length
			) === apiPackage.meetingPrefix
		) {
			titleWithoutPrefix = postData.editEvent.titleEdit.substring(
				apiPackage.meetingPrefix.length
			);
		}
		sendData = apiPackage.rescheduleSendData(
			titleWithoutPrefix,
			postData,
			authToken
		);

		//Submit request to update the meeting
		submitRequest(
			apiPackage.updateRequestType,
			apiPackage.updateURL(meetingDetails[1], authToken),
			contentType.json,
			function () {
				returnSuccess('Meeting successfully rescheduled');
			},
			responseCode.noContent,
			'Error rescheduling meeting'
		);
	}

	function createMeeting() {
		//Check for existing meeting if one is in the description
		if (meetingDetails) {
			sendData = apiPackage.existingSendData(authToken);
			//Submit request to check for existing meeting
			submitRequest(
				apiPackage.existingCheckType,
				apiPackage.existingCheckURL(meetingDetails[1], authToken),
				contentType.form,
				checkExisting,
				responseCode.ok,
				'Error checking for existing meeting'
			);
		}

		//Check for Conflicting Meetings
		else {
			submitConflictingMeetingRequest();
		}
	}

	function sendCreateRequest() {
		removeMeetingDetails();
		sendData = apiPackage.createSendData(postData);

		//Submit request to create meeting
		submitRequest(
			apiPackage.createRequestType,
			apiPackage.createURL(authToken),
			contentType.json,
			returnCreateResult,
			responseCode.created,
			'Error creating meeting'
		);
	}

	function returnCreateResult(result) {
		const meetingDescription = apiPackage.meetingDescription(result);
		if (apiPackage.verifyCreateResult(result)) {
			postData.editEvent.titleEdit =
				apiPackage.meetingPrefix + postData.editEvent.titleEdit;
			postData.editEvent.description =
				postData.editEvent.description === ''
					? meetingDescription
					: postData.editEvent.description +
						'\n' +
						meetingDescription;
			returnSuccess(
				'Meeting successfully created',
				apiPackage.createReturnData(result, postData)
			);
		} else {
			returnError('Error Creating Meeting - No meeting data returned');
		}
	}

	function checkExisting(result) {
		//There is an existing meeting for this event
		if (apiPackage.meetingNumber(result)) {
			returnModal(
				'There is already a meeting for this event',
				'',
				'Cancel',
				null,
				'Delete and Replace',
				actions.deleteandreplace,
				null,
				null,
				{
					returnPayload: {
						meetingNumber: apiPackage.meetingNumber(result),
						originalAction: originalAction,
					},
				},
				responseCode.OK,
				'Cancel',
				'Replace'
			);
		} else {
			submitConflictingMeetingRequest();
		}
	}

	function submitConflictingMeetingRequest(nextPageToken) {
		//Send request to check for conflicting meetings
		sendData = apiPackage.conflictSendData(authToken);
		submitRequest(
			apiPackage.conflictRequestType,
			apiPackage.conflictURL(nextPageToken, authToken),
			contentType.form,
			checkConflicting,
			responseCode.ok,
			'Error checking for conflicting meetings'
		);
	}

	function checkConflicting(result) {
		let meeting;
		if (result.meetings) {
			for (let i in result.meetings) {
				meeting = result.meetings[i];

				//Add to conflicting meetings if the meeting ID is not the same
				//and the meeting start/end times overlap
				if (
					apiPackage.conflictVerification(
						postData,
						meetingDetails,
						meeting
					)
				) {
					conflictingMeetings.push(apiPackage.meetingObject(meeting));
				}
			}
			//Check for additional pages to query
			if (apiPackage.additionalPageCheck(result)) {
				conflictingMeetingIndex = 0;
				loopConflicting();
			} else {
				//Check for additional Conflicting Meetings
				submitConflictingMeetingRequest(result.next_page_token);
			}
		} else if (originalAction === actions.create) {
			sendCreateRequest();
		} else if (originalAction === actions.update) {
			sendRescheduleRequest();
		} else {
			//Return error if the return payload doesn't have required info
			returnError(
				'Request could not be processed due to invalid return payload'
			);
		}
	}

	//Loops through the conflicting meetings and asks the user if they'd like
	//to cancel the action, leave the existing meeting, or delete the existing meeting
	function loopConflicting() {
		let conflictingMeeting;
		let conflictingMeetingDetails;

		//If conflicting meetings, show modal, else continue action
		if (
			conflictingMeetings.length > 0 &&
			conflictingMeetingIndex < conflictingMeetings.length
		) {
			conflictingMeeting = conflictingMeetings[conflictingMeetingIndex];
			conflictingMeetingDetails = 'Meeting: ' + conflictingMeeting.topic;
			returnModal(
				'There is already a meeting scheduled during this time',
				conflictingMeetingDetails,
				'Cancel',
				null,
				'Keep Both',
				actions.leaveandcontinue,
				'Replace',
				actions.deleteandcontinue,
				{
					returnPayload: {
						conflictingMeetings: conflictingMeetings,
						conflictingMeetingIndex: conflictingMeetingIndex,
						originalAction: originalAction,
					},
				}
			);
		} else {
			if (originalAction === actions.create) {
				sendCreateRequest();
			} else if (originalAction === actions.update) {
				sendRescheduleRequest();
			} else {
				//Return error if the return payload doesn't have required info
				returnError(
					'Request could not be processed due to invalid return payload'
				);
			}
		}
	}

	//Returns the configuration for OAuth requests, including popover styling
	function getOAuthConfig(callback) {
		return {
			oAuthConfig: {
				iFrameInit: {
					src: apiPackage.oauthSrc(postData),
					id: 'APIAuthiFrame',
					sandbox:
						'allow-same-origin allow-scripts allow-popups allow-forms',
					className: 'APIAuthiFrame',
					style: apiPackage.oauthStyle(postData),
				},
				authWindowInit: {
					src: apiPackage.oauthSrc(postData),
					id: 'APIAuthWindow',
					sandbox:
						'allow-same-origin allow-scripts allow-popups allow-forms',
					className: 'APIAuthWindow',
					style: apiPackage.oauthStyle(postData),
				},
				closeDivInit: {
					id: 'APICloseDiv',
					className: 'APICloseDiv',
					innerHTML: 'Close',
					style: apiPackage.closeDivStyle(postData),
				},
				iFrameDisplay: {
					display: 'block',
					opacity: 1,
				},
				authWindowDisplay: {
					display: 'block',
					opacity: 1,
				},
				closeDivDisplay: {
					display: 'block',
					opacity: 1,
				},
				redirectAuthRegex: apiPackage.redirectAuthRegex,
				redirectAuthIndex: apiPackage.redirectAuthIndex,
			},
			returnPayload: {
				originalAction: originalAction,
			},
			callback: callback,
		};
	}

	//Method to authorize the API and continue with the requested action
	function authorizeAPI(callback) {
		if (authToken && refreshToken) {
			callback();
		} else {
			sendData = apiPackage.authSendData(postData);
			submitRequest(
				apiPackage.authRequestType,
				apiPackage.authURL(postData),
				contentType.form,
				updateAuthToken,
				responseCode.ok,
				'Error authorizing ' + apiPackage.id,
				callback
			);
		}
	}

	function updateAuthToken(result, callback) {
		authToken = apiPackage.authToken(result);
		refreshToken = apiPackage.refreshToken(result);
		encryptAuthCookie(dmscKey);
		callback();
	}

	function removeMeetingDetails() {
		//Remove previous meeting prefix from the new title.
		if (
			postData.editEvent.titleEdit.substring(
				0,
				apiPackage.meetingPrefix.length
			) === apiPackage.meetingPrefix
		) {
			postData.editEvent.titleEdit =
				postData.editEvent.titleEdit.substring(
					apiPackage.meetingPrefix.length
				);
		}
		//Remove previous meeting details from description
		if (meetingDetails) {
			postData.editEvent.description =
				postData.editEvent.description.substring(
					0,
					meetingDetails.index - 1
				) +
				postData.editEvent.description.substring(
					meetingDetails.index + meetingDetails[0].length
				);
		}
	}

	//Verify the meeting type has been specified and that this app/proxy can handle it
	function verifyMeetingType(meetingTypeID) {
		let result;
		if (!meetingTypeID || meetingTypeID === '') {
			returnError('Error - Meeting Type not specified');
		} else {
			result = apiPackages.find((p) => p.id === meetingTypeID);
			if (!result) {
				returnError('Error - Invalid Meeting Type:' + meetingTypeID);
			} else {
				return result;
			}
		}
	}

	//Submit a request to the appropriate meeting API
	function submitRequest(
		method,
		url,
		contentTypeHeader,
		callback,
		successCode,
		errorMessage,
		authCallback,
		errorCallback
	) {
		let options = {headers: {}};
		if (contentTypeHeader === contentType.json) {
			options.json = true;
		}

		options.headers['content-type'] = contentTypeHeader;
		options.headers = apiPackage.authTokenHeader(
			options.headers,
			authToken
		);

		//Return error if max requests per session exceeded
		sessionRequests++;
		if (sessionRequests > maxRequestsPerSession) {
			returnError(
				'Maximum Session Requests Exceeded. Please deauthorize and try again or contact SeedCode if you continue to see this error',
				responseCode.badRequest,
				responseCode.loopDetected
			);
		}

		if (authCallback) {
			options.headers = apiPackage.authorizationHeaders(options.headers);
		}

		//Replace authCode in url with new authCode
		if (
			apiPackage.id === zoom.meetingType &&
			authToken &&
			url.indexOf('access_token=') >= 0
		) {
			url =
				url.substring(0, url.indexOf('access_token=') + 13) + authToken;
		}

		needle.request(
			method,
			url,
			method === 'GET' ? null : sendData,
			options,
			function (error, response, body) {
				let result = {};
				let code = responseCode.badRequest;
				let message =
					'No message returned from ' +
					apiPackage.id +
					'( ' +
					url +
					' )';

				if (body) {
					try {
						result = JSON.parse(body);
					} catch (err) {
						result = body;
					}
				}

				//Set error code and message returned from meeting API
				code = apiPackage.errorCode(result, response);
				message = apiPackage.errorMessage(result);
				//Return error if the request failed
				if (error) {
					returnError(
						errorMessage + ' - ' + error,
						responseCode.badRequest,
						code
					);
				}

				//Check for expected response code
				else if (code == successCode) {
					callback(result, authCallback);
				}

				//Refresh auth token if response was auth failed or auth required
				else if (refreshToken && code == responseCode.zoomFailedAuth) {
					sendData = apiPackage.refreshSendData(refreshToken);
					submitRequest(
						apiPackage.refreshRequestType,
						apiPackage.refreshURL(refreshToken),
						contentType.form,
						updateAuthToken,
						responseCode.ok,
						'Error authorizing ' + apiPackage.id,
						function () {
							submitRequest(
								method,
								url,
								contentType.form,
								callback,
								successCode,
								errorMessage,
								authCallback
							);
						}
					);
				}

				//Attempt to refresh token failed. Request authorization again
				else if (
					refreshToken &&
					callback === updateAuthToken &&
					(code === responseCode.badRequest ||
						message === 'The refresh token is not exists' ||
						(code === responseCode.authRequired &&
							message.match(apiPackage.refreshTokenErrorRegex)))
				) {
					sendData = getOAuthConfig(originalAction);
					sendData.clearAuth = true;
					returnSuccess(
						'Refresh token failed - Authorizing ' + apiPackage.id,
						sendData,
						responseCode.authRequired
					);
				}

				//Return error if the request was successful but meeting API provided an error code
				else {
					if (errorCallback) {
						errorCallback(code, message, errorMessage);
					} else {
						returnError(
							errorMessage + ' - ' + message,
							responseCode.badRequest,
							code
						);
					}
				}
			}
		);
	}

	//Returns an error to DayBack
	function returnError(errorMessage, status, error) {
		res.end(
			JSON.stringify({
				status: status ? status : responseCode.badRequest,
				error: error ? error : responseCode.badRequest,
				message: errorMessage,
			})
		);
	}

	//Returns a success message to DayBack
	function returnSuccess(message, payload, status) {
		if (status === responseCode.authRequired) {
			clearAuthCookie();
		}
		payload = payload ? payload : {};
		payload.authToken = encryptedAuthData;
		res.end(
			JSON.stringify({
				status: status ? status : responseCode.ok,
				message: message,
				payload: payload,
			})
		);
	}

	//Returns a modal prompt to DayBack
	function returnModal(
		title,
		message,
		button1,
		callback1,
		button2,
		callback2,
		button3,
		callback3,
		payload,
		status,
		button1Short,
		button2Short,
		button3Short
	) {
		payload = payload ? payload : {};
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
			button3Short: button3Short,
		};
		res.end(
			JSON.stringify({
				status: status ? status : responseCode.ok,
				payload: payload,
			})
		);
	}

	//Encoding and decoding auth cookies
	function encryptAuthCookie(dmscKey, expire) {
		let iv = crypto.randomBytes(16);
		let cipher = crypto.createCipheriv(algorithm, Buffer.from(dmscKey), iv);
		let cookieData = cipher.update(
			JSON.stringify({
				authToken: authToken,
				refreshToken: refreshToken,
			})
		);
		cookieData = Buffer.concat([cookieData, cipher.final()]);
		let encryptedCookieData = {
			iv: iv.toString('hex'),
			encryptedData: cookieData.toString('hex'),
		};
		cookieConfig.maxAge = 60 * 60 * 24 * 31; // about 1-month
		encryptedAuthData = JSON.stringify(encryptedCookieData);
		let authCookie = cookie.serialize(
			postData.meetingType + 'DMSC',
			encryptedAuthData,
			cookieConfig
		);
		try {
			res.setHeader('Set-Cookie', authCookie);
		} catch (error) {}
	}

	function decryptAuthCookie(dmscKey) {
		let cookies = cookie.parse(req.headers.cookie || '');
		let encryptedCookieString;
		if (cookies && cookies[postData.meetingType + 'DMSC']) {
			encryptedCookieString = cookies[postData.meetingType + 'DMSC'];
		} else if (fileMakerUACheck(req.headers['user-agent'])) {
			encryptedCookieString = postData.authToken;
		}

		if (encryptedCookieString) {
			try {
				let encryptedCookie = JSON.parse(encryptedCookieString);
				let iv = Buffer.from(encryptedCookie.iv, 'hex');
				let encryptedText = Buffer.from(
					encryptedCookie.encryptedData,
					'hex'
				);
				let decipher = crypto.createDecipheriv(
					algorithm,
					Buffer.from(dmscKey),
					iv
				);
				let decryptedCookieBuffer = decipher.update(encryptedText);
				let decryptedCookie = JSON.parse(
					Buffer.concat([
						decryptedCookieBuffer,
						decipher.final(),
					]).toString()
				);
				authToken = decryptedCookie.authToken;
				refreshToken = decryptedCookie.refreshToken;
			} catch (error) {
				//No need to handle as no auth/refresh token is handled later
			}
		}
	}

	function clearAuthCookie() {
		cookieConfig.maxAge = 0;
		let authCookie = cookie.serialize(
			postData.meetingType + 'DMSC',
			'',
			cookieConfig
		);
		res.setHeader('Set-Cookie', authCookie);
	}
};
