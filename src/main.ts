import * as Discord from 'discord.js';
import { type } from 'node:os';
import { getConfigFileParsingDiagnostics } from 'typescript';
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

    const authCodeRequest = async (): Promise<void> => {
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
            'Instructions for connecting your AniList account have been '
                + 'sent to your direct messages.'
        );
    }
});

bot.commands.add({
    name: 'anime',
    help: {
        shortDesc: 'Search for information about an anime',
        arguments: {
            'title': 'Anime title'
        },
        examples: ['anime yuru camp']
    }
}, async (message) => {
    await mediaSearch(message, 'ANIME');
});

bot.commands.add({
    name: 'manga',
    help: {
        shortDesc: 'Search for information about a manga',
        arguments: {
            'title': 'Manga title'
        },
        examples: [`manga komi can't communicate`]
    }
}, async (message) => {
    await mediaSearch(message, 'MANGA');
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

async function mediaSearch(message: Discord.Message, type: AniList.MediaType) {
    const search = message.content.split(' ').slice(1).join(' ');
    if (!search) {
        await bot.sendError(
            message.channel,
            `No ${type.toLowerCase()} title was provided.`
        );
        return;
    }
    const viewer = await AniList.getViewer(message.author.id);
    const mediaSearchView = await AniList.getMediaSearchPage(
        search,
        { type: type },
        0,
        viewer
    );
    const results = mediaSearchView.content.items;
    if (results.length == 0) {
        await bot.sendEmbed(
            message.channel,
            'No results found',
            'Double check your search query and try again.'
        );
        return;
    }
    if (results.length == 1) {
        await message.channel.send(mediaEmbed({
            content: results[0],
            viewer: viewer
        }));
        return;
    }
    const response = await message.channel.send(mediaSearchEmbed(
        mediaSearchView
    ));
    const collector = new Bot.MessageCollector(message.channel, message.author);
    collector.onReply = (reply) => {
        const selected = Number(reply.content);
        if (!isNaN(selected) && selected >= 1 && selected <= results.length) {
            response.edit(mediaEmbed({
                content: results[selected-1],
                viewer: viewer
            })).catch(console.error);
        }
    };
}

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

function mediaEmbed(
    mediaView: AniList.View<AniList.Media>
): Discord.MessageEmbed {
    const media = mediaView.content;
    return new Bot.MessageEmbed({
        title: AniList.mediaDisplayTitle(media.title),
        url: media.siteUrl,
        thumbnail: {
            url: media.coverImage.medium,
        },
        description: media.description
            .replace(/(<br>)+/g, '\n\n')
            .replace(/(\n\n)+/g, '\n\n')
            .replace(/<i>/g, '*').replace(/<\/i>/g, '*'),
        fields: [
            {
                name: 'Format',
                value: AniList.mediaFormatLabels[media.format],
                inline: true
            },
            {
                name: 'Average score',
                value: `${(media.averageScore / 10).toFixed(1)} / 10`,
                inline: true
            },
            {
                name: 'Genres',
                value: media.genres.join(', ') || 'None',
                inline: true,
            }
        ]
    }, bot);
} 

function mediaSearchEmbed(
    mediaSearchView: AniList.View<AniList.Page<AniList.Media>>
): Discord.MessageEmbed {
    const mediaList = mediaSearchView.content;
    const viewer = mediaSearchView.viewer;
    const fields = mediaList.items.map((media, i) => {
        return {
            name: `${i+1}. ${AniList.mediaDisplayTitle(media.title, viewer)}`,
            value: AniList.mediaFormatLabels[media.format] || 'No format'
        };
    });
    return new Bot.MessageEmbed({
        title: 'Search results',
        description: 'Enter the number of the content you are looking for.',
        fields: fields
    }, bot);
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
        return {
            name: AniList.mediaDisplayTitle(media.title, viewer),
            value: `Progress: \`${count}\`\n${urlLabel}`
        };
    });

    type StatusTypeLabels = {
        [type in AniList.MediaType]: {
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
    const urlTypes: {[type in AniList.MediaType]: string} = {
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
