const Discord = require('discord.js');
const helpers = require('./helpers.js');

const client = new Discord.Client();

client.on('ready', () => {
    console.log(`Logged in as ${client.user.tag}`);
});

const commands = new helpers.Commands();

// Add your commands here...
commands.add({name: 'ping'}, (message) => {
    message.channel.send('pong!');
});

commands.add({name: 'say', aliases: ['speak']}, (message, arg) => {
    message.channel.send(arg || 'No argument provided');
});

// Pass messages to message handler.
client.on('message', (message) => {
    helpers.messageHandler(commands, message);
});

helpers.login(client);
