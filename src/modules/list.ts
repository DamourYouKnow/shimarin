import * as Discord from 'discord.js';
import { 
    Bot, 
    Module, 
    MessageEmbed, 
    EmbedNavigator 
} from '../bot';
import * as AniList from '../anilist';

export default class extends Module {
    constructor(bot: Bot) {
        super(bot);

        this.addCommand({
            name: 'anilist',
            aliases: ['list'],
            help: {
                shortDesc: `Gets a section of a AniList user's anime or manga 
                    list`,
                longDesc: `The user's list of completed anime will be returned 
                    if no other arguments are provided.`,
                arguments: {
                    'username': 'AniList username.',
                    'type': `\`anime\` or \`manga\``,
                    'section': `\`completed\`, \`watching\`, \`reading\`, 
                        \`planned\` or \`dropped\`.`
                },
                examples: [
                    'anilist DamourYouKnow',
                    'anilist DamourYouKnow manga planned',
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
        
            await postMediaList(bot, message, username, filter);
        });
        
        this.addCommand({
            name: 'watching',
            help: {
                shortDesc: `Gets the list of anime that a AniList user is 
                    currently watching.`,
                arguments: {
                    'username': 'AniList username.'
                },
                examples: ['watching DamourYouKnow']
            }
        }, async (message, username) => {
            await postMediaList(bot, message, username, {
                type: 'ANIME',
                status: 'CURRENT'
            });
        });
        
        this.addCommand({
            name: 'reading',
            help: {
                shortDesc: `Gets the list of manga that a AniList user is 
                    currently reading.`,
                arguments: {
                    'username': 'AniList username.'
                },
                examples: ['reading DamourYouKnow']
            }
        }, async (message, username) => {
            await postMediaList(bot, message, username, {
                type: 'MANGA',
                status: 'CURRENT'
            });
        });
    }
}

async function postMediaList(
    bot: Bot,
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
        mediaListEmbed(bot, user, mediaListPageView, filter)
    );

    const pageInfo = mediaListPageView.content.info;
    if (pageInfo.total > pageInfo.perPage) {
        await new EmbedNavigator(
            response,
            message.author,
            pageInfo,
            async (page) => {
                await response.edit(mediaListEmbed(
                    bot,
                    user,
                    await AniList.getMediaListPage(
                        user.id,
                        filter,
                        page,
                        viewer
                    ),
                    filter
                ));  
            }
        ).listen();
    }
}

function mediaListEmbed(
    bot: Bot,
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
            `[Link - AniList Account required](${url})` : `[Link](${url})`;
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

    return new MessageEmbed({
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
