# dayback-meetings-service

### Hosting the DayBack Meetings Service Yourself

The DayBack Meetings Service is a small web service built in Node.JS. We built it to run as a [Zeit application](https://zeit.co/), so if you’d like to run it yourself, you’ll want to learn more and sign-up for a [Zeit account here](https://zeit.co/signup).

You’ll also need your own [OAuth API credentials with Zoom](https://developer.zoom.us/docs/api/) in order to authorize your application.


### 1. Download the files
Deploying the files is quite easy. First, you’ll need to [install “Now” from Zeit](https://zeit.co/download).

You can dive into and modify the “index.js” code all you’d like, but to start, it would be best to leave it as is for now.


### 2. Customize the service for your deployment
Next, open the “package.json” file, which contains the details for this service, and modify the values for “name”, and “description” appropriately. Name and description can be whatever you’d like to call your service.

Open the “now.json” file and change the “name” and “alias” appropriately. “Name” should match the same value you entered in your “package.json” file. The “alias” needs to be unique to Zeit and is the address you’ll point your custom actions to in the next step.


### 3. Add your Zoom API id and secret to your Zeit environment variables
Open a command prompt (Windows) or terminal window (Mac) and navigate to the folder where your repository files are.

Next,  enter the following commands, one at a time, replacing the last value with your id or secret provided by Zoom:

```
now secret add zoomID YOURZOOMID
now secret add zoomSecret YOURZOOMSECRET
```
This will securely save these values into your Zeit environment variables for use in the service without directly entering the values into the code. Any time you need to update/replace your Zoom API credentials, you can update the Zeit environment variables with the same commands


### 4. Deploy your service
Open a command prompt (Windows) or terminal window (Mac) and navigate to the folder where your repository files are, and run the deploy.cmd (Windows) or deploy.sh (Mac) file to deploy your service. This will create a new private instance of the service and deploy it at the alias specified in your “now.json” file.

Once the deployment is complete, verify that your new service is running by going to the alias address you specified in a browser. If you see “DayBack Meetings Service Running”, your instance is up and running and ready to connect!


### 5. Point the DayBack Meetings Service scripts to your new service
The last step is to update the new scripts you added to point to your new instance address. On the "Insert from URL script step in the "Meetings Service Send Request" script (line 11), just change the URL property to the alias you specified earlier. Currently, it’s pointing to ‘https://daybackmeetings.now.sh‘ and you’ll just change it to ‘https://YourSpecifiedAlias.now.sh‘.  Save that script and your custom actions will now be completely handled by your own private instance of the DayBack Meetings Service.
