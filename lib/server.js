var express = require("express"),
    server = express(),
    fs = require("fs"),
    path = require("path"),
    config = require("../config").config.server,
    public_dir = config["public_dir"],
    Templates = require("./templates.js"),
    view = require("./view.js");


server.configure(function () {
    server.set("views", __dirname + "./lib/views/");
    server.set("view engine", "handlebars");
    server.set("view options", {layout: false});
    server.engine("handlebars", view.handlebars);

    server.use(express.logger("dev"));
    server.use(express.static(public_dir));
});


// Run template generation on startup
Templates.renderTemplates();

// run the watch on the template dir
// with callback to regen static version
Templates.watchTemplates(function() {
    console.log("Regenerated Templates");
});
            
Templates.watchViews(function() {
    console.log("Regenerating Views");
});

// Handles requests to the root path ("/") my simply sending the "shell" page
// which creates the `Y.App` instance.

server.get('/stats/', function(req, res) {
    res.json({
	uptime: process.uptime(),
	memory: process.memoryUsage()
    });
});

server.get('*', function (req, res) {
    res.sendfile("app/index.html");
});

exports.server = server;