import * as Discord from 'discord.js';
import * as Data from '../data';
import { Bot, Module, MessageCollector, MessageEmbed } from '../bot';
import * as AniList from '../anilist';

export default class extends Module {
    constructor(bot: Bot) {
        super(bot);

        this.addCommand({
            name: 'help',
            help: {
                shortDesc: `Get a list of all commands or learn more about a 
                    command.`,
                arguments: {
                    'command': 'The command to learn more about (Optional).'
                },
                examples: ['help', 'help help']
            }
        }, async (message, commandName) => {
            if (commandName) {
                message.channel.send(
                    new MessageEmbed(help(bot, commandName), bot)
                );
            } else {
                message.channel.send(new MessageEmbed({
                    title: `${bot.client.user.username} help`,
                    description: 'Here is the list of available commands:',
                    fields: bot.commands.map((cmd) => {
                        return {
                            name: `${bot.config.commandPrefix}${cmd.info.name}`,
                            value: cmd.info.help ?
                                cmd.info.help.shortDesc : 'No description',
                            inline: false
                        };
                    })
                }, bot));
            }
        });
        
        this.addCommand({
            name: 'connect',
            help: {
                'shortDesc': 'Connects your AniList account.',
                'longDesc': `Connecting your account will allow you to use 
                    features that require verifying your account or reading 
                    your account data.`
            }
        }, async (message) => {
            // TODO: Ensure these exist before bot runs.
            const clientId = bot.config.anilist.api_client_id;
            const clientSecret = bot.config.anilist.api_client_secret
                || process.env.ANILIST_API_SECRET;
        
            const oauthUrl = AniList.oauthUrl
                + `?client_id=${clientId}`
                + `&redirect_uri${AniList.redirectUri}&response_type=code`;
        
            let dmChannel = message.author.dmChannel;
        
            const intructions = `Click [here](${oauthUrl})`
                + ` to log into your AniList account.`
                + ` Send me your authentication code once you have given`
                + ` me access.\n\nDo not share this code with anyone else.`;
            const authCodeRequest = async (): Promise<void> => {
                await bot.sendEmbed(
                    dmChannel,
                    'Connect your AniList account',
                    intructions
                );
                const collector = new MessageCollector(dmChannel);
                collector.onReply = async (dm) => {
                    try {
                        const authCode = dm.content.split(' ')[0] || '';
                        const token = await AniList.getToken(
                            clientId,
                            clientSecret,
                            authCode
                        );
                        if (!token) {
                            await bot.sendError(
                                dmChannel,
                                'The authentication code you have provided'
                                    +  ' is invalid.'
                            );
                            return;
                        }
                        const viewer = await AniList.getViewerFromToken(token);
                        await Data.addAccountConnection(
                            message.author.id,
                            String(viewer.id),
                            token
                        );
                        await bot.sendEmbed(
                            dmChannel,
                            'Account connected',
                            `Connected to AniList account **${viewer.name}**.`
                        );
                    } catch (err) {
                        console.log(err);
                        await bot.sendError(
                            dmChannel,
                            'I had trouble connecting to your AniList account.'
                        );
                    }
                };
            };
        
            try {
                if (!dmChannel) {
                    dmChannel = await message.author.createDM();
                }
                await authCodeRequest();
            } catch {
                await bot.sendError(
                    message.channel,
                    'I had trouble direct messaging the instructions to connect'
                        + ' your AniList account.'
                );
                return;
            }
        
            if (message.channel.type != 'dm') {
                await bot.sendEmbed(
                    message.channel,
                    'Connect your AniList account',
                    'Instructions for connecting your AniList account have'
                        + ' been sent to your direct messages.'
                );
            }
        });
    }
}

function help(bot, commandName: string): Discord.MessageEmbedOptions {
    const cmd = bot.command(commandName);
    if (!cmd) {
        return {
            'title': 'Command not found',
            'color': '#ff0000',
            'description': `The command \`${commandName}\` does not exist.`
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
                value: `\`${bot.config.commandPrefix}${cmd.info.name} `
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
                    return `\`${bot.config.commandPrefix + ex}\``;
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

function toSingleLine(str: string): string {
    return str.split('\n').join('').replace(/ +/g, ' ');
}