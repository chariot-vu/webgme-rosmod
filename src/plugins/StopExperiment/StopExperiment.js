/*globals define*/
/*jshint node:true, browser:true*/

/**
 * Generated by PluginGenerator 0.14.0 from webgme on Thu Mar 24 2016 07:15:53 GMT-0700 (PDT).
 */

define([
    'plugin/PluginConfig',
    'plugin/PluginBase',
    'rosmod/meta',
    'rosmod/remote_utils',
    'rosmod/modelLoader',
    'q'
], function (
    PluginConfig,
    PluginBase,
    MetaTypes,
    utils,
    loader,
    Q) {
    'use strict';

    /**
     * Initializes a new instance of StopExperiment.
     * @class
     * @augments {PluginBase}
     * @classdesc This class represents the plugin StopExperiment.
     * @constructor
     */
    var StopExperiment = function () {
        // Call base class' constructor.
        PluginBase.call(this);

        this.metaTypes = MetaTypes;
    };

    // Prototypal inheritance from PluginBase.
    StopExperiment.prototype = Object.create(PluginBase.prototype);
    StopExperiment.prototype.constructor = StopExperiment;

    /**
     * Gets the name of the StopExperiment.
     * @returns {string} The name of the plugin.
     * @public
     */
    StopExperiment.prototype.getName = function () {
        return 'StopExperiment';
    };

    /**
     * Gets the semantic version (semver.org) of the StopExperiment.
     * @returns {string} The version of the plugin.
     * @public
     */
    StopExperiment.prototype.getVersion = function () {
        return '0.1.0';
    };

    /**
     * Main function for the plugin to execute. This will perform the execution.
     * Notes:
     * - Always log with the provided logger.[error,warning,info,debug].
     * - Do NOT put any user interaction logic UI, etc. inside this method.
     * - callback always has to be called even if error happened.
     *
     * @param {function(string, plugin.PluginResult)} callback - the result callback
     */
    StopExperiment.prototype.main = function (callback) {
        // Use self to access core, project, result, logger etc from PluginBase.
        // These are all instantiated at this point.
        var self = this;

        // Default fails
        self.result.success = false;

        if (typeof WebGMEGlobal !== 'undefined') {
            callback(new Error('Client-side execution is not supported'), self.result);
            return;
        }

        self.updateMETA(self.metaTypes);

	// will be filled out by the plugin
	self.experiment = [];
	self.rosCorePort = Math.floor((Math.random() * (65535-1024) + 1024));
	self.rosCoreIp = '';

	loader.logger = self.logger;
	utils.logger = self.logger;

	// the active node for this plugin is experiment -> experiments -> project
	var projectNode = self.core.getParent(self.core.getParent(self.activeNode));
	var projectName = self.core.getAttribute(projectNode, 'name');

	self.experimentName = self.core.getAttribute(self.activeNode, 'name');

	self.logger.info('loading project: ' + projectName);
	loader.loadProjectModel(self.core, self.META, projectNode, self.rootNode)
	    .then(function(projectModel) {
		self.projectModel = projectModel;
		self.logger.info('parsed model!');
		// update the object's selectedExperiment variable
		self.selectedExperiment = self.projectModel.experiments[self.experimentName];
		// check to make sure we have the right experiment
		var expPath = self.core.getPath(self.activeNode);
		if ( expPath != self.selectedExperiment.path ) {
		    throw new String("Experiments exist with the same name, can't properly resolve!");
		}
		return self.killAll();
	    })
	    .then(function () {
		var msg = 'Stopped roscore and node_main.';
		self.logger.info(msg);
		self.createMessage(self.activeNode, msg);
		self.result.setSuccess(true);
		callback(null, self.result);
	    })
	    .catch(function(err) {
        	self.logger.error(err);
        	self.createMessage(self.activeNode, err, 'error');
		self.result.setSuccess(false);
		callback(err, self.result);
	    })
		.done();
    };

    StopExperiment.prototype.killAll = function() {
	var self = this;
	return utils.getAvailableHosts(self.selectedExperiment.system.hosts, false)
	    .then(function(hosts) {
		var tasks = hosts.map(function(host) {
		    var ip = host.intf.ip;
		    var user = host.user;
		    var host_commands = [
			'pkill roscore',
			'pkill node_main'
		    ];
		    return utils.executeOnHost(host_commands, ip, user);
		});
		return Q.all(tasks);
	    });
    };

    return StopExperiment;
});