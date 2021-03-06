import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';
import { Message } from 'discord.js'

const config = yaml.load(
    fs.readFileSync(path.resolve(__dirname, '../config.yml'))
);

type CommandHandler = (message: Message, ...args: string[]) => void;

interface CommandInfo {
    name: string,
    aliases?: string[]
}

export module Helpers {
    export class Commands {
        commands: Map<string, CommandHandler>;

        constructor() {
            this.commands = new Map();
        }

        add(command: CommandInfo, handler: CommandHandler) {
            [command.name, ...command.aliases || []].map((cmd) => {
                this.commands.set(cmd, handler);
            });
        }

        exists(command: string): boolean {
            return this.commands.has(command);
        }

        execute(command: string, message: Message, args: string[] = []) {
            this.commands.get(command).apply(null, [message, ...args]);
        }
    }

    export function messageHandler(commands: Commands, message: Message) {
        if (message.content.startsWith(config.commandPrefix)) {
            const command = message.content.substring(
                config.commandPrefix.length
            ).split(' ')[0];
            if (commands.exists(command)) {
                const args = message.content.split(' ').slice(1);
                commands.execute(command, message, args);
            }
        }
    }

    export function login(client) {
        const token = process.env.DISCORD_API_TOKEN || config.token;
        if (token) {
            client.login(token);
        } else {
            console.error(
                'No token provided in environment variables or config.yml'
            );
        }
    }
}
