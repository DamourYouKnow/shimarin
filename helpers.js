
const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

const config = yaml.load(
    fs.readFileSync(path.resolve(__dirname, 'config.yml'))
);

module.exports = {};

module.exports.Commands = class {
    constructor() {
        this.commands = { };
    }

    add(command, handler) {
        [command.name, ...command.aliases || []].map((cmd) => {
            this.commands[cmd] = handler;
        });
    }

    exists(command) {
        return command in this.commands;
    }

    execute(command, message, args=[]) {
        this.commands[command].apply(null, [message, ...args]);
    }
};

module.exports.messageHandler = function(commands, message) {
    if (message.content.startsWith(config.commandPrefix)) {
        const command = message.content.substring(config.commandPrefix.length)
            .split(' ')[0];
        if (commands.exists(command)) {
            const args = message.content.split(' ').slice(1);
            commands.execute(command, message, args);
        }
    }
};

module.exports.login = function(client) {
    const token = process.env.DISCORD_API_TOKEN || config.token;
    if (token) {
        client.login(token);
    } else {
        console.log('No token provided in environment variables or config.yml');
    }
};
