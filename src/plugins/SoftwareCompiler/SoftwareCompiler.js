/*globals define*/
/*jshint node:true, browser:true*/

/**
 * Generated by PluginGenerator 0.14.0 from webgme on Wed Mar 02 2016 22:16:54 GMT-0600 (Central Standard Time).
 */

define([
    'plugin/PluginConfig',
    'plugin/PluginBase'
], function (
    PluginConfig,
    PluginBase) {
    'use strict';

    /**
     * Initializes a new instance of SoftwareCompiler.
     * @class
     * @augments {PluginBase}
     * @classdesc This class represents the plugin SoftwareCompiler.
     * @constructor
     */
    var SoftwareCompiler = function () {
        // Call base class' constructor.
        PluginBase.call(this);
    };

    // Prototypal inheritance from PluginBase.
    SoftwareCompiler.prototype = Object.create(PluginBase.prototype);
    SoftwareCompiler.prototype.constructor = SoftwareCompiler;

    /**
     * Gets the name of the SoftwareCompiler.
     * @returns {string} The name of the plugin.
     * @public
     */
    SoftwareCompiler.prototype.getName = function () {
        return 'SoftwareCompiler';
    };

    /**
     * Gets the semantic version (semver.org) of the SoftwareCompiler.
     * @returns {string} The version of the plugin.
     * @public
     */
    SoftwareCompiler.prototype.getVersion = function () {
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
    SoftwareCompiler.prototype.main = function (callback) {
        // Use self to access core, project, result, logger etc from PluginBase.
        // These are all instantiated at this point.
        var self = this,
            nodeObject;


        // Using the logger.
        self.logger.debug('This is a debug message.');
        self.logger.info('This is an info message.');
        self.logger.warn('This is a warning message.');
        self.logger.error('This is an error message.');

        // Using the coreAPI to make changes.

        nodeObject = self.activeNode;

        self.core.setAttribute(nodeObject, 'name', 'My new obj');
        self.core.setRegistry(nodeObject, 'position', {x: 70, y: 70});


        // This will save the changes. If you don't want to save;
        // exclude self.save and call callback directly from this scope.
        self.save('SoftwareCompiler updated model.', function (err) {
            if (err) {
                callback(err, self.result);
                return;
            }
            self.result.setSuccess(true);
            callback(null, self.result);
        });

    };

    return SoftwareCompiler;
});