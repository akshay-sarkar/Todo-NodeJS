#!/bin/env node
//  OpenShift sample Node application
var express = require('express');
var fs      = require('fs');
var path = require('path');
var bodyParser = require('body-parser');
var mysql = require('mysql'); 

// Body - Parser
var urlencodedParser = bodyParser.urlencoded({ extended: true });

/**
 *  Define the sample application.
 */
var SampleApp = function() {

    //  Scope.
    var self = this;


    /*  ================================================================  */
    /*  Helper functions.                                                 */
    /*  ================================================================  */

    /**
     *  Set up server IP address and port # using env variables/defaults.
     */
    self.setupVariables = function() {
        //  Set the environment variables we need.
        self.ipaddress = process.env.OPENSHIFT_NODEJS_IP;
        self.port      = process.env.OPENSHIFT_NODEJS_PORT || 8080;

        // Local Setup

        //self.port =  8080;

        if (typeof self.ipaddress === "undefined") {
            //  Log errors on OpenShift but continue w/ 127.0.0.1 - this
            //  allows us to run/test the app locally.
            console.warn('No OPENSHIFT_NODEJS_IP var, using 127.0.0.1');
            self.ipaddress = "127.0.0.1";
        };
    };


    /**
     *  Populate the cache.
     */
    self.populateCache = function() {
        if (typeof self.zcache === "undefined") {
            self.zcache = { 'index.html': '' };
        }

        //  Local cache for static content.
        self.zcache['index.html'] = fs.readFileSync('./templates/index.html');
    };


    /**
     *  Retrieve entry (content) from cache.
     *  @param {string} key  Key identifying content to retrieve from cache.
     */
    self.cache_get = function(key) { return self.zcache[key]; };


    /**
     *  terminator === the termination handler
     *  Terminate server on receipt of the specified signal.
     *  @param {string} sig  Signal to terminate on.
     */
    self.terminator = function(sig){
        if (typeof sig === "string") {
           console.log('%s: Received %s - terminating sample app ...',
                       Date(Date.now()), sig);
           process.exit(1);
        }
        console.log('%s: Node server stopped.', Date(Date.now()) );
    };


    /**
     *  Setup termination handlers (for exit and a list of signals).
     */
    self.setupTerminationHandlers = function(){
        //  Process on exit and signals.
        process.on('exit', function() { self.terminator(); });

        // Removed 'SIGPIPE' from the list - bugz 852598.
        ['SIGHUP', 'SIGINT', 'SIGQUIT', 'SIGILL', 'SIGTRAP', 'SIGABRT',
         'SIGBUS', 'SIGFPE', 'SIGUSR1', 'SIGSEGV', 'SIGUSR2', 'SIGTERM'
        ].forEach(function(element, index, array) {
            process.on(element, function() { self.terminator(element); });
        });
    };


    /*  ================================================================  */
    /*  App server functions (main app logic here).                       */
    /*  ================================================================  */

    /**
     *  Create the routing table entries + handlers for the application.
     */
    self.createRoutes = function() {
        self.routes = { };

        self.routes['/', '/logout'] = function(req, res) {
            res.setHeader('Content-Type', 'text/html');
            ///res.send(self.cache_get('index.html') );
            res.sendfile("./templates/index.html");
        };
    };


    /**
     *  Initialize the server (express) and create the routes and register
     *  the handlers.
     */
    self.initializeServer = function() {
        self.createRoutes();
        self.app = express.createServer();

        //  Add handlers for the app (from the routes).
        for (var r in self.routes) {
            self.app.get(r, self.routes[r]);
        }

        /* Database Things */

        self.connection = mysql.createConnection({
          host     : process.env.OPENSHIFT_MYSQL_DB_HOST,
          user     : process.env.OPENSHIFT_MYSQL_DB_USERNAME,
          password : process.env.OPENSHIFT_MYSQL_DB_PASSWORD,
          port     : process.env.OPENSHIFT_MYSQL_DB_PORT,
          database : process.env.OPENSHIFT_APP_NAME
         });

        /* USER MANAGEMENT */
        self.app.post('/registeration', urlencodedParser, function(request, res) {
            res.set('Content-Type', 'text/html');
            var sql = "INSERT INTO users (firstName, lastName, email, password) VALUES ('"+request.body.uFname+"','"+request.body.uLname+"','"+request.body.uEmail+"','"+request.body.pwd+"')";
            self.connection.query(sql, function (err, result) {
                if (err) throw err;
                console.log("1 record inserted");
                res.send(new Buffer('<p>Regitered</p>'));
            });
        });

        self.app.post('/login', urlencodedParser, function(request, res) {
            
            var sql = "SELECT * FROM users where email='"+request.body.uEmail+"' and  password= '"+request.body.pwd+"'";
            self.connection.query(sql, function (err, result, fields) {
                if (err) throw err;
                // res.send(new Buffer('<p>'+result+'</p>'));
                if(result.length == 1){
                    var users_details = JSON.parse(JSON.stringify(result))[0];
                    // On Successfull Login send all the data
                    var getTodoSql = "SELECT id, todo, uid, createdon FROM todo_list WHERE uid="+users_details['id']+";";

                    self.connection.query(getTodoSql, function (err, result, fields) {
                        if (err) throw err;

                        res.render('main', { res: JSON.stringify(result), name: users_details['firstName'], userId: users_details['id'] });
                    });
                    //res.render('main', { res: JSON.stringify(result) , field: fields  });    
                }else{
                    res.send(new Buffer('<p>User Not Found</p>'));
                }
                
            });
        });

        /* TODO - Management */
        //insert
        self.app.post('/insertTodo', urlencodedParser, function(request, res) {
            var sql = "INSERT INTO todo_list(todo, uid, createdon) VALUES ('"+request.body.todoItem+"','"+request.body.uid+"', NOW());";
            self.connection.query(sql, function (err, result, fields) {
                if (err) throw err;
                console.log("1 record inserted");
                res.send(new Buffer('Inserted'));
            });
        });

        //select - ALRWADY PASSED IN LOGIN
        //update
        self.app.post('/updateTodo', urlencodedParser, function(request, res) {
            var sql = "UPDATE todo_list SET todo='"+request.body.todoItem+"' WHERE id="+request.body.id+";";
            self.connection.query(sql, function (err, result, fields) {
                if (err) throw err;
                console.log("1 record updated");
                res.send(new Buffer("Updated"));
            });
        });

        //delete
        self.app.post('/deleteTodo', urlencodedParser, function(request, res) {
            var sql = "DELETE FROM todo_list WHERE id= "+request.body.todoID;
            self.connection.query(sql, function (err, result, fields) {
                if (err) throw err;
                 res.send(new Buffer('Deleted'));
            });
        });

        // self.app.get('/logout', function(request, res) {
        //     console.log('LOGOOUT');
        //     res.setHeader('Content-Type', 'text/html');
        //     ///res.send(self.cache_get('index.html') );
        //     res.sendfile("./templates/index.html");
        // });



    };


    /**
     *  Initializes the sample application.
     */
    self.initialize = function() {
        self.setupVariables();
        self.populateCache();
        self.setupTerminationHandlers();

        // Create the express server and routes.
        self.initializeServer();
    };


    /**
     *  Start the server (starts up the sample application).
     */
    self.start = function() {
        //EJS as View Engine
        self.app.set('view engine', 'ejs');
        self.app.set('views', path.join(__dirname, 'templates'));

        // Path Setup
        self.app.use(express.static(path.join(__dirname, 'templates')));
        self.app.listen(self.port, self.ipaddress, function() {
            console.log('%s: Node server started on %s:%d ...',
                        Date(Date.now() ), self.ipaddress, self.port);
        });
    };

};   /*  Sample Application.  */

/**
 *  main():  Main code.
 */
var zapp = new SampleApp();
zapp.initialize();
zapp.start();

