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
    id: number,
    name: string,
    options: {
        profileColor: string
    },
    avatar: {
        medium: string
    }
}
interface MediaList {
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
    const user = await searchUser(username);
    const mediaList = await getMediaListPage(user.id, 'ANIME', 'CURRENT');
    const response = await message.channel.send(
        mediaListEmbed(user, mediaList)
    );
    new EmbedNavigator(
        response,
        message.author,
        mediaList.pageInfo,
        async (page) => {
            return mediaListEmbed(
                user,
                await getMediaListPage(user.id, 'ANIME', 'CURRENT', page)
            );
        }
    ).listen();
});

commands.add({name: 'reading'}, async (message, username) => {
    const user = await searchUser(username);
    const mediaList = await getMediaListPage(user.id, 'MANGA', 'CURRENT');
    const response = await message.channel.send(
        mediaListEmbed(user, mediaList)
    );
    new EmbedNavigator(
        response,
        message.author,
        mediaList.pageInfo,
        async (page) => {
            return mediaListEmbed(
                user,
                await getMediaListPage(user.id, 'MANGA', 'CURRENT', page)
            );
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

    const user = await searchUser(username);
    const mediaList = await getMediaListPage(user.id, type, status, 0);
    const response = await message.channel.send(
        mediaListEmbed(user, mediaList)
    );
    new EmbedNavigator(
        response,
        message.author,
        mediaList.pageInfo,
        async (page) => {
            return mediaListEmbed(
                user,
                await getMediaListPage(user.id, type, status, page)
            )
        }
    ).listen();
});

async function searchUser(username: string): Promise<AniListUser | null> {
    if (!username) return null;
    const response = await http.post('https://graphql.anilist.co', {
        query: `query ($username: String) {    
            User(name: $username) {
                id
                name
                options {
                    profileColor
                }
                avatar {
                    medium
                }
            }
        }`,
        variables: {
            username: username
        }
    });
    const results = response.data.data.User as AniListUser;
    return results;
}

async function getMediaListPage(
    userId: number,
    type: MediaListType,
    status: MediaListStatus,
    page: number = 0
): Promise<MediaListPage> {
    const response = await http.post('https://graphql.anilist.co', {
        query: `query (
            $userId: Int,
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
                    userId: $userId,
                    type: $type,
                    status: $status
                    sort: [UPDATED_TIME_DESC]
                ) {
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
        }`,
        variables: {
            userId: userId,
            type: type,
            status: status,
            page: page,
            perPage: 10
        }
    }, {timeout: 1000});
    const results = response.data.data.Page.mediaList;
    return {
        entries: results as MediaListItem[],
        type: type,
        status: status,
        pageInfo: response.data.data.Page.pageInfo as PageInfo
    }
}

function mediaListEmbed(
    user: AniListUser,
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

    const profileColor = user.options.profileColor || '#dec027';
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

async function sleep(time: number) {
    return new Promise((resolve, _) => {
        setTimeout(resolve, time);
    });
}

// Pass messages to message handler.
client.on('message', (message) => {
    Helpers.messageHandler(commands, message);
});

Helpers.login(client);
