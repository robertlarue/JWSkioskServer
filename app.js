var express = require('express');
var path = require('path');
var os = require('os');
var favicon = require('serve-favicon');
var logger = require('morgan');
var cookieParser = require('cookie-parser');
var bodyParser = require('body-parser');
var ip = require('socket.io');

var routes = require('./routes/index');
var users = require('./routes/users');

var app = express();

// view engine setup
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'jade');

// uncomment after placing your favicon in /public
//app.use(favicon(__dirname + '/public/favicon.ico'));
app.use(logger('dev'));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(require('stylus').middleware(path.join(__dirname, 'public')));
app.use(express.static(path.join(__dirname, 'public')));
app.use('/', routes);
app.use('/users', users);
app.get('/eventlog.txt', function (req, res) {
    res.sendFile('eventlog.txt', { root: __dirname });
});

// catch 404 and forward to error handler
app.use(function (req, res, next) {
    var err = new Error('Not Found');
    err.status = 404;
    next(err);
});

// error handlers

// development error handler
// will print stacktrace
if (app.get('env') === 'development') {
    app.use(function (err, req, res, next) {
        res.status(err.status || 500);
        res.render('error', {
            message: err.message,
            error: err
        });
    });
}

// production error handler
// no stacktraces leaked to user
app.use(function (err, req, res, next) {
    res.status(err.status || 500);
    res.render('error', {
        message: err.message,
        error: {}
    });
});

var debug = require('debug')('JWSkioskServerFrontend');
var http = require('http').Server(app);
var io = require('socket.io')(http);

var webclients = [];

io.on('connection', function (webclient) {
    //Try to find the hostname of the connected client
    var webclientHostname = webclient.request.socket.remoteAddress;
    
    //Use ping on the system to find the hostname through NETBIOS or DNS
    child_process.exec("echo off & for /f \"tokens=2\" %a in ('ping -a " + webclient.request.socket.remoteAddress + " -n 1 -l 0 ^| find \"Pinging \"') do echo %a", function (error, stdout, stderr) {
        if (error) {
            //If an error is encountered, use the remote IP instead
            webclientHostname = webclient.request.socket.remoteAddress;
        } else {
            //Use the output from the ping command as the hostname
            webclientHostname = stdout.replace("\r", "").replace("\n", "")
        }
        console.log('[Webclient => JWSkioskServer] ' + webclientHostname + ' connected');
    });
    webclient.on('join', function (data) {
        pushServerDataToWebclients();
    });
    webclient.on('displayUpdate', function (data) {
        parseDisplayMessage(data);
    });
    webclient.on('displayOptionsUpdate', function (data) {
        parseDisplayOptions(data);
    });
});

http.listen(3000, function () {
    console.log('listening on ' + os.hostname() + ':3000');
});

exports.http = http;
module.exports = app;


const net = require('net');
const dns = require('dns');
var child_process = require('child_process');
const settings = require('./settings.json');


//------------------------------//
//////JWSkioskServer Section//////
//------------------------------//

//initialize the array to hold all of the servers
var servers = [];

//Create a new kiosk server for each kiosk
//Setup BMG to use the serverAddress in the badge reader setup
for (var i = 0; i < settings.kiosk.length; i++) {
    
    //create a new listener for each kiosk
    //listen on port 10001 at the IP Address in serverAddress
    var server = net.createServer(serverRoutine.bind(settings.kiosk[i])).listen(10001, settings.kiosk[i].serverAddress);
    server.settings = settings.kiosk[i];
    
    //initialize the array to hold all of the clients that are connected to this server
    server.clients = [];

    server.id = randomIntInc(1000, 9999);
    
    //create an event listener for the swipe event
    //trigger the serverSendSwipe function and bind this instance of the server object to it
    server.on('swipe', serverSendSwipe.bind(server));
    
    //if there is a server error, handle this error
    server.on('error', handleServerError.bind(server));
    
    //add this instance of the server object to the global array of servers
    servers.push(server);
  
}


