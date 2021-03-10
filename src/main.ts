import * as Discord from 'discord.js';
import * as AniList from './anilist';
import * as Bot from './bot';
import * as Data from './data';


const bot = new Bot.Bot(new Discord.Client());
bot.login();

bot.commands.add({
    name: 'ping',
    help: {
        shortDesc: 'Replies with pong!',
        longDesc: 'This command is implemented for developer testing.',
        examples: ['ping']
    }
}, async (message) => {
    await message.channel.send('pong!');
});

bot.commands.add({
    name: 'connect'
}, async (message) => {
    // TODO: Ensure these exist before bot runs.
    const clientId = bot.config.anilist.api_client_id;
    const clientSecret = bot.config.anilist.api_client_secret
        || process.env.ANILIST_API_SECRET;

    const oauthUrl = AniList.oauthUrl
        + `?client_id=${clientId}`
        + `&redirect_uri${AniList.redirectUri}&response_type=code`;

    const createCollector = (
        dmChannel: Discord.DMChannel
    ): Discord.MessageCollector => {
        return new Discord.MessageCollector(
            dmChannel,
            (m) => m.author.id == message.author.id,
            { time: 1000 * 60 * 5, max: 1 }
        );
    };

    const authCodeRequest = async (
        dmChannel: Discord.DMChannel,
        user: AniList.User
    ): Promise<void> => {
        await bot.sendEmbed(
            dmChannel,
            'Connect your AniList account',
            `Click [here](${oauthUrl}) to log into your AniList account.`
                + ` Send me your authentication code once you have given`
                + ` me access.\n\nDo not share this code with anyone else.`
        );
        createCollector(dmChannel).on('collect', async (dm) => {
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
                        'The authentication code you have provided is invalid'
                    );
                }
                const success = await AniList.testConnection(user.id, token);
                if (success) {
                    await Data.addAccountConnection(
                        message.author.id,
                        String(user.id),
                        authCode
                    );
                    await bot.sendEmbed(
                        dmChannel,
                        'Account connected',
                        `You have successfully connected your AniList account.`
                    );
                } else {
                    await bot.sendError(
                        dmChannel,
                        `Your authentication code could not be linked to the `
                            + `account **${user.name}**. Are you sure the `
                            + `provided username matches the account you `
                            + `logged into?`
                    );
                }
            } catch (err) {
                console.log(err);
            }
        });
    };

    const usernameRequest = async (
        dmChannel: Discord.DMChannel
    ): Promise<void> => {
        await bot.sendEmbed(dmChannel,
            'Connect your AniList account',
            'Please enter your AniList username.'
        );
        createCollector(dmChannel).on('collect', async (dm) => {
            try {
                const username = dm.content.split(' ')[0] || '';
                const user = await AniList.searchUser(username);
                if (user) {
                    await authCodeRequest(dmChannel, user);
                } else {
                    await bot.sendError(
                        dmChannel,
                        `No AniList profile for **${username}** was found.`
                    );
                }
            } catch (err) {
                console.log(err);
            }
        });
    };
    
    let dmChannel = message.author.dmChannel;

    try {
        if (!dmChannel) {
            dmChannel = await message.author.createDM();
        }
        await usernameRequest(dmChannel);
    } catch {
        await bot.sendError(
            message.channel,
            'I had trouble direct messaging the instructions to connect'
                + ' your AniList account.'
        );
    }

    if (message.channel.type != 'dm') {
        await bot.sendEmbed(
            message.channel,
            'Connect your AniList account',
            'Instructions for connecting your AniList account have been sent'
                + ' to your direct messages.'
        );
    }
});

bot.commands.add({
    name: 'watching',
    help: {
        shortDesc: `Gets the list of anime that a AniList user is currently 
            watching.`,
        arguments: {
            'username': 'AniList username.'
        },
        examples: ['watching DamourYouKnow']
    }
}, async (message, username) => {
    await postMediaList(message, username, 'ANIME', 'CURRENT');
});

bot.commands.add({
    name: 'reading',
    help: {
        shortDesc: `Gets the list of manga that a AniList user is currently 
            reading.`,
        arguments: {
            'username': 'AniList username.'
        },
        examples: ['reading DamourYouKnow']
    }
}, async (message, username) => {
    await postMediaList(message, username, 'MANGA', 'CURRENT');
});

bot.commands.add({
    name: 'anilist',
    aliases: ['list'],
    help: {
        shortDesc: `Gets a section of a AniList user's anime or manga list`,
        longDesc: `The user's list of completed anime will be returned if no 
            other arguments are provided.`,
        arguments: {
            'username': 'AniList username.',
            'type': `\`anime\` or \`manga\``,
            'section': `\`completed\`, \`watching\`, \`reading\`, \`planned\` 
                or \`dropped\`.`
        },
        examples: [
            'list DamourYouKnow',
            'list DamourYouKnow manga planned',
        ]
    }
}, async (message, username, ...args) => {
    const argSet = new Set(args);
    
    let type: AniList.MediaListType = 'ANIME';
    if (argSet.has('manga')) type = 'MANGA';

    let status: AniList.MediaListStatus = 'COMPLETED';
    if (argSet.has('watching') || argSet.has('reading')) status = 'CURRENT';
    if (argSet.has('dropped')) status = 'DROPPED';
    if (argSet.has('planned')) status = 'PLANNING';

    await postMediaList(message, username, type, status);
});

