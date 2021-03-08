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
    commands: Commands;

    constructor(client: Discord.Client) {
        this.client = client;
        this.config = config;

        this.commands = new Commands();
        this.commands.add({
            name: 'help',
            help: {
                shortDesc: `Get a list of all commands or learn more about a 
                    command.`,
                arguments: {
                    'command': 'The command to learn more about (Optional).'
                },
                examples: ['help', 'help help']
            }
        }, async (message, command) => {
            if (command) {
                message.channel.send(
                    new MessageEmbed(this.commands.help(command), this)
                );
            } else {
                message.channel.send(new MessageEmbed({
                    title: `${this.client.user.username} help`,
                    description: 'Here is the list of available commands:',
                    fields: this.commands.list().map((info) => {
                        return {
                            name: `${this.config.commandPrefix}${info.name}`,
                            value: info.help ?
                                info.help.shortDesc : 'No description',
                            inline: false
                        };
                    })
                }, this));
            }
        });

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

    private async messageHandler(commands: Commands, message: Discord.Message) {
        if (message.content.startsWith(this.config.commandPrefix)) {
            const command = message.content.substring(
                this.config.commandPrefix.length
            ).split(' ')[0];
            if (commands.exists(command)) {
                const args = message.content.split(' ').slice(1).map((arg) => {
                    return arg.toLowerCase();
                });
                try {
                    await commands.execute(command, message, args);
                } catch (err) {
                    console.error(err);
                    this.sendError(
                        message.channel,
                        err.message || 'An unexpected has error occurred.'
                    );
                }
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

class Commands {
    private commands: Map<string, Command>;
    private commandInfoList: CommandInfo[];

    constructor() {
        this.commands = new Map();
        this.commandInfoList = [];
    }

    add(command: CommandInfo, handler: CommandHandler) {
        [command.name, ...command.aliases || []].map((cmd) => {
            this.commands.set(cmd, { info: command, handler: handler });
        });
        this.commandInfoList.push(command);
        if (command?.help?.shortDesc) {
            command.help.shortDesc = toSingleLine(command.help.shortDesc);
        }
        if (command?.help?.longDesc) {
            command.help.longDesc = toSingleLine(command.help.longDesc);
        }
    }

    exists(command: string): boolean {
        return this.commands.has(command);
    }

    async execute(
        command: string,
        message: Discord.Message,
        args: string[] = []
    ) {
        await this.commands.get(command).handler.apply(
            null,
            [message, ...args]
        );
    }

    list(): CommandInfo[] {
        return this.commandInfoList;
    }

    help(command: string): Discord.MessageEmbedOptions {
        const cmd = this.commands.get(command);
        if (!cmd) {
            return {
                'title': 'Command not found',
                'color': '#ff0000',
                'description': `The command \`${command}\` does not exist.`
            };
        }

        const help = cmd.info.help;
        const fields: Discord.EmbedField[] = [];

        if (help) {
            if (cmd.info.aliases) {
                fields.push({
                    name: 'Aliases',
                    value: cmd.info.aliases.map((alias) => `\`${alias}\``)
                        .join(', '),
                    inline: false
                });
            }
            if (help.arguments) {
                const argNames = [];
                const args = [];
                for (const arg in help.arguments) {
                    argNames.push(arg);
                    const argDesc = toSingleLine(help.arguments[arg]);
                    args.push(`**${arg}**: ${argDesc}`);
                }
                fields.push({
                    name: 'Usage',
                    value: `\`${config.commandPrefix}${cmd.info.name} `
                        + argNames.map((arg) => `<${arg}>`).join(' ') + '`',
                    inline: false
                });
                fields.push({
                    name: 'Arguments',
                    value: args.join('\n'),
                    inline: false
                });
            }
            if (help.examples) {
                fields.push({
                    name: help.examples.length > 1 ? 'Examples' : 'Example',
                    value: help.examples.map((ex) => {
                        return `\`${config.commandPrefix + ex}\``;
                    }).join(', '),
                    inline: false
                });
            } 
        }

        const noInfoString = 'No help information exists for this command.';
        let desc = help?.shortDesc || noInfoString;
        if (help?.longDesc) {
            desc += `\n\n${help.longDesc}`;
        }

        return {
            title: `${cmd.info.name} command help`,
            description: desc,
            fields: fields
        };
    }
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