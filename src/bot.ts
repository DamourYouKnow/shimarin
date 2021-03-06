import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';
import * as Discord from 'discord.js';

type CommandHandler = (message: Discord.Message, ...args: string[]) => void;

interface CommandInfo {
    name: string,
    aliases?: string[]
}

export class Bot {
    client: Discord.Client;
    config: any;
    commands: Commands;

    constructor(client: Discord.Client) {
        this.client = client;
        this.config = yaml.load(
            fs.readFileSync(path.resolve(__dirname, '../config.yml'))
        );
        this.commands = new Commands();
        this.client.on('ready', () => {
            console.log(`Logged in as ${client.user.tag}`);
        });
    }

    login() {
        const token = process.env.DISCORD_API_TOKEN || this.config.token;
        if (token) {
            this.client.login(token);
            this.client.on('message', (message) => {
                this.messageHandler(this.commands, message);
            });
        } else {
            console.error(
                'No token provided in environment variables or config.yml'
            );
        }
    }

    private messageHandler(commands: Commands, message: Discord.Message) {
        if (message.content.startsWith(this.config.commandPrefix)) {
            const command = message.content.substring(
                this.config.commandPrefix.length
            ).split(' ')[0];
            if (commands.exists(command)) {
                const args = message.content.split(' ').slice(1).map((arg) => {
                    return arg.toLowerCase();
                });
                commands.execute(command, message, args);
            }
        }
    }
}

interface PageInfo {
    currentPage: number,
    lastPage: number
}

export class EmbedNavigator {
    message: Discord.Message;
    navigatingUser: Discord.User;
    pageInfo: PageInfo;
    generatePage: (page: number) => Promise<Discord.MessageEmbed>;

    constructor(
        message: Discord.Message,
        navigatingUser: Discord.User,
        pageInfo: PageInfo,
        generatePage: (page: number) => Promise<Discord.MessageEmbed>
    ) {
        this.message = message;
        this.navigatingUser = navigatingUser;
        this.pageInfo = pageInfo;
        this.generatePage = generatePage;
    }

    async listen() {
        const previousBtn = await this.message.react('⬅️');
        const nextBtn = await this.message.react('➡️');
        const filter: Discord.CollectorFilter = () => true;
        const collector = this.message.createReactionCollector(filter, {
            dispose: true
        });

        const navigatingUser = this.navigatingUser;
        const handleReaction = (
            reaction: Discord.MessageReaction,
            user: Discord.User
        ) => {
            if (user != navigatingUser) return;
            if (reaction == nextBtn) this.next();
            if (reaction == previousBtn) this.previous();
        };

        collector.on('collect', handleReaction);
        collector.on('remove', handleReaction);
    }

    async next() {
        if (this.pageInfo.currentPage < this.pageInfo.lastPage) {
            this.pageInfo.currentPage += 1;
            const embed = await this.generatePage(this.pageInfo.currentPage);
            await this.message.edit(embed);
        }
    }

    async previous() {
        if (this.pageInfo.currentPage > 0) {
            this.pageInfo.currentPage -= 1;
            const embed = await this.generatePage(this.pageInfo.currentPage);
            await this.message.edit(embed);
        }
    }
}

class Commands {
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

    async execute(
        command: string,
        message: Discord.Message,
        args: string[] = []
    ) {
        try {
            await this.commands
                .get(command)
                .apply(null, [message, ...args]);
        } catch (err) {
            console.error(err);
            message.channel.send(err.message || 'An error ocurred.');
        }
    }
}
