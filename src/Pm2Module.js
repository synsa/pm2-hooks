/**
 * Created by desaroger on 25/02/17.
 */

let _ = require('lodash');
let co = require('co');
let childProcess = require('child_process');
let WebhookServer = require('./WebhookServer');
let { log, c } = require('./utils');

class Pm2Module {

    constructor(processes = [], options = {}) {
        options.routes = Pm2Module._parseProcesses(processes);
        this.routes = options.routes;
        this.webhookServer = new WebhookServer(options);
    }

    start() {
        return this.webhookServer.start()
            .then(() => {
                let msg = 'Started. Routes:\n';
                _.forOwn(this.routes, (route, name) => {
                    msg += ` - ${name}: ${JSON.stringify(route)}\n`;
                });
                log(msg);
            });
    }

    stop() {
        return this.webhookServer.stop()
            .then(() => {
                log('Stopped.');
            });
    }

    /**
     * Converts an array of PM2 processes to an object structured
     * for the WebhookServer routes. It internally uses the _parseProcess
     * method
     *
     * Example 1:
     * - input:
     * [
     *      { pm2_env: { env_hook: { name: 'api', type: 'bitbucket' } } },
     *      { pm2_env: { env_hook: { name: 'panel', type: 'github' } } }
     * ]
     * - output:
     * {
     *      api: { type: 'bitbucket' },
     *      panel: { type: 'github' }
     * }
     *
     * @param processes
     * @returns {*}
     * @private
     */
    static _parseProcesses(processes) {
        return processes
            .map(p => Pm2Module._parseProcess(p))
            .filter(p => !!p)
            .reduce((routes, app) => {
                routes[app.name] = app;
                delete app.name;
                return routes;
            }, {});
    }

    /**
     * Converts a PM2 process object to an object for WebhookServer
     * route.
     *
     * Example 1:
     * - input: { pm2_env: { env_hook: { name: 'api', type: 'bitbucket' } } }
     * - output: { name: 'api', type: 'bitbucket' }
     * Example 2:
     * - input: { pm2_env: { env_hook: { type: 'bitbucket' } } }
     * - output: { name: 'unknown', type: 'bitbucket' }
     *
     * @param process The Pm2 process
     * @returns {object|null} The route object, or null if invalid
     * @private
     */
    static _parseProcess(app) {
        // Check data
        if (!app) {
            return null;
        }
        console.log('');
        console.log('app', app);
        console.log('');
        let processOptions = _.get(app, 'pm2_env.env_hook');
        if (!processOptions) {
            return null;
        }
        let data = _.get(app, 'pm2_env.env_hook');
        if (data === true) {
            data = {};
        }

        // Data to WebhookServer route
        let self = this;
        let name = app.name || 'unknown';
        let commandOptions = Object.assign({}, { cwd: data.cwd || app.pm_cwd }, data.commandOptions || {});
        let route = {
            name,
            type: data.type,
            method: c(function* () {
                try {
                    if (data.command) {
                        log(`Running command: ${data.command}`);
                        yield self._runCommand(data.command, commandOptions);
                    }
                } catch (e) {
                    let err = e.message || e;
                    log(`Error on "${name}" route: ${err}`, 2);
                    throw e;
                }
            })
        };
        route = cleanObj(route);

        return route;
    }

    /**
     * Runs a line command.
     *
     * @param {String} command The line to execute
     * @param {Object} options The object options
     * @returns {Promise<code>} The code of the error, or a void fulfilled promise
     * @private
     */
    static _runCommand(command, options = {}) {
        _.defaults(options, {
            env: process.env,
            shell: true
        });
        return new Promise((resolve, reject) => {
            let child = childProcess.spawn('eval', [command], options);
            child.on('close', (code) => {
                if (!code) {
                    resolve();
                } else {
                    reject(code);
                }
            });
        });
    }
}

module.exports = Pm2Module;

function cleanObj(obj) {
    return _(obj).omitBy(_.isUndefined).value();
}