//When a BMG client connects to the JWSkioskServer, create a socket and listen for certain messages
function serverRoutine(c) {
    //argument c is a socket object
    
    //server object is an EventListener
    var server;
    
    //find the server object from the global array of servers associated with this listener
    for (var j = 0; j < servers.length; j++) {
        if (servers[j].settings.serverAddress == this.serverAddress) {
            server = servers[j];
            

        }
    }
    

    //Try to find the hostname of the connected client
    var clientHostname = c.remoteAddress;
    
    //Use ping on the system to find the hostname through NETBIOS or DNS
    child_process.exec("echo off & for /f \"tokens=2\" %a in ('ping -a " + c.remoteAddress + " -n 1 -l 0 ^| find \"Pinging \"') do echo %a", function (error, stdout, stderr) {
        if (error) {
            //If an error is encountered, use the remote IP instead
            clientHostname = c.remoteAddress;
        } else {
            //Use the output from the ping command as the hostname
            clientHostname = stdout.replace("\r", "").replace("\n", "")
        }
        console.log('[' + server.settings.name + '] [BMG => JWSkioskServer] ' + clientHostname + ' connected');
        c.clientHostname = clientHostname;
        //Add this client to the list of connected clients
        server.clients.push(c);
        pushServerDataToWebclients();
    });
    
    //When a client disconnects
    c.on('end', function () {
        //Remove the client from the array of clients on the server object
        server.clients.splice(server.clients.indexOf(c), 1)
        pushServerDataToWebclients();

        console.log('[' + server.settings.name + '] [BMG => JWSkioskServer] ' + clientHostname + ' disconnected');
    });
    
    //When the JWSkioskServer receives data from the BMG client, decode the message
    c.on('data', function (data) {
        //console.log('[DEBUG] ' + data.toString());
        //Receive heartbeat message
        if (data == 'F#1=\002|1|RSC|\003\r') {
            
            //reply to heartbeat message
            c.write('\002|1|RSR|3|G|09000\003');
        }

        //Receive startup message
        else if (data == 'F#1=\002|1|SWC|700|\003\r') {
            
            //reply to startup message
            c.write('\002|1|SWC|3|G|09000\003')
        }

        //Receive remote display message
        else if (data.toString().substr(0, 12) == 'F#1=\002|1|DRC|') {
            //console.log('[DEBUG] ' + data.toString());
            
            //Strip the remote display formatting from the message
            var message = data.toString().substr(12, data.toString().length - 15).replace("^A000000^E0^I1^C1", "").replace(":", ": ").replaceAll("\034", " ").trim();
            
            if (message == settings.messages.goToLaneNull) {
                message = settings.messages.needToCheckIn;
            }
            //Display the message on the small JWS Kiosk display
            kioskDisplay(server.kioskClient, message);
            
            //Display the message on the JWS Kiosk remote display
            kioskRemoteDisplayReset(server.kioskClient);
            kioskRemoteDisplay(server.kioskClient, message);
            
            startDisplayTimeout(server.kioskClient);
            
            console.log('[' + server.settings.name + '] [BMG => JWSkioskServer] ' + message);
        }

        //Receive small kiosk display message
        else if (data.toString().substr(0, 12) == 'F#1=\002|1|DSC|') {
            //console.log('[DEBUG] ' + data.toString());
            
            //Strip the extra characters from the message
            var message = data.toString().substr(12, data.toString().length - 15).replace(":", ": ").replaceAll("\034", " ").trim();
            
            //Display the message on the small JWS Kiosk display
            kioskDisplay(server.kioskClient, message);
            
            //Display the message on the JWS Kiosk remote display
            kioskRemoteDisplayReset(server.kioskClient);
            kioskRemoteDisplay(server.kioskClient, message);
            
            startDisplayTimeout(server.kioskClient);
            
            console.log('[' + server.settings.name + '] [BMG => JWSkioskServer] ' + message);
        }

        //Receive the welcome display message
        else if (data.toString().substr(0, 12) == 'F#1=\002|1|PIC|') {
            
            //Show the welcome message on the JWS Kiosk
            kioskWelcomeDisplay(server.kioskClient);
        }

        //Show the message in the console if it cannot be parsed
        else {
            console.log('[DEBUG] ' + data.toString());
        }
    });
    
    //Listen for the swipe event and send the card number to BMG
    c.on('swipe', function (cardNumber, kioskClient) {
        console.log('[' + kioskClient.settings.name + '] [JWSkioskServer => BMG] Sent swipe to ' + clientHostname)
        c.write('\002|1|RSR|4|H' + cardNumber + '|09000\003')
    });
    
    //When the BMG client connection encounters an error, show the error code
    c.on('error', function (err) {
        server.clients.splice(server.clients.indexOf(c), 1)
        pushServerDataToWebclients();
        console.log('[' + this.name + '] ' + err.code)
    });
}

