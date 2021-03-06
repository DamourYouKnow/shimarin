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
    name: 'connect',
    help: {
        'shortDesc': 'Connects your AniList account.',
        'longDesc': `Connecting your account will allow you to use features 
            that require verifying your account or reading your account data.`
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

    const usernameRequest = async (): Promise<void> => {
        await bot.sendEmbed(dmChannel,
            'Connect your AniList account',
            'Please enter your AniList username.'
        );
        const collector = new Bot.MessageCollector(dmChannel);
        collector.onReply = async (dm) => {
            try {
                const username = dm.content.split(' ')[0] || '';
                const user = await AniList.searchUser(username);
                if (user) {
                    await authCodeRequest(user);
                } else {
                    await bot.sendError(
                        dmChannel,
                        `No AniList profile for **${username}** was found.`
                    );
                }
            } catch (err) {
                console.log(err);
            }
        };
    };

    const authCodeRequest = async (user: AniList.User): Promise<void> => {
        await bot.sendEmbed(
            dmChannel,
            'Connect your AniList account',
            `Click [here](${oauthUrl}) to log into your AniList account.`
                + ` Send me your authentication code once you have given`
                + ` me access.\n\nDo not share this code with anyone else.`
        );
        const collector = new Bot.MessageCollector(dmChannel);
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
                        'The authentication code you have provided is invalid.'
                    );
                    return;
                }
                const success = await AniList.testConnection(user.id, token);
                if (success) {
                    await Data.addAccountConnection(
                        message.author.id,
                        String(user.id),
                        token
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
        };
    };

    try {
        if (!dmChannel) {
            dmChannel = await message.author.createDM();
        }
        await usernameRequest();
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
            'Instructions for connecting your AniList account have been '
                + 'sent to your direct messages.'
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
    await postMediaList(message, username, {
        type: 'ANIME',
        status: 'CURRENT'
    });
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
    await postMediaList(message, username, {
        type: 'MANGA',
        status: 'CURRENT'
    });
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
    const filter: AniList.MediaListFilter = {
        type: 'ANIME',
        status: 'COMPLETED'
    };
    
    if (argSet.has('manga')) filter.type = 'MANGA';

    if (argSet.has('watching') || argSet.has('reading')) {
        filter.status = 'CURRENT';
    }
    if (argSet.has('dropped')) filter.status = 'DROPPED';
    if (argSet.has('planned')) filter.status = 'PLANNING';

    await postMediaList(message, username, filter);
});

async function postMediaList(
    message: Discord.Message,
    username: string,
    filter: AniList.MediaListFilter
): Promise<void> {
    if (!username) {
        bot.sendError(message.channel, 'No AniList username was provided.');
        return;
    }

    const sendNotFound = async (): Promise<void> => {
        bot.sendError(
            message.channel,
            `No AniList profile for **${username}** was found.`
        );
    };

    const viewer = await AniList.getViewer(message.author.id);
    const user = await AniList.searchUser(username);
    if (!user) {
        await sendNotFound();
        return;
    }

    const mediaListPageView = await AniList.getMediaListPage(
        user.id,
        filter,
        0,
        viewer
    );
    if (!mediaListPageView) {
        await sendNotFound();
        return;
    }

    const response = await message.channel.send(
        mediaListEmbed(user, mediaListPageView, filter)
    );

    const pageInfo = mediaListPageView.content.info;
    if (pageInfo.total > pageInfo.perPage) {
        await new Bot.EmbedNavigator(response,
            message.author,
            pageInfo,
            async (page) => {
                return mediaListEmbed(
                    user,
                    await AniList.getMediaListPage(
                        user.id,
                        filter,
                        page,
                        viewer
                    ),
                    filter
                );
            }
        ).listen();
    }
}

function mediaListEmbed(
    user: AniList.User,
    mediaListPageView: AniList.View<AniList.Page<AniList.MediaListItem>>,
    filter: AniList.MediaListFilter
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

    const mediaList = mediaListPageView.content.items;
    const pageInfo = mediaListPageView.content.info;
    const viewer = mediaListPageView.viewer;

    const profileColor = user.options.profileColor || '#dec027';
    const embedColor = profileColor.startsWith('#') ?
        profileColor : colors[profileColor];

    const fields = mediaList.map((entry) => {
        const media = entry.media;
        const resource = `${filter.type.toLowerCase()}/${entry.media.id}/`;
        const url = `https://anilist.co/${resource}`;
        const urlLabel = media.isAdult ? 
            `[Link (NSFW)](${url})` : `[Link](${url})`;
        const maxCount = { 
            'ANIME': media.episodes, 'MANGA': media.chapters
        }[filter.type];
        const count = `${entry.progress} / ${maxCount || '?'}`;
        const title = media.title;
        const titleOrders: {[lang in AniList.TitleLanguage]: string[]} = {
            'ENGLISH': [title.english, title.romaji, title.native],
            'ROMAJI': [title.romaji, title.english, title.native],
            'NATIVE': [title.native, title.romaji, title.english]
        };
        const titleOrder = viewer ?
            titleOrders[viewer.options.titleLanguage] : titleOrders['ENGLISH'];
        return {
            name: titleOrder.find((title) => title != null) || 'No title',
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
    const urlType = urlTypes[filter.type];
    const urlStatus = urlStatuses[filter.type][filter.status];

    const description = pageInfo.total == 0 ?
        'There are no entries in this list.' :
        pageInfo.total > pageInfo.perPage ?
            `Page ${pageInfo.currentPage} / ${pageInfo.lastPage}` : undefined;

    return new Bot.MessageEmbed({
        color: embedColor,
        title: `${user.name}'s ${listLabels[filter.type][filter.status]}`,
        url: `${userUrl}/${urlType}/${urlStatus}`,
        thumbnail: {
            url: user.avatar.medium,
        },
        fields: fields,
        description: description
    }, bot);
}
