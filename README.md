# dayback-meetings-service

## Purpose

The DayBack Meetings Service is the middleware that we set up to connect [DayBack](https://dayback.com) with [Zoom](https://zoom.us).

For more details on connecting [DayBack Online or in Salesforce](https://dayback.com), check out the blog here for an overview: https://dayback.com/schedule-zoom-meetings-salesforce/

Details on the [DayBack for FileMaker](https://www.seedcode.com/filemaker-calendar/) implementation, including a sample file, can be found here: https://www.seedcode.com/zoom_meetings_filemaker

Here you'll find all the required files to set up your own private instance of the DayBack Meetings Service.

### Hosting the DayBack Meetings Service Yourself

The DayBack Meetings Service is a small web service built in Node.JS.

You’ll also need your own [OAuth API credentials with Zoom](https://developer.zoom.us/docs/api/) in order to authorize your application.

### 1. Download the files

You can dive into and modify the "index.js" code all you’d like, but to start, it would be best to leave it as is for now.

### 2. Customize the service for your deployment

Next, open the "package.json" file, which contains the details for this service, and modify the values for "name", and "description" appropriately. Name and description can be whatever you’d like to call your service.

### 3. Add your Zoom API id and secret to your NodeJS environment variables

The method for setting environment variables varies depending on your server setup. The variables needed for DayBack are
ZOOM_ID
ZOOM_SECRET

### 4. Deploy your service

Open a command prompt (Windows) or terminal window (Mac) and navigate to the folder where your repository files are, and run the following command:
npm start

This will start the service. You can verify that your new service is running by going to the alias address you specified in a browser. If you see "DayBack Meetings Service Running", your instance is up and running and ready to connect!

### 5. Point the DayBack Meetings Service scripts to your new service

The last step is to update the new scripts you added to point to your new instance address. On the "Insert from URL script step in the "Meetings Service Send Request" script (line 11), just change the URL property to your server. Currently, it’s pointing to 'https://meetings.dayback.com' and you’ll just change it to 'https://YourFQDN.com'.  Save that script and your custom actions will now be completely handled by your own private instance of the DayBack Meetings Service.