//This function sends the cardswipe to all connected clients of the server
function serverSendSwipe(cardNumber, clientObject) {
    console.log('[' + this.settings.name + '] [JWSkioskServer => BMG] Sending swipe to ' + this.clients.length + ' BMG client(s)');
    this.clients.forEach(function (client) {
        client.emit('swipe', cardNumber, clientObject)
    });
}

//Show server error codes
function handleServerError(err) {
    console.log('[' + this.kioskClient.name + '] ' + err.code);
}

function pushServerDataToWebclients() {
    var serverDataArray = [];
    var serversprocessed = 0;
    //console.log('Servers to process = ' + servers.length);
    servers.forEach(function (server) {
        //console.log("Processing data for " + server.settings.name)
        var serverData = new Object;
        serverData.settings = server.settings;
	    if("kioskClient" in server){
	        serverData.connected = server.kioskClient.connected;
	        serverData.displayMessage = server.kioskClient.displayMessage;
	        serverData.remoteDisplayMessage = server.kioskClient.remoteDisplayMessage;
                serverData.largeFont = server.kioskClient.largeFont;
                serverData.scroll = server.kioskClient.scroll;
                serverData.flash = server.kioskClient.flash;
	    } else {
	        serverData.connected = false;
	        serverData.displayMessage = '';
	        serverData.remoteDisplayMessage = '';
                serverData.largeFont = false;
                serverData.scroll = false;
                serverData.flash = false;
	    }
	    serverData.id = server.id;
        serverData.clients = [];
        //console.log('Clients to process = ' + server.clients.length);
        server.clients.forEach(function (client) {
            //console.log('Client = ' + client.clientHostname)
            serverData.clients.push(client.clientHostname);
        });
        serversprocessed++;
        serverDataArray.push(serverData);
        if (serversprocessed == servers.length) {
            //console.log('[DEBUG] [JWSkioskServer => Webclient] ' + JSON.stringify(serverDataArray));
            io.emit('servers', serverDataArray);
        }
    });
}

function pushDisplayDataToWebclients() {
    var serverDataArray = [];
    var serversprocessed = 0;
    //console.log('Servers to process = ' + servers.length);
    servers.forEach(function (server) {
        //console.log("Processing data for " + server.settings.name)
        var serverData = new Object;
        if ("kioskClient" in server) {
            serverData.displayMessage = server.kioskClient.displayMessage;
            serverData.remoteDisplayMessage = server.kioskClient.remoteDisplayMessage;
            serverData.largeFont = server.kioskClient.largeFont;
            serverData.scroll = server.kioskClient.scroll;
            serverData.flash = server.kioskClient.flash;
        } else {
            serverData.displayMessage = '';
            serverData.remoteDisplayMessage = '';
            serverData.largeFont = false;
            serverData.scroll = false;
            serverData.flash = false;
        }
        serverData.id = server.id;
        serversprocessed++;
        serverDataArray.push(serverData);
        if (serversprocessed == servers.length) {
            //console.log('[DEBUG] [JWSkioskServer => Webclient] ' + JSON.stringify(serverDataArray));
            io.emit('display', serverDataArray);
        }
    });
}

