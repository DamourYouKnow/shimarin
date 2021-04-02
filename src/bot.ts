import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';
import * as Discord from 'discord.js';
import { version } from '../package.json';

type Channel =  Discord.TextChannel | Discord.DMChannel | Discord.NewsChannel;

const config = yaml.load(
    fs.readFileSync(path.resolve(__dirname, '../config.yml'))
);
export class Bot {
    client: Discord.Client;
    config: any;
    modules: Module[];

    constructor(client: Discord.Client) {
        this.client = client;
        this.config = config;
        this.modules = [];

        this.client.on('ready', () => {
            console.log(`Logged in as ${client.user.tag}`);
        });
    }

    get commands(): Command[] {
        return this.modules.map((module) => module.commands)
            .reduce((a, c) => [...a, ...c]);
    }

    command(commandName: string): Command | undefined {
        for (const module of this.modules) {
            const command = module.command(commandName);
            if (command) return command;
        }
        return undefined;
    }

    addModule(module: Module) {
        this.modules.push(module);
    }

    login() {
        const token = process.env.DISCORD_API_TOKEN || this.config.token;
        if (token) {
            this.client.login(token);
            this.client.on('message', (message) => {
                this.messageHandler(message);
            });
        } else {
            console.error(
                'No token provided in environment variables or config.yml'
            );
        }
    }

    async sendError(
        channel: Channel,
        message: string
    ): Promise<Discord.Message> {
        return await channel.send(new MessageEmbed({
            color: '#ff0000',
            title: 'An error occurred!',
            description: message
        }, this));
    }

    async sendEmbed(
        channel: Channel,
        title: string,
        message: string
    ): Promise<Discord.Message> {
        return await channel.send(new MessageEmbed({
            title: title,
            description: message
        }, this));
    }

    private async messageHandler(message: Discord.Message) {
        if (message.content.startsWith(this.config.commandPrefix)) {
            const commandStr = message.content.substring(
                this.config.commandPrefix.length
            ).split(' ')[0];
            const command = this.command(commandStr);
            if (!command) return;
            const args = message.content.split(' ').slice(1).map((arg) => {
                return arg.toLowerCase();
            });
            try {
                await command.handler.apply(null, [message, ...args]);
            } catch (err) {
                console.error(err);
                this.sendError(
                    message.channel,
                    'An unexpected has error occurred.'
                );
            }
        }
    }
}

export abstract class Module {
    protected bot: Bot;
    private commandsMap: Map<string, Command>;
    commands: Command[];

    constructor(bot: Bot) {
        this.bot = bot;
        this.commandsMap = new Map();
        this.commands = [];
    }

    addCommand(commandInfo: CommandInfo, handler: CommandHandler) {
        [commandInfo.name, ...commandInfo.aliases || []].map((cmd) => {
            this.commandsMap.set(cmd, { info: commandInfo, handler: handler });
        });
        this.commands.push({
            info: commandInfo,
            handler: handler
        });
        if (commandInfo?.help?.shortDesc) {
            commandInfo.help.shortDesc = toSingleLine(
                commandInfo.help.shortDesc
            );
        }
        if (commandInfo?.help?.longDesc) {
            commandInfo.help.longDesc = toSingleLine(commandInfo.help.longDesc);
        }
    }

    command(commandName: string): Command | undefined {
        return this.commandsMap.get(commandName);
    }
}

export class MessageCollector {
    onReply?: (reply: Discord.Message) => void;
    onTimeout?: () => void;
    messageReceived: boolean;

    constructor(
        channel: Discord.TextChannel | Discord.DMChannel | Discord.NewsChannel,
        messageFrom?: Discord.User,
        timeout = 1000 * 60 * 5
    ) {
        this.messageReceived = false;
        if (channel instanceof Discord.NewsChannel) {
            throw Error('channel cannot be of type NewsChannel');
        }
        const collector = new Discord.MessageCollector(channel, (message) => {
            return !messageFrom || message.author.id == messageFrom.id;
        }, {
            time: timeout,
            max: 1
        });
        collector.on('collect', (message: Discord.Message) => {
            if (this.onReply) {
                this.onReply(message);
            }
        });
        collector.on('end', () => {
            if (!this.messageReceived && this.onTimeout) {
                this.onTimeout();
            }
        });
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
    updating: boolean;
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
        this.updating = true;
        this.generatePage = generatePage;
    }

    async listen(): Promise<void> {
        const previousBtn = await this.message.react('⬅️');
        const nextBtn = await this.message.react('➡️');
        const filter: Discord.CollectorFilter = () => true;
        const collector = this.message.createReactionCollector(filter, {
            dispose: true,
            time: 1000 * 60 * 15
        });

        const navigatingUser = this.navigatingUser;
        const handleReaction = (
            reaction: Discord.MessageReaction,
            user: Discord.User
        ) => {
            if (this.updating || user != navigatingUser) return;
            if (reaction == nextBtn) this.next();
            if (reaction == previousBtn) this.previous();
        };

        collector.on('collect', handleReaction);
        collector.on('remove', handleReaction);
        collector.on('end', async () => {
            try {
                await nextBtn.remove();
                await previousBtn.remove();
            } catch (err) {
                console.error(err);
            }
        });

        this.updating = false;
    }

    async next() {
        if (this.pageInfo.currentPage < this.pageInfo.lastPage) {
            this.pageInfo.currentPage += 1;
            this.updating = true;
            const embed = await this.generatePage(this.pageInfo.currentPage);
            await this.message.edit(embed);
            this.updating = false;
        }
    }

    async previous() {
        if (this.pageInfo.currentPage > 0) {
            this.pageInfo.currentPage -= 1;
            this.updating = true;
            const embed = await this.generatePage(this.pageInfo.currentPage);
            await this.message.edit(embed);
            this.updating = false;
        }
    }
}

type CommandHandler = (
    message: Discord.Message,
    ...args: string[]
) => Promise<void>;

interface Command {
    info: CommandInfo,
    handler: CommandHandler
}

interface CommandInfo {
    name: string,
    aliases?: string[],
    help?: CommandHelp
}

interface CommandHelp {
    shortDesc: string,
    longDesc?: string,
    arguments?: {[arg: string]: string},
    examples?: string[]
}
export class MessageEmbed extends Discord.MessageEmbed {
    constructor(
        data: Discord.MessageEmbed | Discord.MessageEmbedOptions,
        bot: Bot,
    ) {
        super(data);

        if (!this.footer) {
            this.footer = {
                text: `${bot.client.user.username} v${version}`,
                iconURL: bot.client.user.avatarURL()
            };
        }

        if (!this.hexColor) {
            this.setColor('#800080');
        }
    }
}

function toSingleLine(str: string): string {
    return str.split('\n').join('').replace(/ +/g, ' ');
}