/*globals define*/
/*jshint node:true, browser:true*/

/**
 * Generated by PluginGenerator 0.14.0 from webgme on Wed Mar 02 2016 22:16:42 GMT-0600 (Central Standard Time).
 */

define([
    'plugin/PluginConfig',
    'plugin/PluginBase',
    'common/util/ejs', // for ejs templates
    'common/util/xmljsonconverter', // used to save model as json
    'plugin/SoftwareGenerator/SoftwareGenerator/Templates/Templates', // 
    'rosmod/meta',
    'rosmod/remote_utils',
    'rosmod/modelLoader',
    'q'
], function (
    PluginConfig,
    PluginBase,
    ejs,
    Converter,
    TEMPLATES,
    MetaTypes,
    utils,
    loader,
    Q) {
    'use strict';

    /**
     * Initializes a new instance of SoftwareGenerator.
     * @class
     * @augments {PluginBase}
     * @classdesc This class represents the plugin SoftwareGenerator.
     * @constructor
     */
    var SoftwareGenerator = function () {
        // Call base class' constructor.
        PluginBase.call(this);
	//this.disableBrowserExecution = true; // why doesn't this work?
        this.metaTypes = MetaTypes;
        this.FILES = {
            'component_cpp': 'component.cpp.ejs',
            'component_hpp': 'component.hpp.ejs',
            'cmakelists': 'CMakeLists.txt.ejs',
            'package_xml': 'package_xml.ejs',
	    'doxygen_config': 'doxygen_config.ejs',
	    'cpn': 'cpn.ejs'
        };
    };

    // Prototypal inheritance from PluginBase.
    SoftwareGenerator.prototype = Object.create(PluginBase.prototype);
    SoftwareGenerator.prototype.constructor = SoftwareGenerator;

    /**
     * Gets the name of the SoftwareGenerator.
     * @returns {string} The name of the plugin.
     * @public
     */
    SoftwareGenerator.prototype.getName = function () {
        return 'SoftwareGenerator';
    };

    /**
     * Gets the semantic version (semver.org) of the SoftwareGenerator.
     * @returns {string} The version of the plugin.
     * @public
     */
    SoftwareGenerator.prototype.getVersion = function () {
        return '0.1.0';
    };

    /**
     * Gets the configuration structure for the ObservationSelection.
     * The ConfigurationStructure defines the configuration for the plugin
     * and will be used to populate the GUI when invoking the plugin from webGME.
     * @returns {object} The version of the plugin.
     * @public
     */
    SoftwareGenerator.prototype.getConfigStructure = function() {
        return [
            {
                'name': 'generateCPN',
                'displayName': 'Generate CPN',
                'description': 'Enables generation of CPN-based timing analysis model.',
                'value': false,
                'valueType': 'boolean',
                'readOnly': false
            },
            {
                'name': 'compile',
                'displayName': 'Compile Code',
                'description': 'Turn off to just generate source files.',
                'value': false,
                'valueType': 'boolean',
                'readOnly': false
            },
	    {
		'name': 'generate_docs',
		'displayName': 'Generate Doxygen Docs',
		'description': 'Turn off to ignorre doc generation.',
		'value': false,
		'valueType': 'boolean',
		'readOnly': false
	    },
	    {
		'name': 'returnZip',
		'displayName': 'Zip and return generated artifacts.',
		'description': 'If true, it enables the client to download a zip of the artifacts.',
		'value': true,
		'valueType': 'boolean',
		'readOnly': false
	    }
        ];
    };

    SoftwareGenerator.prototype.notify = function(level, msg) {
	var self = this;
	var prefix = self.projectId + '::' + self.projectName + '::' + level + '::';
	var max_msg_len = 100;
	if (level=='error')
	    self.logger.error(msg);
	else if (level=='debug')
	    self.logger.debug(msg);
	else if (level=='info')
	    self.logger.info(msg);
	else if (level=='warning')
	    self.logger.warn(msg);
	self.createMessage(self.activeNode, msg, level);
	if (msg.length < max_msg_len)
	    self.sendNotification(prefix+msg);
	else {
	    var splitMsgs = utils.chunkString(msg, max_msg_len);
	    splitMsgs.map(function(splitMsg) {
		self.sendNotification(prefix+splitMsg);
	    });
	}
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
    SoftwareGenerator.prototype.main = function (callback) {
        // Use self to access core, project, result, logger etc from PluginBase.
        // These are all instantiated at this point.
        var self = this;

        // Default fails
        self.result.success = false;

	// What did the user select for our configuration?
	var currentConfig = self.getCurrentConfig();
	self.generateCPNAnalysis = currentConfig.generateCPN;
	self.compileCode = currentConfig.compile;
	self.generateDocs = currentConfig.generate_docs;
	self.returnZip = currentConfig.returnZip;
	self.runningOnClient = false;

        if (typeof WebGMEGlobal !== 'undefined') {
	    self.runningOnClient = true;
	    callback(new Error('Cannot run ' + self.getName() + ' in the browser!'), self.result);
	    return;
        }
	
        self.updateMETA(self.metaTypes);

	var path = require('path');

	// the active node for this plugin is software -> project
	var projectNode = self.activeNode;
	self.projectName = self.core.getAttribute(projectNode, 'name');

	// Setting up variables that will be used by various functions of this plugin
	self.gen_dir = path.join(process.cwd(),
				 'generated',
				 self.project.projectId,
				 self.branchName,
				 self.projectName);

	self.projectModel = {}; // will be filled out by loadProjectModel (and associated functions)

	loader.logger = self.logger;
	utils.logger = self.logger;
      	loader.loadProjectModel(self.core, self.META, projectNode, self.rootNode)
  	    .then(function (projectModel) {
		self.projectModel = projectModel;
        	return self.generateArtifacts();
  	    })
	    .then(function () {
		return self.downloadLibraries();
	    })
	    .then(function () {
		return self.generateCPN();
	    })
	    .then(function () {
		return self.runCompilation();
	    })
	    .then(function () {
		return self.generateDocumentation();
	    })
	    .then(function () {
		return self.createZip();
	    })
	    .then(function () {
        	self.result.setSuccess(true);
        	callback(null, self.result);
	    })
	    .catch(function (err) {
		self.notify('error', err);
        	self.result.setSuccess(false);
        	callback(err, self.result);
	    })
		.done();
    };

    SoftwareGenerator.prototype.generateArtifacts = function () {
	var self = this;
	if ( self.runningOnClient ) {
	    var msg = 'Skipping code generation.'
	    self.notify('info', msg);
	    return;
	}
	var path = require('path'),
	    filendir = require('filendir'),
	    filesToAdd = {},
	    prefix = 'src/';

	var path = require('path');
	var child_process = require('child_process');

	// clear out any previous project files
	child_process.execSync('rm -rf ' + utils.sanitizePath(self.gen_dir));

	filesToAdd[self.projectModel.name + '.json'] = JSON.stringify(self.projectModel, null, 2);
        filesToAdd[self.projectModel.name + '_metadata.json'] = JSON.stringify({
    	    projectID: self.project.projectId,
            commitHash: self.commitHash,
            branchName: self.branchName,
            timeStamp: (new Date()).toISOString(),
            pluginVersion: self.getVersion()
        }, null, 2);

	var doxygenConfigName = '/doxygen_config',
	    doxygenTemplate = TEMPLATES[self.FILES['doxygen_config']];
	filesToAdd[doxygenConfigName] = ejs.render(doxygenTemplate, 
						   {'projectName': self.projectName});

        for (var pkg in self.projectModel.software.packages) {
	    var pkgInfo = self.projectModel.software.packages[pkg],
		cmakeFileName = prefix + pkgInfo.name + '/CMakeLists.txt',
		cmakeTemplate = TEMPLATES[self.FILES['cmakelists']];
	    filesToAdd[cmakeFileName] = ejs.render(cmakeTemplate, {'pkgInfo':pkgInfo});

	    var packageXMLFileName = prefix + pkgInfo.name + '/package.xml',
		packageXMLTemplate = TEMPLATES[self.FILES['package_xml']];
	    filesToAdd[packageXMLFileName] = ejs.render(packageXMLTemplate, {'pkgInfo':pkgInfo});

	    for (var cmp in pkgInfo.components) {
		var compInfo = pkgInfo.components[cmp];
		self.generateComponentFiles(filesToAdd, prefix, pkgInfo, compInfo);
	    }

	    for (var msg in pkgInfo.messages) {
		var msgInfo = pkgInfo.messages[msg],
		    msgFileName = prefix + pkgInfo.name + '/msg/' + msgInfo.name + '.msg';
		filesToAdd[msgFileName] = msgInfo.definition;
	    }

	    for (var srv in pkgInfo.services) {
		var srvInfo = pkgInfo.services[srv],
		    srvFileName = prefix + pkgInfo.name + '/srv/' + srvInfo.name + '.srv';
		filesToAdd[srvFileName] = srvInfo.definition;
	    }
	}

	var promises = [];

	return (function () {
	    for (var f in filesToAdd) {
		var fname = path.join(self.gen_dir, f),
		data = filesToAdd[f];

		promises.push(new Promise(function(resolve, reject) {
		    filendir.writeFile(fname, data, function(err) {
			if (err) {
			    self.logger.error(err);
			    reject(err);
			}
			else {
			    resolve();
			}
		    });
		}));
	    }
	    return Q.all(promises);
	})()
	    .then(function() {
		var msg = 'Generated artifacts.';
		self.notify('info', msg);
	    })
    };

    SoftwareGenerator.prototype.generateComponentFiles = function (filesToAdd, prefix, pkgInfo, compInfo) {
	var inclFileName = prefix + pkgInfo.name + '/include/' + pkgInfo.name + '/' + compInfo.name + '.hpp',
	    srcFileName = prefix + pkgInfo.name + '/src/' + pkgInfo.name + '/' + compInfo.name + '.cpp',
	    compCPPTemplate = TEMPLATES[this.FILES['component_cpp']],
	    compHPPTemplate = TEMPLATES[this.FILES['component_hpp']];
	var moment = require('moment');
	filesToAdd[inclFileName] = ejs.render(compHPPTemplate, {'compInfo':compInfo, 'moment':moment});
	filesToAdd[srcFileName] = ejs.render(compCPPTemplate, {'compInfo':compInfo, 'moment':moment});
    };

    SoftwareGenerator.prototype.downloadLibraries = function ()
    {
	var self = this;
	if (self.runningOnClient) {
	    return;
	}
	var path = require('path'),
	prefix = path.join(self.gen_dir, 'src');

	// Get the required node executable
	var file_url = 'https://github.com/rosmod/rosmod-actor/releases/download/v0.3.2/rosmod-node.zip';
	var dir = prefix;

	var libraries = self.projectModel.software.libraries;
	var nodeLib = {url:file_url};
	libraries['rosmod-actor'] = nodeLib;

	var libKeys = Object.keys(libraries);
	var tasks = libKeys.map(function(libKey) {
	    var lib = libraries[libKey];
	    if (lib.url) {
		return utils.wgetAndUnzipLibrary(lib.url, dir);
	    }
	});

	return Q.all(tasks);
    };

    SoftwareGenerator.prototype.generateDocumentation = function () 
    {
	var self = this;
	if (!self.generateDocs || self.runningOnClient) {
	    var msg = 'Skipping documentation generation.'
	    self.notify('info', msg);
	    return;
	}
	var msg = 'Generating documentation.'
	self.notify('info', msg);
        //self.createMessage(self.activeNode, msg);
	return new Promise(function(resolve, reject) {
	    var terminal = require('child_process').spawn('bash', [], {cwd:self.gen_dir});

	    terminal.stdout.on('data', function (data) {});

	    terminal.stderr.on('data', function (error) {
	    });

	    terminal.on('exit', function (code) {
		//self.logger.debug('document generation:: child process exited with code ' + code);
		if (code == 0) {
		    resolve(code);
		}
		else {
		    var procStderr;
		    reject('document generation:: child process exited with code ' + code);
		}
	    });

	    setTimeout(function() {
		//self.logger.debug('Sending stdin to terminal');
		terminal.stdin.write('doxygen doxygen_config\n');
		terminal.stdin.write('make -C ./doc/latex/ pdf\n');
		terminal.stdin.write('mv ./doc/latex/refman.pdf ' + utils.sanitizePath(self.projectModel.name) + '.pdf');
		//self.logger.debug('Ending terminal session');
		terminal.stdin.end();
	    }, 1000);
	})
	    .then(function() {
		self.notify('info', 'Generated doxygen documentation.');
	    });
    };

    SoftwareGenerator.prototype.generateCPN = function()
    {
	var self = this,
	filesToAdd = {};
	if (!self.generateCPNAnalysis || self.runningOnClient) {
	    var msg = 'Skipping CPN model generation.';
	    self.notify('info', msg);
	    return;
	}

	var msg = 'Generating CPN Model.';
	self.notify('info',msg);

	var path = require('path'),
	prefix = path.join(self.gen_dir);
	var promises = [];

	// Get the dummy cpn template
	var file_url = 'https://github.com/rosmod/rosmod-cpn/releases/download/v1.0.0/cpn.zip';
	var dir = prefix;
	return utils.wgetAndUnzipLibrary(file_url, dir)
	    .then(function() {
		self.createMessage(self.activeNode, 'Downloaded CPN template');
		for (var dpl in self.projectModel.deployments) {
		    var dpl_model = self.projectModel.deployments[dpl]; 
		    self.createMessage(self.activeNode, 'Parsing Deployment: ' + dpl_model.name);
		    var timer_tokens = '1`[\n';
		    var clock_tokens = '1`[\n';
		    var interaction_tokens = '1`[\n';
		    var component_thread_tokens = '1`[\n';
		    var message_queue_tokens = '1`[\n';
		    var hardware_num = 1

		    var msg_map = {};
		    var srv_map = {};
		    var component_hardware_map = {};

		    for (var c in dpl_model.containers) {
			var container = dpl_model.containers[c];
			for (var n in container.nodes) {
			    var node = container.nodes[n];
			    for (var ci in node.compInstances) {
				var compInstance = node.compInstances[ci];
				var component = compInstance.component;
				component_hardware_map[component.name] = "CPU_" + hardware_num;
			    }
			}
			hardware_num += 1;
		    }
		    hardware_num = 1;
		    for (var c in dpl_model.containers) {
			var container = dpl_model.containers[c];
			for (var n in container.nodes) {
			    var node = container.nodes[n];
			    for (var ci in node.compInstances) {
				var compInstance = node.compInstances[ci];
				var component = compInstance.component;
				for (var p in component.publishers) {
				    var publisher = component.publishers[p];
				    publisher.component = component.name;
				    var msg = publisher.topic.name;
				    if (!msg_map[msg]) {
					msg_map[msg] = {
					    publishers: [],
					    subscribers: []
					};
				    }
				    msg_map[msg].publishers.push(publisher);
				}
				for (var s in component.subscribers) {
				    var subscriber = component.subscribers[s];
				    subscriber.component = component.name;
				    var msg = subscriber.topic.name;
				    if (!msg_map[msg]) {
					msg_map[msg] = {
					    publishers: [],
					    subscribers: []
					};
				    }
				    msg_map[msg].subscribers.push(subscriber);
				}
				for (var c in component.clients) {
				    var client = component.clients[c];
				    client.component = component.name;
				    var srv = client.service.name;
				    if (!srv_map[srv]) {
					srv_map[srv] = {
					    clients : [],
					    servers : []
					};
				    }
				    srv_map[srv].clients.push(client);
				}
				for (var s in component.servers) {
				    var server = component.servers[s];
				    server.component = component.name;
				    var srv = server.service.name;
				    if (!srv_map[srv]) {
					srv_map[srv] = {
					    clients : [],
					    servers : []
					};
				    }
				    srv_map[srv].servers.push(server);
				}
			    }
			}
		    }

		    for (var c in dpl_model.containers) {
			var container = dpl_model.containers[c];

			// Clock Tokens check
			if (clock_tokens != '1`[\n') {
			    clock_tokens += ',\n';
			}
			clock_tokens += '{node="CPU_' + hardware_num.toString() 
			    + '", value=0, next_tick=4000}';

			// Component Thread Tokens check
			if (component_thread_tokens != '1`[\n') {
			    component_thread_tokens += ',\n';
			}
			component_thread_tokens += '{node="CPU_' + hardware_num.toString() + '", threads=[';

			// Component Message Queue Tokens check
			if (message_queue_tokens != '1`[\n') {
			    message_queue_tokens += ',\n';
			    }
			// 1`[{node=&quot;BBB_111&quot;, cmql=[{component=&quot;Component_1&quot;, scheme=PFIFO, queue=[]}]}]
			message_queue_tokens += '{node="CPU_' + hardware_num.toString() + '", cmql=[';
			
			for (var n in container.nodes) {
			    var node = container.nodes[n];
			    var node_priority = node.priority;

			    for (var ci in node.compInstances) {
				var compInstance = node.compInstances[ci];
				var component = compInstance.component;
				if (component_thread_tokens.slice(-1) != '[')
				    component_thread_tokens += ', ';
				component_thread_tokens += '{node="CPU_' + hardware_num.toString() + 
				    '", component="' + component.name + '", priority=' + node_priority + ', operation=[]}';

				if (message_queue_tokens.slice(-1) != '[')
				    message_queue_tokens += ', ';
				message_queue_tokens += '{component="' + component.name 
				    + '", scheme=' + compInstance.schedulingScheme + ', queue=[]}';
			    }

			    for (var ci in node.compInstances) {
				var compInstance = node.compInstances[ci];
				var component = compInstance.component;

				for (var t in component.timers) {
				    var timer = component.timers[t];
				    // Timer Tokens check
				    if (timer_tokens != '1`[\n') {
					timer_tokens += ',\n';
				    }
				    timer_tokens += '{node="CPU_' + hardware_num.toString() + 
					'", period=' + timer.period * 1000000 + ', offset=0, operation=' +
					'{node="CPU_' + hardware_num.toString() + '", component="' +
					component.name + '", operation="' + timer.name + '_operation"' + 
					', priority=' + timer.priority + ', deadline=' + 
					timer.deadline * 1000000 + ', enqueue_time=0, steps=[';
				    var re = /([A-Z]*)\s([\w\_\.\(\)]+);/g;
				    var result = re.exec(timer.abstractBusinessLogic);
				    while(result != null) {
					var port_type = result[1];
					var wcet = 0;
					if (port_type == "LOCAL") {
					    var wcet = result[2];
					    if (timer_tokens.slice(-1) != '[')
						timer_tokens += ', ';
					    timer_tokens += '{kind="LOCAL", port="LOCAL", unblk=[], exec_time=0, duration=' + wcet * 1000000 + '}';
					}
					else if (port_type == "RMI") {
					    if (timer_tokens.slice(-1) != '[')
						timer_tokens += ', ';
					    timer_tokens += '{kind="CLIENT", port="' + result[2] + '", unblk=[], exec_time=0, duration=0}';
					}
					else if (port_type == "PUBLISH") {
					    if (timer_tokens.slice(-1) != '[')
						timer_tokens += ', ';
					    timer_tokens += '{kind="PUBLISHER", port="' + result[2] + '", unblk=[], exec_time=0, duration=0}';
					}
					result = re.exec(timer.abstractBusinessLogic);
				    }
				    timer_tokens += ']}}';
				}

				for (var p in component.publishers) {
				    var publisher = component.publishers[p];
				    var topic = publisher.topic.name;
				    var subscribers = msg_map[topic].subscribers;
				    for (var s in subscribers) {
					var subscriber = subscribers[s];
					if (interaction_tokens != '1`[\n') {
					    interaction_tokens += ',\n';
					}
					interaction_tokens += '{node="CPU_' + hardware_num.toString() + 
					    '", port="' + publisher.name + '", operation={node="' + component_hardware_map[subscriber.component] + '", component="' + 
					    subscriber.component + '", operation="' + subscriber.name + '_operation", priority=' + subscriber.priority + ', deadline=' + 
					    subscriber.deadline * 1000000 + ', enqueue_time=0, steps=[';
					var re = /([A-Z]*)\s([\w\_\.\(\)]+);/g;
					var result = re.exec(subscriber.abstractBusinessLogic);
					while(result != null) {
					    var port_type = result[1];
					    var wcet = 0;
					    if (port_type == "LOCAL") {
						var wcet = result[2];
						if (interaction_tokens.slice(-1) != '[')
						    interaction_tokens += ', ';
						interaction_tokens += '{kind="LOCAL", port="LOCAL", unblk=[], exec_time=0, duration=' + wcet * 1000000 + '}';
					    }
					    else if (port_type == "RMI") {
						if (interaction_tokens.slice(-1) != '[')
						    interaction_tokens += ', ';
						interaction_tokens += '{kind="CLIENT", port="' + result[2] + '", unblk=[], exec_time=0, duration=0}';
					    }
					    else if (port_type == "PUBLISH") {
						if (interaction_tokens.slice(-1) != '[')
						    interaction_tokens += ', ';
						interaction_tokens += '{kind="PUBLISHER", port="' + result[2] + '", unblk=[], exec_time=0, duration=0}';
					    }
					    result = re.exec(subscriber.abstractBusinessLogic);
					}
					interaction_tokens += ']}}';
				    }
				}

				for (var c in component.clients) {
				    var client = component.clients[c];
				    var service = client.service.name;
				    var servers = srv_map[service].servers;
				    for (var s in servers) {
					var server = servers[s];
					if (interaction_tokens != '1`[\n') {
					    interaction_tokens += ',\n';
					}
					interaction_tokens += '{node="CPU_' + hardware_num.toString() + 
					    '", port="' + client.name + '", operation={node="' + component_hardware_map[server.component] + '", component="' + 
					    server.component + '", operation="' + server.name + '_operation", priority=' + server.priority + ', deadline=' + 
					    server.deadline * 1000000 + ', enqueue_time=0, steps=[';
					var re = /([A-Z]*)\s([\w\_\.\(\)]+);/g;
					var result = re.exec(server.abstractBusinessLogic);
					while(result != null) {
					    var port_type = result[1];
					    var wcet = 0;
					    if (port_type == "LOCAL") {
						var wcet = result[2];
						if (interaction_tokens.slice(-1) != '[')
						    interaction_tokens += ', ';
						interaction_tokens += '{kind="LOCAL", port="LOCAL", unblk=[], exec_time=0, duration=' + wcet * 1000000 + '}';
					    }
					    else if (port_type == "RMI") {
						if (interaction_tokens.slice(-1) != '[')
						    interaction_tokens += ', ';
						interaction_tokens += '{kind="CLIENT", port="' + result[2] + '", unblk=[], exec_time=0, duration=0}';
					    }
					    else if (port_type == "PUBLISH") {
						if (interaction_tokens.slice(-1) != '[')
						    interaction_tokens += ', ';
						interaction_tokens += '{kind="PUBLISHER", port="' + result[2] + '", unblk=[], exec_time=0, duration=0}';
					    }					    
					    result = re.exec(server.abstractBusinessLogic);
					}
					var n = interaction_tokens.lastIndexOf("unblk=[]");
					interaction_tokens = interaction_tokens.slice(0, n) + interaction_tokens.slice(n).replace("unblk=[]", 'unblk=[{node="CPU_' +  
																  hardware_num.toString() + '", component="' + 
																  component.name  + '", port="' + client.name  + '"}]');
					interaction_tokens += ']}}';
				    }
				}

			    }
			}
			component_thread_tokens += ']}';
			message_queue_tokens += ']}';
			hardware_num += 1
		    }
		    clock_tokens += '\n]';
		    timer_tokens += '\n]';
		    interaction_tokens += '\n]';
		    component_thread_tokens += '\n]';
		    message_queue_tokens += '\n]';

		    var cpn = 'cpn/' + dpl_model.name + '_Analysis_Model.cpn',
		    cpnTemplate = TEMPLATES[self.FILES['cpn']];
		    self.notify('info', cpn);
		    filesToAdd[cpn] = ejs.render(cpnTemplate, {'clock_tokens' : clock_tokens, 
							       'timer_tokens' : timer_tokens,
							       'interaction_tokens' : interaction_tokens,
							       'component_thread_tokens' : component_thread_tokens,
							       'message_queue_tokens' : message_queue_tokens});
		}
	    })
	    .then(function() {
		var filendir = require('filendir');
		var fileKeys = Object.keys(filesToAdd);
		var tasks = fileKeys.map(function(key) {
		    var fname = path.join(self.gen_dir, key),
		    data = filesToAdd[key];

		    return new Promise(function(resolve, reject) {
			filendir.writeFile(fname, data, function(err) {
			    if (err) {
				self.logger.error(err);
				reject(err);
			    }
			    else {
				resolve();
			    }
			});
		    });
		});
		return Q.all(tasks);
	    })
	    .then(function() {
		var msg = 'Generated CPN';
		self.notify('info', msg);
	    })
    };

    SoftwareGenerator.prototype.getValidArchitectures = function() {
	var self = this,
	validArchs = {};
	for (var sys in self.projectModel.systems) {
	    var system = self.projectModel.systems[sys];
	    for (var hst in system.hosts) {
		var host = system.hosts[hst];
		var devName = utils.getDeviceType(host);
		if (validArchs[devName] === undefined) {
		    validArchs[devName] = [];
		}
		validArchs[devName].push(host);
	    }
	}
	return validArchs;
    };

    SoftwareGenerator.prototype.selectCompilationArchitectures = function() {
	
	var self = this;

	var validArchitectures = self.getValidArchitectures();
	var promises = [];

	var tasks = Object.keys(validArchitectures).map(function(index) {
	    return utils.getAvailableHosts(validArchitectures[index])
		.then(function(hostArr) {
		    var retObj = {};
		    retObj[index] = hostArr;
		    return retObj;
		});
	});
	return Q.all(tasks)
	    .then(function (nestedArr) {
		var validHosts = {};
		nestedArr.forEach(function(subArr) {
		    var arch = Object.keys(subArr)[0];
		    validHosts[arch] = subArr[arch];
		});
		return validHosts;
	    });
    };

    SoftwareGenerator.prototype.compileOnHost = function (host) {
	var self = this;
	var path = require('path');
	var mkdirp = require('mkdirp');
	var child_process = require('child_process');

	var base_compile_dir = path.join(host.user.directory, 'compilation');
	var compile_dir = path.join(base_compile_dir, self.project.projectId, self.branchName);
	var archBinPath = path.join(self.gen_dir, 'bin' , utils.getDeviceType(host.host));

	var compile_commands = [
	    'cd ' + compile_dir,
	    'rm -rf bin',
	    'source /opt/ros/indigo/setup.bash',
	    'catkin_make -DNAMESPACE=rosmod',
	    'mkdir bin',
	    'cp devel/lib/*.so bin/.',
	    'cp devel/lib/node/node_main bin/.',
	    'rm -rf devel build'
	];

	child_process.execSync('rm -rf ' + utils.sanitizePath(archBinPath));

	// make the compile dir
	var t1 = new Promise(function(resolve,reject) {
	    self.notify('info', 'making compilation directory on: ' + host.intf.ip);
	    utils.mkdirRemote(compile_dir, host.intf.ip, host.user)
		.then(function() {
		    resolve();
		});
	});
	// copy the sources to remote
	var t2 = t1.then(function() {
	    self.notify('info', 'copying compilation sources to: ' + host.intf.ip);
	    return utils.copyToHost(self.gen_dir, compile_dir, host.intf.ip, host.user);
	});
	// run the compile step
	var t3 = t2.then(function() {
	    var stderrCB = function(data) {
		if ( data.indexOf('error:') > -1 ) {
		    var compileErrors = utils.parseMakeErrorOutput(
			data,
			compile_dir + '/src/'
		    );
		    compileErrors.map(function(compileError) {
			var msg = 'Build Error:: ' + compileError.packageName + ':' +
			    compileError.fileName + ':' + 
			    compileError.line + ':' + compileError.column + ':\n\t' +
			    compileError.text + '\n';
			self.notify('error', msg);
		    });
		    return true;
		}
		else if ( data.indexOf('warning:') > -1 ) {
		    var compileErrors = utils.parseMakeErrorOutput(
			data,
			compile_dir + '/src/'
		    );
		    compileErrors.map(function(compileError) {
			var msg = 'Build Warning:: ' + compileError.packageName + ':' +
			    compileError.fileName + ':' + 
			    compileError.line + ':' + compileError.column + ':\n\t' +
			    compileError.text + '\n';
			self.notify('warning', msg);
		    });
		    return false;
		}
		else {
		    // handle errors that may come before make gets invoked
		    var msg = 'Build Error:: ' + data;
		    self.notify('error', msg);
		    return true;
		}
	    };
	    self.notify('info', 'compiling on: ' + host.intf.ip + ' into '+compile_dir);
	    return utils.executeOnHost(compile_commands, host.intf.ip, host.user, stderrCB)
		.catch(function(err) {
		    throw new String('Compilation failed on ' + host.intf.ip);
		});
	});
	// make the local binary folder for the architecture
	var t4 = t3.then(function() {
	    mkdirp.sync(archBinPath);
	    return true;
	});
	// copy the compiled binaries from remote into the local bin folder
	var t5 = t4.then(function() {
	    self.notify('info', 'copying from ' + host.intf.ip + ' into local storage.');
	    return utils.copyFromHost(path.join(compile_dir, 'bin') + '/*', 
				      archBinPath + '/.',
				      host.intf.ip,
				      host.user);
	});
	// remove the remote folders
	var t6 = t5.then(function() {
	    self.notify('info', 'removing compilation artifacts off: ' + host.intf.ip);
	    return utils.executeOnHost(['rm -rf ' + base_compile_dir], host.intf.ip, host.user);
	});
	return Q.all([t1,t2,t3,t4,t5,t6]);
    };
    
    SoftwareGenerator.prototype.cleanHost = function(host) {
	var self = this;
	var path = require('path');
	var base_compile_dir = path.join(host.user.directory, 'compilation');
	return utils.executeOnHost(['rm -rf ' + base_compile_dir], host.intf.ip, host.user);
    };

    SoftwareGenerator.prototype.runCompilation = function ()
    {
	var self = this;

	if (!self.compileCode || self.runningOnClient) {
	    var msg = 'Skipping compilation.';
	    self.notify('info', msg);
	    return;
	}

	return self.selectCompilationArchitectures()
	    .then(function(validHostList) {
		return self.compileBinaries(validHostList);
	    });
    };

    SoftwareGenerator.prototype.compileBinaries = function (validHostList)
    {
	var self = this;
	var selectedHosts = [];

	var path = require('path');
	var binPath = path.join(self.gen_dir, 'bin');
	var child_process = require('child_process');

	// clear out any previous binaries
	child_process.execSync('rm -rf ' + utils.sanitizePath(binPath));

	for (var arch in validHostList) {
	    var hosts = validHostList[arch];
	    if (hosts.length) {
		selectedHosts.push(hosts[0]);
	    }
	    else {
		var msg = 'No hosts could be found for compilation on ' + arch;
		self.notify('warning', msg);
	    }
	}

	var tasks = selectedHosts.map(function (host) {
	    var msg = 'Compiling for ' + utils.getDeviceType(host.host) + ' on ' + host.intf.ip;
	    self.notify('info', msg);
	    return self.compileOnHost(host);
	});
	
	return Q.all(tasks)
	    .then(function() {
		self.createMessage(self.activeNode, 'Compiled binaries.');
	    })
	    .catch(function(err) {
		child_process.execSync('rm -rf ' + utils.sanitizePath(binPath));
		var tasks = selectedHosts.map(function (host) {
		    return self.cleanHost(host);
		});
		return Q.all(tasks)
		    .then(function () {
			throw err;
		    });
	    });
    };
			      
    SoftwareGenerator.prototype.createZip = function() {
	var self = this;
	
	if (!self.returnZip || self.runningOnClient) {
            self.notify('info', 'Skipping compression.');
	    return;
	}

	self.notify('info', 'Starting compression.');
	
	return new Promise(function(resolve, reject) {
	    var zlib = require('zlib'),
	    tar = require('tar'),
	    fstream = require('fstream'),
	    input = self.gen_dir;

	    var bufs = [];
	    var packer = tar.Pack()
		.on('error', function(e) { reject(e); });

	    var gzipper = zlib.Gzip()
		.on('error', function(e) { reject(e); })
		.on('data', function(d) { bufs.push(d); })
		.on('end', function() {
		    var buf = Buffer.concat(bufs);
		    self.blobClient.putFile('artifacts.tar.gz',buf)
			.then(function (hash) {
			    self.result.addArtifact(hash);
			    resolve();
			})
			.catch(function(err) {
			    reject(err);
			})
			    .done();
		});

	    var reader = fstream.Reader({ 'path': input, 'type': 'Directory' })
		.on('error', function(e) { reject(e); });

	    reader
		.pipe(packer)
		.pipe(gzipper);
	})
	    .then(function() {
		self.notify('info', 'Created archive.');
	    });
    };

    return SoftwareGenerator;
});