function parseDisplayMessage(data) {
    //console.log('display id = ' + data.id + ' message = ' + data.message);
    for (var k = 0; k < servers.length; k++) {
	//console.log('serverId = ' + servers[k].id + ' displayid = ' + data.id);
        if (servers[k].id + '-displayMessage' == data.id) {
            kioskDisplay(servers[k].kioskClient, data.message);
            //console.log('found server with id = ' + servers[k].id + ' matching ' + data.id);
        } 
        else if (servers[k].id + '-remoteDisplayMessage' == data.id) {

            kioskRemoteDisplay(servers[k].kioskClient, data.message);
        }
    }
}

function parseDisplayOptions(data) {
    //console.log('display id = ' + data.id + ' largeFont = ' + data.largeFont + ' scroll = ' + data.scroll + ' flash = ' + data.flash);
    for (var k = 0; k < servers.length; k++) {
        //console.log('serverId = ' + servers[k].id + ' displayid = ' + data.id);
        if (servers[k].id + '-remoteDisplayMessage' == data.id) {
            servers[k].kioskClient.largeFont = data.largeFont;
            servers[k].kioskClient.scroll = data.scroll;
            servers[k].kioskClient.flash = data.flash;
        }
    }
}

//----------------------------//
//////Kiosk Client Section//////
//----------------------------//

//Create a client connection to each JWS Kiosk
for (var i = 0; i < settings.kiosk.length; i++) {
    var kioskSettings = settings.kiosk[i];
    var kioskClient = new Object;
    kioskClient.settings = kioskSettings;
    
    //create a connection to the JWS Kiosk
    connectKioskClient(kioskClient);
}

//Initialize connection and setup event listeners
function connectKioskClient(kioskClient) {
    //If reconnecting, stop the reconnect timer
    if ("reconnectTimer" in kioskClient) {
        clearInterval(kioskClient.reconnectTimer);
    }
    
    console.log('[' + kioskClient.settings.name + '] [JWSkioskServer => JWS Kiosk] Opening connection to ' + kioskClient.settings.JWSkioskAddress);
    //Create a connection to the kiosk using the stored settings
    var client = net.createConnection(kioskClient.settings.JWSkioskPort, kioskClient.settings.JWSkioskAddress);
    
    kioskClient.client = client;
    
    //on a successful connection, run clientConnect and bind this client object as 'this'
    kioskClient.client.on('connect', clientConnect.bind({}, kioskClient));
    
    //when the JWS Kiosk client receives data, run clientData and bind this client object as 'this'
    kioskClient.client.on('data', clientData.bind({}, kioskClient));
    
    //when the JWS Kiosk client encounters an error, run handleClientError and bind this client object as 'this'
    kioskClient.client.on('error', handleClientError.bind({}, kioskClient));
}

//Client - 'connect' Event
//When connecting to a JWS Kiosk, show the welcome display
function clientConnect(kioskClient) {
    kioskClient.connected = true;
    setTimeout(pushServerDataToWebclients, 100);
    //Find which JWSkioskServer object is associated with the JWS Kiosk client
    for (var j = 0; j < servers.length; j++) {
        if (servers[j].settings.serverAddress == kioskClient.settings.serverAddress) {
            
            //Store the server object as a property of the client
            kioskClient.server = servers[j];
            
            //Store the JWS Kiosk client as a property of the server
            servers[j].kioskClient = kioskClient;
        }
    }
    console.log('[' + kioskClient.settings.name + '] [JWSkioskServer => JWS Kiosk] JWS Kiosk is availble. Connecting...');
    console.log('[' + kioskClient.settings.name + '] JWSkioskServer IP Address = ' + kioskClient.server.settings.serverAddress);
    setTimeout(function () { kioskWelcomeDisplay(kioskClient) }, 5000);
    kioskClient.heartbeatTimer = setInterval(function () { kioskClient.client.write('SHOW\r\n') }, 5000);
}

