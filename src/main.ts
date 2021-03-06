import * as Discord from 'discord.js';
import http from 'axios';
import { Helpers } from './helpers';


const client = new Discord.Client();

client.on('ready', () => {
    console.log(`Logged in as ${client.user.tag}`);
});

const commands = new Helpers.Commands();

// Add your commands here...
commands.add({name: 'ping'}, (message) => {
    message.channel.send('pong!');
});

interface AniListUser {
    name: string,
    options: {
        profileColor: string
    },
    avatar: {
        medium: string
    }
}
interface MediaList {
    user: AniListUser,
    type: MediaListType,
    status: MediaListStatus
    entries: MediaListItem[]
}

interface MediaListPage extends MediaList {
    pageInfo: PageInfo
}

interface MediaListItem {
    media: Media,
    progress: number | null;
}

interface Media {
    id: number,
    title: {
        english: string | null,
        romaji: string | null,
        native: string | null
    },
    chapters: number | null
    episodes: number | null
}

interface PageInfo {
    total: number,
    perPage: number,
    currentPage: number,
    lastPage: number,
    hasNextPage: number
}

type MediaListType = 'ANIME' | 'MANGA';

type MediaListStatus = 'CURRENT' | 'PLANNING' | 'COMPLETED' | 'DROPPED'
    | 'PAUSED' | 'REPEATING';


class EmbedNavigator {
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

commands.add({name: 'watching'}, async (message, username) => {
    const mediaList = await getMediaListPage(username, 'ANIME', 'CURRENT');
    const response = await message.channel.send(mediaListEmbed(mediaList));
    new EmbedNavigator(
        response,
        message.author,
        mediaList.pageInfo,
        async (page) => {
            return mediaListEmbed(
                await getMediaListPage(username, 'ANIME', 'CURRENT', page))
        }
    ).listen();
});

commands.add({name: 'reading'}, async (message, username) => {
    const mediaList = await getMediaListPage(username, 'MANGA', 'CURRENT');
    const response = await message.channel.send(mediaListEmbed(mediaList));
    new EmbedNavigator(
        response,
        message.author,
        mediaList.pageInfo,
        async (page) => {
            return mediaListEmbed(
                await getMediaListPage(username, 'MANGA', 'CURRENT', page))
        }
    ).listen();
});

commands.add({name: 'list'}, async (message, username, ...args) => {
    const argSet = new Set(args);
    
    let type: MediaListType = 'ANIME';
    if (argSet.has('manga')) type = 'MANGA';

    let status: MediaListStatus = 'COMPLETED';
    if (argSet.has('watching')) status = 'CURRENT';
    if (argSet.has('dropped')) status = 'DROPPED';
    if (argSet.has('planned')) status = 'PLANNING';

    const mediaList = await getMediaListPage(username, type, status, 0);
    const response = await message.channel.send(mediaListEmbed(mediaList));
    new EmbedNavigator(
        response,
        message.author,
        mediaList.pageInfo,
        async (page) => {
            return mediaListEmbed(
                await getMediaListPage(username, type, status, page))
        }
    ).listen();
});

async function getMediaListPage(
    username: string,
    type: MediaListType,
    status: MediaListStatus,
    page: number = 0
): Promise<MediaListPage> {
    const query = `
    query (
        $username: String,
        $type: MediaType,
        $status: MediaListStatus,
        $page: Int,
        $perPage: Int
    ) {
        Page (page: $page, perPage: $perPage) {
            pageInfo {
                total
                currentPage
                lastPage
                hasNextPage
                perPage
            }
            mediaList (
                userName: $username,
                type: $type,
                status: $status
                sort: [UPDATED_TIME_DESC]
            ) {
                user {
                    name
                    options {
                        profileColor
                    }
                    avatar {
                        medium
                    }
                }
                media {
                    id
                    title {
                        english
                        romaji
                        native
                    }
                    episodes
                    chapters
                }
                progress
            }
        }
    }
    `; 
    const response = await http.post('https://graphql.anilist.co', {
        query: query,
        variables: {
            username: username,
            type: type,
            status: status,
            page: page,
            perPage: 10
        }
    });
    const results = response.data.data.Page.mediaList;
    // FIXME: user will not be returned if media list is empty.
    const user = results[0]?.user;
    return {
        user: user as AniListUser,
        entries: results as MediaListItem[],
        type: type,
        status: status,
        pageInfo: response.data.data.Page.pageInfo as PageInfo
    }
}

function mediaListEmbed(
    mediaList: MediaListPage
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

    const user = mediaList.user;
    const profileColor = mediaList.user.options.profileColor || '#dec027';
    const embedColor = profileColor.startsWith('#') ?
        profileColor : colors[profileColor];

    const fields = mediaList.entries.map((entry) => {
        const media = entry.media;
        const resource = `${mediaList.type.toLowerCase()}/${entry.media.id}/`;
        const url = `https://anilist.co/${resource}`;
        const maxCount = { 
            'ANIME': media.episodes, 'MANGA': media.chapters
        }[mediaList.type];
        const count = `${entry.progress} / ${maxCount || '?'}`;
        const title = media.title.english
            || media.title.romaji 
            || media.title.native
        return {
            name: title,
            value: `${count.padEnd(15, ' ')}[Link](${url})`
        }
    });

    const listLabels: {
        [type in MediaListType]: {[status in MediaListStatus]: string}
    } = {
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

    const currentPage = mediaList.pageInfo.currentPage;
    const lastPage = mediaList.pageInfo.lastPage;

    return new Discord.MessageEmbed({
        color: embedColor,
        title: `${user.name}'s ${listLabels[mediaList.type][mediaList.status]}`,
        url: `https://anilist.co/user/${user.name}/animelist/Watching`,
        thumbnail: {
            url: user.avatar.medium,
        },
        fields: fields,
        footer: {
            text: `Page ${currentPage} / ${lastPage}`
        }
    });
}

// Pass messages to message handler.
client.on('message', (message) => {
    Helpers.messageHandler(commands, message);
});

Helpers.login(client);