async function postMediaList(
    message: Discord.Message,
    username: string,
    type: AniList.MediaListType,
    status: AniList.MediaListStatus
): Promise<void> {
    if (!username) {
        bot.sendError(message.channel, 'No AniList username was provided.');
        return;
    }
    const user = await AniList.searchUser(username);
    if (!user) {
        bot.sendError(
            message.channel,
            `No AniList profile for **${username}** was found.`
        );
        return;
    }

    const mediaList = await AniList.getMediaListPage(user.id, type, status, 0);
    const response = await message.channel.send(
        mediaListEmbed(user, mediaList)
    );

    if (mediaList.pageInfo.total > mediaList.pageInfo.perPage) {
        await new Bot.EmbedNavigator(
            response,
            message.author,
            mediaList.pageInfo,
            async (page) => {
                return mediaListEmbed(
                    user,
                    await AniList.getMediaListPage(user.id, type, status, page)
                );
            }
        ).listen();
    }
}

function mediaListEmbed(
    user: AniList.User,
    mediaList: AniList.MediaListPage
): Discord.MessageEmbed {
    const colors: {[color: string]: string}  = {
        'blue': '#3db4f2',
        'purple': '#c063ff', 
        'pink': '#fc9dd6',
        'orange': '#ef881a',
        'red': '#e13333', 
        'green': '#4cca51',
        'gray': '#677b94'
    };

    const profileColor = user.options.profileColor || '#dec027';
    const embedColor = profileColor.startsWith('#') ?
        profileColor : colors[profileColor];

    const fields = mediaList.entries.map((entry) => {
        const media = entry.media;
        const resource = `${mediaList.type.toLowerCase()}/${entry.media.id}/`;
        const url = `https://anilist.co/${resource}`;
        const urlLabel = media.isAdult ? 
            `[Link (NSFW)](${url})` : `[Link](${url})`;
        const maxCount = { 
            'ANIME': media.episodes, 'MANGA': media.chapters
        }[mediaList.type];
        const count = `${entry.progress} / ${maxCount || '?'}`;
        const title = media.title.english
            || media.title.romaji 
            || media.title.native;
        return {
            name: title,
            value: `Progress: \`${count}\`\n${urlLabel}`
        };
    });

    type StatusTypeLabels = {
        [type in AniList.MediaListType]: {
            [status in AniList.MediaListStatus]: string
        }
    };

    const listLabels: StatusTypeLabels = {
        'ANIME': {
            'COMPLETED': 'completed anime list',
            'CURRENT': 'watchlist',
            'DROPPED': 'dropped anime list',
            'PAUSED': 'paused anime list',
            'PLANNING': 'plan to watch list',
            'REPEATING': 're-watching list'
        },
        'MANGA': {
            'COMPLETED': 'completed manga list',
            'CURRENT': 'readlist',
            'DROPPED': 'dropped manga list',
            'PAUSED': 'paused manga list',
            'PLANNING': 'plan to read list',
            'REPEATING': 're-reading list'
        }
    };
    const urlTypes: {[type in AniList.MediaListType]: string} = {
        'ANIME': 'animelist',
        'MANGA': 'mangalist'
    };
    const urlStatuses: StatusTypeLabels = {
        'ANIME': {
            'COMPLETED': 'Completed',
            'CURRENT': 'Watching',
            'DROPPED': 'Dropped',
            'PAUSED': 'Paused',
            'PLANNING': 'Planning',
            'REPEATING': 'Rewatching'
        },
        'MANGA': {
            'COMPLETED': 'Completed',
            'CURRENT': 'Reading',
            'DROPPED': 'Dropped',
            'PAUSED': 'Paused',
            'PLANNING': 'Planning',
            'REPEATING': 're-reading list'
        }
    };

    const userUrl = `https://anilist.co/user/${user.name}`;
    const urlType = urlTypes[mediaList.type];
    const urlStatus = urlStatuses[mediaList.type][mediaList.status];

    const currentPage = mediaList.pageInfo.currentPage;
    const lastPage = mediaList.pageInfo.lastPage;

    const description = mediaList.pageInfo.total == 0 ?
        'There are no entries in this list.' :
        mediaList.pageInfo.total > mediaList.pageInfo.perPage ?
            `Page ${currentPage} / ${lastPage}` : undefined;

    return new Bot.MessageEmbed({
        color: embedColor,
        title: `${user.name}'s ${listLabels[mediaList.type][mediaList.status]}`,
        url: `${userUrl}/${urlType}/${urlStatus}`,
        thumbnail: {
            url: user.avatar.medium,
        },
        fields: fields,
        description: description
    }, bot);
}