//Client - 'data' Event
function clientData(kioskClient, data) {
    //console.log('[DEBUG] ' + data.toString().replace('\r\n',''));
    if (data.toString().substr(data.length - 11, data.length) == 'CONNECTED\r\n') {
        console.log('[' + kioskClient.settings.name + '] [JWSkioskServer => JWS Kiosk] Connected');
        if (kioskClient.settings.keypadEnabled == true) {
            kioskClient.client.write('KEYPAD=0\r\n')
        } else {
            kioskClient.client.write('KEYPAD=1\r\n')
        }
    }
    if (data.toString().substr(0, 4) == "KEY=") {
        var cardString = data.toString().split("=")[1].replace("\r\n", "");
        var cardNumberComponents = cardString.split(",");
        if (cardNumberComponents.length > 1) {
            var paddedCardNumber = zpad(cardNumberComponents[1]);
            //console.log('Facility Code = ' + cardNumberComponents[0])
            //console.log('Card number = ' + paddedCardNumber)
            var cardNumber = cardNumberComponents[0] + paddedCardNumber
        }
        else {
            cardNumber = cardNumberComponents[0];
        }
        console.log('[' + kioskClient.settings.name + '] [JWS Kiosk => JWSkioskServer] Card Swiped ' + cardNumber);
        kioskClient.server.emit('swipe', cardNumber, kioskClient);
        kioskSwipeCardDisplay(kioskClient);
        startDisplayTimeout(kioskClient);
    }
}

//Client - 'error' Event
function handleClientError(kioskClient, err) {
    kioskClient.connected = false;
    pushServerDataToWebclients();

    if ("heartbeatTimer" in kioskClient) {
        clearInterval(kioskClient.heartbeatTimer);
    }
    if ("heartbeatTimer" in kioskClient) {
        clearInterval(kioskClient.heartbeatTimer);
    }
    console.log('[' + kioskClient.settings.name + '] [JWSkioskServer => JWS Kiosk] Error: ' + err.code + ' Could not connect to JWS Kiosk');
    //start the reconnect timer if the client connection encounters an error
    kioskClient.reconnectTimer = setTimeout(function () { connectKioskClient(kioskClient) }, settings.reconnectTimeout * 1000)
}



//Wrap text on small JWS Kiosk display
function textWrap(message) {
    var spaces = getIndicesOf(" ", message, false)
    //console.log('message length = ' + message.length)
    if (spaces.length > 0 && message.length > 20) {
        var n = 0;
        
        //find the last non breaking space on a line
        //A line is 20 characters long
        while (spaces[n] < 20) {
            n++;
        }
        
        //find the last space on a line
        var lastSpacePosOnFirstLine = spaces[n - 1]
        //console.log(lastSpacePosOnFirstLine);
        
        //the new first line is everything before the last space
        var firstLine = message.slice(0, lastSpacePosOnFirstLine);
        //console.log(firstLine);
        
        //We will add spaces to the end of the line to equal 20 characters
        var numberOfSpaces = 19 - lastSpacePosOnFirstLine;
        //console.log(numberOfSpaces);
        
        //Create the extra spaces
        var extraSpace = '';
        for (var k = 0; k < numberOfSpaces; k++) {
            extraSpace = extraSpace + ' ';
        }
        
        //Join the first line, extra spaces and the rest of the message together to form the new message
        message = [firstLine, extraSpace, message.slice(lastSpacePosOnFirstLine)].join('');
    }
    return message
}

//Wrap text on the JWS Kiosk remote display
function textWrapRemoteDisplay(message) {
    var spaces = getIndicesOf(" ", message, false)
    //console.log('message length = ' + message.length)
    if (spaces.length > 0 && message.length > 20) {
        var n = 0;
        while (spaces[n] < 20) {
            n++;
        }
        
        //find the last space on a line
        var lastSpacePosOnFirstLine = spaces[n - 1]
        //console.log(lastSpacePosOnFirstLine);
        
        //the new first line is everything before the last space
        var firstLine = message.slice(0, lastSpacePosOnFirstLine);
        
        //Join the first line, the newline code '^N' and the rest of the message together to form the new message
        message = [firstLine, '^N', message.slice(lastSpacePosOnFirstLine + 1)].join('');
    }
    return message
}

