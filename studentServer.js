// express is the server that forms part of the nodejs program
var express = require('express');
var path = require("path");
var app = express();
app.use(function(req, res, next) {
res.header("Access-Control-Allow-Origin", "*");
res.header("Access-Control-Allow-Headers", "X-Requested-With");
next();
});

// add an http server to serve files to the Edge browser
// due to certificate issues it rejects the https files if they are not
// directly called in a typed URL
var http = require('http');
var httpServer = http.createServer(app);
httpServer.listen(4480);
app.get('/',function (req,res) {
res.send("hello world from the HTTP server");
});

// Add the body-parser to studentServer.js close to the top so that you will be able to process the uploaded data
var bodyParser = require('body-parser');
app.use(bodyParser.urlencoded({
	extended: true
}));
app.use(bodyParser.json());

//Import the required database connectivity code and set up a database connection
var fs = require('fs');
var pg = require('pg');
var configtext = ""+fs.readFileSync("/home/studentuser/certs/postGISConnection.js");
// now convert the configruation file into the correct format -i.e. a name/value pair array
var configarray = configtext.split(",");
var config = {};
for (var i = 0; i < configarray.length; i++) {
	var split = configarray[i].split(':');
	config[split[0].trim()] = split[1].trim();
}
var pool = new pg.Pool(config);

//a simple app.get to test out the connection
app.get('/postgistest', function (req,res) {
	pool.connect(function(err,client,done) {
		if(err){
			console.log("not able to get connection "+ err);
			res.status(400).send(err);
		}
		client.query('SELECT name FROM london_poi' ,function(err,result) {
			done();
			if(err){
				console.log(err);
				res.status(400).send(err);
			}
			res.status(200).send(result.rows);
		});
	});
});

// actually do the POST request to studentServer.js and upload this to Ubuntu and GitHub (note the use of POST this time!)
app.post('/reflectData',function(req,res){
	// note that we are using POST here as we are uploading data
	// so the parameters form part of the BODY of the request rather
	//than the RESTful API
	console.dir(req.body);
	// for now, just echo the request back to the client
	res.send(req.body);
	});

//this function is using fixed table name, column name and columns (name, surname and port_id)
app.get('/getGeoJSON/:tablename/:geomcolumn/:portNumber?', function (req,res) {
	pool.connect(function(err,client,done) {
		if(err){
			console.log("not able to get connection "+ err);
			res.status(400).send(err);
		}
		var colnames = "";
		// first get a list of the columns that are in the table
		// use string_agg to generate a comma separated list that can then be pasted into the next query
		var tablename = req.params.tablename;
		var geomcolumn = req.params.geomcolumn;
		var querystring = "select string_agg(colname,',') from ( select column_name as colname ";
		querystring = querystring + " FROM information_schema.columns as colname ";
		querystring = querystring + " where table_name =$1";
		querystring = querystring + " and column_name <> $2 and data_type <> 'USER-DEFINED') as cols ";
		console.log(querystring);
		
		// now run the query
		client.query(querystring,[tablename,geomcolumn], function(err,result){
		//call `done()` to release the client back to the pool
			done();
			if(err){
				console.log(err);
				res.status(400).send(err);
				}
			thecolnames = result.rows[0].string_agg;
			colnames = thecolnames;
			console.log("the colnames "+thecolnames);
		
		// now use the inbuilt geoJSON functionality
		// and create the required geoJSON format using a query adapted from here:
		// http://www.postgresonline.com/journal/archives/267-Creating-GeoJSON-Feature-Collections-with-JSON-and-PostGIS-functions.html, accessed 4th January 2018
		// note that query needs to be a single string with no line breaks so built it up bit by bit
		var querystring = " SELECT 'FeatureCollection' As type,
		array_to_json(array_agg(f)) As features FROM ";
		querystring = querystring + "(SELECT 'Feature' As type , ST_AsGeoJSON(lg." + req.params.geomcolumn+")::json As geometry, ";
		querystring = querystring + "row_to_json((SELECT l FROM (SELECT"+colnames + ") As l )) As properties";
		
		
		// depending on whether we have a port number, do differen things
		if (req.params.portNumber) {
			querystring = querystring + " FROM "+req.params.tablename+" As lg where lg.port_id = '"+req.params.portNumber + "' limit 100 ) As f ";
			}
		else {
			querystring = querystring + " FROM "+req.params.tablename+"
			As lg limit 100 ) As f ";
			}
		console.log(querystring);
		
		// run the second query
		client.query(querystring,function(err,result){
		//call `done()` to release the client back to the pool
			done();
			if(err){
				console.log(err);
				res.status(400).send(err);
			}
			res.status(200).send(result.rows);
		});
	});
	});
});

		

// adding functionality to log the requests
app.use(function (req, res, next) {
var filename = path.basename(req.url);
var extension = path.extname(filename);
console.log("The file " + filename + " was requested.");
next();
});






// actually do the POST request to studentServer.js and upload this to Ubuntu and GitHub (note the use of POST this time!)
app.post('/uploadData',function(req,res){
// note that we are using POST here as we are uploading data
// so the parameters form part of the BODY of the request rather than the RESTful API
console.dir(req.body);
	pool.connect(function(err,client,done) {
		if(err){
		console.log("not able to get connection "+ err);
		res.status(400).send(err);
		}
var name = req.body.name;
var surname = req.body.surname;
var module = req.body.module;
var portnum = req.body.port_id;
var language = req.body.language;
var modulelist = req.body.modulelist;
var lecturetime = req.body.lecturetime;
var geometrystring = "st_geomfromtext('POINT("+req.body.longitude + " "+ req.body.latitude + ")')";
var querystring = "INSERT into formdata (name,surname,module, port_id,language, modulelist, lecturetime, geom) values ($1,$2,$3,$4,$5,$6,$7,";
var querystring = querystring + geometrystring + ")";
console.log(querystring);
client.query( querystring,[name,surname,module, portnum, language, modulelist, lecturetime],function(err,result) {
done();
if(err){
	console.log(err);
	res.status(400).send(err);
}
res.status(200).send("row inserted");
});
});
});

// serve static files - e.g. html, css
// this should always be the last line in the server file
app.use(express.static(__dirname));