//Display a message on the small JWS Kiosk display
function kioskDisplay(kioskClient, message) {
    var wrappedMessage = textWrap(message);
    kioskClient.client.write('CLEAR\r\n');
    kioskClient.client.write('DISPLAY=' + wrappedMessage + '\r\n');
    kioskClient.client.write('CURSOR=4,1\r\n');
    console.log('[' + kioskClient.settings.name + '] [JWSkioskServer => JWS Kiosk Display] ' + message);
    kioskClient.displayMessage = message;
    pushDisplayDataToWebclients();
}

//Display a message on the small JWS Kiosk remote display
function kioskRemoteDisplay(kioskClient, message) {
    var wrappedMessage = textWrapRemoteDisplay(message);
    var largeFontChar = '';
    if (kioskClient.largeFont == true) {
        largeFontChar = '^L1^K1';
    }
    var flashChar = '';
    if (kioskClient.flash == true) {
        flashChar = '^X1';
    }
    var scrollChar1 = '';
    var scrollChar2 = '';
    if (kioskClient.scroll == true) {
        scrollChar1 = '^D1';
        scrollChar2 = '^N';
        wrappedMessage = message;
    }
    kioskClient.client.write('AUX=^E1^C1' + flashChar + largeFontChar + scrollChar1 + wrappedMessage + scrollChar2 + '\r\n');
    console.log('[' + kioskClient.settings.name + '] [JWSkioskServer => JWS Kiosk Remote Display] ' + message);
    kioskClient.remoteDisplayMessage = message;
    pushDisplayDataToWebclients();
}

function kioskRemoteDisplayReset(kioskClient) {
    kioskClient.client.write('AUX=^A000000^E1^I1^C1\r\n');
    console.log('[' + kioskClient.settings.name + '] [JWSkioskServer => JWS Kiosk Remote Display] Reset');
    kioskClient.remoteDisplayMessage = '';
    kioskClient.largeFont = false;
    kioskClient.scroll = false;
    kioskClient.flash = false;
    pushDisplayDataToWebclients();
}

//Start the timer to reset the display
function startDisplayTimeout(kioskClient) {
    if ("displayTimer" in kioskClient) {
        clearTimeout(kioskClient.displayTimer);
    }
    kioskClient.displayTimer = setTimeout(function () { kioskWelcomeDisplay(kioskClient) }, settings.displayTimeout * 1000);
}

//Show the predefined welcome display on a JWS Kiosk
function kioskWelcomeDisplay(kioskClient) {
    kioskClient.displayMessage = settings.messages.welcome;
    kioskClient.remoteDisplayMessage = '';
    kioskDisplay(kioskClient, settings.messages.welcome);
    
    //Remote Display will be blank
    kioskRemoteDisplayReset(kioskClient);
}

//Show the predefined message on a JWS Kiosk when a card is swiped
function kioskSwipeCardDisplay(kioskClient) {
    kioskDisplay(kioskClient, settings.messages.swipeCard)
}


//---------------------------------//
//////General Functions Section//////
//---------------------------------//

//Function for padding text with a character
var zpad = function (n, m, c) {
    if (!m) m = zpad._amount;
    if (!c) c = zpad._character;
    n = "" + n;
    m -= n.length;
    while (m-- > 0) n = c + n;
    return n;
}

//default zpad properties
//default padding is 5 characters
zpad._amount = 5;
//default padding character is a zero
zpad._character = '0';

//Get the indicies of each occurance of a character in a string
function getIndicesOf(searchStr, str, caseSensitive) {
    var startIndex = 0, searchStrLen = searchStr.length;
    var index, indices = [];
    if (!caseSensitive) {
        str = str.toLowerCase();
        searchStr = searchStr.toLowerCase();
    }
    while ((index = str.indexOf(searchStr, startIndex)) > -1) {
        indices.push(index);
        startIndex = index + searchStrLen;
    }
    return indices;
}

//Add a method to strings called replaceAll in addition to replace()
String.prototype.replaceAll = function (search, replacement) {
    var target = this;
    return target.replace(new RegExp(search, 'g'), replacement);
};

function randomIntInc(low, high) {
    return Math.floor(Math.random() * (high - low + 1) + low);
}